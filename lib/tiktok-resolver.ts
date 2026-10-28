export interface ResolvedTikTokVideo {
  playUrl: string;
  wmPlayUrl?: string;
  backupPlayUrls?: string[];
  coverUrl?: string;
  title?: string;
  authorName?: string;
  authorHandle?: string;
  duration?: number;
  isAd?: boolean;
  isCommerce?: boolean;
  videoId?: string;
}

// Shared in-memory cache across warm server invocations
const videoCache = new Map<string, { data: ResolvedTikTokVideo; expiresAt: number }>();
const thumbCache = new Map<string, { coverUrl: string; title?: string; authorHandle?: string; expiresAt: number }>();

// In-flight deduplication map so concurrent requests for the same URL share one promise
const inFlightMap = new Map<string, Promise<ResolvedTikTokVideo | null>>();

// Serial rate-limit queue for TikWM (free tier allows 1 request / second per IP)
let tikwmQueue: Promise<any> = Promise.resolve();
let lastTikwmCallAt = 0;

export function extractTikTokVideoId(rawUrl: string): string | null {
  const trimmed = String(rawUrl || '').trim();
  const idMatch =
    trimmed.match(/tiktok\.com\/(?:@[^/]+\/(?:video|photo)|v|embed\/v2|player\/v1)\/(\d+)/i) ||
    trimmed.match(/[?&]item_id=(\d+)/i);
  return idMatch?.[1] || null;
}

function canonicalizeTikTokUrl(rawUrl: string): string {
  const trimmed = String(rawUrl || '').trim();
  const videoId = extractTikTokVideoId(trimmed);
  if (videoId) {
    return `https://www.tiktok.com/video/${videoId}`;
  }
  return trimmed.split('?')[0];
}

function enqueueTikwmCall<T>(fn: () => Promise<T>): Promise<T> {
  const next = tikwmQueue.then(async () => {
    const now = Date.now();
    const elapsed = now - lastTikwmCallAt;
    if (elapsed < 1150) {
      await new Promise(r => setTimeout(r, 1150 - elapsed));
    }
    lastTikwmCallAt = Date.now();
    return fn();
  });
  tikwmQueue = next.catch(() => {});
  return next;
}

function decodeHtmlEntities(str: string): string {
  return String(str || '')
    .replace(/&amp;/g, '&')
    .replace(/&#x26;/gi, '&')
    .replace(/&#38;/g, '&')
    .replace(/&quot;/g, '"');
}

/**
 * Pure oEmbed helper (never calls resolveTikTokVideoServer, preventing any circular dependency).
 */
async function fetchTikTokOembedOnly(rawUrl: string): Promise<{
  coverUrl: string;
  title?: string;
  authorHandle?: string;
} | null> {
  const cleanOembedTarget = rawUrl.split('?')[0];
  for (const candidateUrl of Array.from(new Set([cleanOembedTarget, rawUrl]))) {
    try {
      const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(candidateUrl)}`;
      const res = await fetch(oembedUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.thumbnail_url) {
          return {
            coverUrl: String(data.thumbnail_url),
            title: String(data.title || ''),
            authorHandle: String(data.author_unique_id || data.author_name || ''),
          };
        }
      }
    } catch {
      // continue
    }
  }
  return null;
}

/**
 * Fast thumbnail lookup for TikTok videos:
 * 1) Checks in-memory videoCache / thumbCache
 * 2) Tries TikTok oEmbed (~80ms)
 * 3) If oEmbed omits thumbnail_url (common on Spark Ads / regional commercial posts),
 *    falls back to resolveTikTokVideoServer (TikWM) which provides 300x400 cover images.
 */
export async function resolveTikTokThumbnailFast(rawUrl: string): Promise<{
  coverUrl: string;
  title?: string;
  authorHandle?: string;
} | null> {
  const cleanKey = canonicalizeTikTokUrl(rawUrl);
  const now = Date.now();

  const cachedVideo = videoCache.get(cleanKey) || videoCache.get(rawUrl);
  if (cachedVideo && cachedVideo.expiresAt > now && cachedVideo.data.coverUrl) {
    return {
      coverUrl: cachedVideo.data.coverUrl,
      title: cachedVideo.data.title,
      authorHandle: cachedVideo.data.authorHandle,
    };
  }

  const cachedThumb = thumbCache.get(cleanKey) || thumbCache.get(rawUrl);
  if (cachedThumb && cachedThumb.expiresAt > now && cachedThumb.coverUrl) {
    return cachedThumb;
  }

  // Layer 1: Try TikTok oEmbed first
  const oembed = await fetchTikTokOembedOnly(rawUrl);
  if (oembed && oembed.coverUrl) {
    const entry = {
      ...oembed,
      expiresAt: Date.now() + 6 * 60 * 60 * 1000,
    };
    thumbCache.set(cleanKey, entry);
    thumbCache.set(rawUrl, entry);
    return entry;
  }

  // Layer 2: Fallback to full TikTok resolver (TikWM), which reliably returns 300x400 coverUrl
  try {
    const { video } = await resolveTikTokVideoServer(rawUrl);
    if (video && video.coverUrl) {
      const entry = {
        coverUrl: video.coverUrl,
        title: video.title || '',
        authorHandle: video.authorHandle || video.authorName || '',
        expiresAt: Date.now() + 6 * 60 * 60 * 1000,
      };
      thumbCache.set(cleanKey, entry);
      thumbCache.set(rawUrl, entry);
      return entry;
    }
  } catch {
    // ignore fallback error
  }

  return null;
}

/**
 * Resolves cover thumbnail for Instagram Reels, Posts, and Carousels (`instagram.com/reel/...`, `instagram.com/p/...`).
 */
export async function resolveInstagramThumbnailFast(rawUrl: string): Promise<{
  coverUrl: string;
  title?: string;
} | null> {
  const cleanKey = String(rawUrl || '').trim().split('?')[0].replace(/\/$/, '');
  if (!cleanKey) return null;

  const now = Date.now();
  const cachedThumb = thumbCache.get(cleanKey) || thumbCache.get(rawUrl);
  if (cachedThumb && cachedThumb.expiresAt > now && cachedThumb.coverUrl) {
    return cachedThumb;
  }

  const crawlerAgents = [
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    'TelegramBot (like TwitterBot)',
  ];

  for (const ua of crawlerAgents) {
    try {
      const res = await fetch(rawUrl, {
        headers: {
          'User-Agent': ua,
          Accept: 'text/html,application/xhtml+xml',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const html = await res.text();
        const ogImgMatch =
          html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
          html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ||
          html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);

        if (ogImgMatch?.[1]) {
          const coverUrl = decodeHtmlEntities(ogImgMatch[1]);
          const ogTitleMatch =
            html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
            html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
          const entry = {
            coverUrl,
            title: ogTitleMatch?.[1] ? decodeHtmlEntities(ogTitleMatch[1]) : '',
            expiresAt: Date.now() + 6 * 60 * 60 * 1000,
          };
          thumbCache.set(cleanKey, entry);
          thumbCache.set(rawUrl, entry);
          return entry;
        }
      }
    } catch {
      // try next agent
    }
  }

  return null;
}

/**
 * Fallback Layer 2: Scrapes TikTok's universal hydration JSON directly from the video page.
 */
async function fetchFromTikTokPageHydration(rawUrl: string): Promise<ResolvedTikTokVideo | null> {
  try {
    const res = await fetch(rawUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return null;
    const html = await res.text();

    const scriptMatch = html.match(
      /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/i
    );
    if (!scriptMatch || !scriptMatch[1]) return null;

    const json = JSON.parse(scriptMatch[1]);
    const defaultScope = json?.__DEFAULT_SCOPE__ || {};
    const itemStruct =
      defaultScope?.['webapp.video-detail']?.itemInfo?.itemStruct ||
      defaultScope?.['webapp.video-detail']?.itemStruct;

    if (!itemStruct) return null;

    const videoObj = itemStruct.video || {};
    const playAddr =
      videoObj.playAddr ||
      videoObj.PlayAddrStruct?.UrlList?.[0] ||
      videoObj.BitRate?.[0]?.PlayAddr?.UrlList?.[0] ||
      '';
    const downloadAddr = videoObj.downloadAddr || '';
    const videoId = String(itemStruct.id || extractTikTokVideoId(rawUrl) || '');

    const primaryUrl = playAddr || downloadAddr;
    if (!primaryUrl) return null;

    const backupUrls = [playAddr, downloadAddr].filter(Boolean);

    return {
      playUrl: primaryUrl,
      wmPlayUrl: downloadAddr || primaryUrl,
      backupPlayUrls: Array.from(new Set(backupUrls)),
      coverUrl: videoObj.cover || videoObj.originCover || videoObj.dynamicCover || '',
      title: itemStruct.desc || '',
      authorName: itemStruct.author?.nickname || '',
      authorHandle: itemStruct.author?.uniqueId || '',
      duration: Number(videoObj.duration || 0),
      isAd: Boolean(itemStruct.isAd),
      isCommerce: Boolean(itemStruct.commerceConfigData || itemStruct.anchors?.length),
      videoId,
    };
  } catch {
    return null;
  }
}

/**
 * Primary Layer 1: Resolves direct MP4 stream via TikWM
 * and falls back to direct TikTok hydration if needed.
 */
async function fetchFromTikwm(url: string): Promise<ResolvedTikTokVideo | null> {
  const videoId = extractTikTokVideoId(url);

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await enqueueTikwmCall(async () => {
        const res = await fetch(`https://www.tikwm.com/api/?url=${encodeURIComponent(url)}&hd=0`, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            Accept: 'application/json',
          },
          cache: 'no-store',
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return null;
        return res.json();
      });

      if (result && result.code === 0 && result.data && (result.data.play || result.data.wmplay || result.data.hdplay)) {
        const d = result.data;
        const toAbs = (u?: string) => {
          if (!u) return '';
          if (u.startsWith('http://') || u.startsWith('https://')) return u;
          return `https://www.tikwm.com${u.startsWith('/') ? '' : '/'}${u}`;
        };

        const resolvedId = String(d.id || videoId || '');
        const playUrl = toAbs(d.play);
        const wmPlayUrl = toAbs(d.wmplay);
        const hdPlayUrl = toAbs(d.hdplay);

        const allCandidates = Array.from(
          new Set([playUrl, wmPlayUrl, hdPlayUrl].filter(Boolean))
        );

        if (allCandidates.length > 0) {
          const coverUrl = toAbs(d.cover) || toAbs(d.origin_cover) || toAbs(d.ai_dynamic_cover) || '';
          if (coverUrl) {
            thumbCache.set(canonicalizeTikTokUrl(url), {
              coverUrl,
              title: d.title || '',
              authorHandle: d.author?.unique_id || '',
              expiresAt: Date.now() + 6 * 60 * 60 * 1000,
            });
          }

          return {
            playUrl: playUrl || wmPlayUrl || allCandidates[0],
            wmPlayUrl: wmPlayUrl || playUrl || allCandidates[0],
            backupPlayUrls: allCandidates,
            coverUrl,
            title: d.title || '',
            authorName: d.author?.nickname || '',
            authorHandle: d.author?.unique_id || '',
            duration: d.duration || 0,
            isAd: Boolean(d.is_ad || d.commercial_video_info),
            isCommerce: Boolean(d.commerce_info || d.anchors?.length),
            videoId: resolvedId || undefined,
          };
        }
      }
    } catch {
      // retry on transient network error
    }
  }

  const hydrated = await fetchFromTikTokPageHydration(url);
  if (hydrated && hydrated.playUrl) {
    if (!hydrated.coverUrl) {
      const oembed = await fetchTikTokOembedOnly(url);
      if (oembed?.coverUrl) hydrated.coverUrl = oembed.coverUrl;
    }
    return hydrated;
  }

  return null;
}

export async function resolveTikTokVideoServer(rawUrl: string): Promise<{
  video: ResolvedTikTokVideo | null;
  cached: boolean;
}> {
  const cleanKey = canonicalizeTikTokUrl(rawUrl);
  const now = Date.now();

  const cached = videoCache.get(cleanKey) || videoCache.get(rawUrl);
  if (cached && cached.expiresAt > now) {
    return { video: cached.data, cached: true };
  }

  let inFlight = inFlightMap.get(cleanKey);
  if (!inFlight) {
    inFlight = fetchFromTikwm(rawUrl).finally(() => {
      inFlightMap.delete(cleanKey);
    });
    inFlightMap.set(cleanKey, inFlight);
  }

  const resolved = await inFlight;
  if (resolved && resolved.playUrl) {
    const entry = { data: resolved, expiresAt: Date.now() + 60 * 60 * 1000 };
    videoCache.set(cleanKey, entry);
    videoCache.set(rawUrl, entry);
    return { video: resolved, cached: false };
  }

  return { video: null, cached: false };
}
