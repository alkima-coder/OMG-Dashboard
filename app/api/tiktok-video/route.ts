import { NextResponse } from 'next/server';
import {
  resolveTikTokVideoServer,
  resolveTikTokThumbnailFast,
  resolveInstagramThumbnailFast,
} from '@/lib/tiktok-resolver';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawUrl = searchParams.get('url')?.trim() || '';
    const thumbOnly = searchParams.get('thumbOnly') === '1';
    const streamMode = searchParams.get('stream') === '1';
    const proxyImg = searchParams.get('proxyImg')?.trim() || '';

    // 0. Same-Origin Image Proxy Mode (bypasses Instagram Cross-Origin-Resource-Policy: same-origin & TikTok CDN hotlink 403s)
    if (proxyImg && /^https?:\/\//i.test(proxyImg)) {
      try {
        const isIg = proxyImg.includes('instagram') || proxyImg.includes('fbcdn');
        const imgRes = await fetch(proxyImg, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            Referer: isIg ? 'https://www.instagram.com/' : 'https://www.tiktok.com/',
            Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
          },
          redirect: 'follow',
          signal: AbortSignal.timeout(8000),
        });
        if (imgRes.ok && imgRes.body) {
          const ct = imgRes.headers.get('content-type') || 'image/jpeg';
          return new Response(imgRes.body, {
            status: 200,
            headers: {
              'Content-Type': ct.startsWith('image/') ? ct : 'image/jpeg',
              'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=86400',
              'Cross-Origin-Resource-Policy': 'cross-origin',
            },
          });
        }
      } catch {
        // fall through to 404
      }
      return new Response(null, { status: 404 });
    }

    const lowerUrl = rawUrl.toLowerCase();
    const isTikTok = lowerUrl.includes('tiktok.com');
    const isInstagram = lowerUrl.includes('instagram.com');

    if (!rawUrl || (!isTikTok && !isInstagram)) {
      return NextResponse.json({ success: false, error: 'Invalid social media URL' }, { status: 400 });
    }

    // 1. Thumbnail Mode for Table Preview Buttons (supports both TikTok and Instagram)
    if (thumbOnly) {
      if (isInstagram) {
        const igThumb = await resolveInstagramThumbnailFast(rawUrl);
        if (igThumb && igThumb.coverUrl) {
          const proxiedCover = `/api/tiktok-video?proxyImg=${encodeURIComponent(igThumb.coverUrl)}`;
          return NextResponse.json(
            {
              success: true,
              coverUrl: proxiedCover,
              rawCoverUrl: igThumb.coverUrl,
              title: igThumb.title,
            },
            {
              headers: {
                'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=86400',
              },
            }
          );
        }
        return NextResponse.json({ success: false, error: 'No Instagram thumbnail available' });
      }

      const thumb = await resolveTikTokThumbnailFast(rawUrl);
      if (thumb && thumb.coverUrl) {
        const proxiedCover = `/api/tiktok-video?proxyImg=${encodeURIComponent(thumb.coverUrl)}`;
        return NextResponse.json(
          {
            success: true,
            coverUrl: proxiedCover,
            rawCoverUrl: thumb.coverUrl,
            title: thumb.title,
            authorHandle: thumb.authorHandle,
          },
          {
            headers: {
              'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=86400',
            },
          }
        );
      }
      return NextResponse.json({ success: false, error: 'No thumbnail available' });
    }

    if (!isTikTok) {
      return NextResponse.json({ success: false, error: 'Direct stream resolver is for TikTok URLs' }, { status: 400 });
    }

    const { video, cached } = await resolveTikTokVideoServer(rawUrl);

    // 2. Server-side MP4 Stream Proxy Mode (bypasses browser CORS/403/ISP blocks on TikTok CDN)
    if (streamMode) {
      const candidateUrls = [
        video?.playUrl,
        video?.wmPlayUrl,
        ...(video?.backupPlayUrls || []),
      ].filter(Boolean) as string[];

      const rangeHeader = request.headers.get('range') || '';

      for (const targetMp4Url of candidateUrls) {
        try {
          const upstreamHeaders: Record<string, string> = {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            Referer: targetMp4Url.includes('tikwm.com') ? 'https://www.tikwm.com/' : 'https://www.tiktok.com/',
            Accept: '*/*',
          };
          if (rangeHeader) {
            upstreamHeaders['Range'] = rangeHeader;
          }

          const upstream = await fetch(targetMp4Url, {
            headers: upstreamHeaders,
            redirect: 'follow',
            signal: AbortSignal.timeout(15000),
          });

          if (upstream.ok || upstream.status === 206) {
            const ct = upstream.headers.get('content-type') || 'video/mp4';
            if (!ct.includes('text/html') && upstream.body) {
              const resHeaders = new Headers();
              resHeaders.set('Content-Type', ct.includes('video') ? ct : 'video/mp4');
              resHeaders.set('Accept-Ranges', 'bytes');
              resHeaders.set('Cache-Control', 'public, max-age=3600');
              const cl = upstream.headers.get('content-length');
              if (cl) resHeaders.set('Content-Length', cl);
              const cr = upstream.headers.get('content-range');
              if (cr) resHeaders.set('Content-Range', cr);

              return new Response(upstream.body, {
                status: upstream.status,
                headers: resHeaders,
              });
            }
          }
        } catch {
          // try next candidate URL
        }
      }

      return NextResponse.json({ success: false, error: 'Stream proxy unavailable' }, { status: 502 });
    }

    // 3. Standard JSON Resolution Mode (returns direct URLs + server proxy URL fallback)
    if (video && video.playUrl) {
      const proxyPlayUrl = `/api/tiktok-video?stream=1&url=${encodeURIComponent(rawUrl)}`;
      const allSources = Array.from(
        new Set([
          video.playUrl,
          video.wmPlayUrl,
          ...(video.backupPlayUrls || []),
          proxyPlayUrl,
        ].filter(Boolean))
      );

      return NextResponse.json({
        success: true,
        video: {
          ...video,
          proxyPlayUrl,
          backupPlayUrls: allSources,
        },
        cached,
      });
    }

    return NextResponse.json({
      success: false,
      error: 'Could not resolve direct MP4 stream for this TikTok video.',
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Resolver error' }, { status: 500 });
  }
}
