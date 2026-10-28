export const getDrivePreviewLink = (url: string): string => {
  if (!url || typeof url !== 'string') return '';
  if (url.includes('/preview')) return url;
  if (url.includes('/view')) return url.replace('/view', '/preview').split('?')[0];
  const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (match && match[1]) return `https://drive.google.com/file/d/${match[1]}/preview`;
  const folderMatch = url.match(/\/drive\/(?:u\/\d+\/)?folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch && folderMatch[1]) {
    return `https://drive.google.com/embeddedfolderview?id=${folderMatch[1]}#grid`;
  }
  return url;
};

export const extractDriveFileId = (url: string): string | null => {
  if (!url || typeof url !== 'string') return null;
  const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return match?.[1] || null;
};

export const getInstagramEmbedLink = (url: string): string => {
  if (!url || typeof url !== 'string') return '';
  if (url.includes('instagram.com/p/') || url.includes('instagram.com/reel/') || url.includes('instagram.com/tv/')) {
    let cleanUrl = url.split('?')[0];
    if (cleanUrl.endsWith('/')) cleanUrl = cleanUrl.slice(0, -1);
    return cleanUrl.endsWith('/embed') ? cleanUrl : cleanUrl + '/embed';
  }
  return '';
};

export const getTikTokEmbedLink = (url: string): string => {
  if (!url || typeof url !== 'string') return '';
  const match = url.match(/tiktok\.com\/(?:@[^/]+\/video|v|embed\/v2|player\/v1)\/(\d+)/i);
  if (match && match[1]) {
    return `https://www.tiktok.com/player/v1/${match[1]}?music_info=1&description=1`;
  }
  return '';
};

export interface ParsedCreativeMediaItem {
  label: string;
  rawUrl: string;
  embedUrl: string;
  sourceType: 'tiktok' | 'instagram' | 'drive' | 'drive-folder' | 'external';
  videoId?: string;
  driveFileId?: string;
  thumbnailUrl?: string;
}

export const parseCreativeLinks = (rawCellVal: any): ParsedCreativeMediaItem[] => {
  if (!rawCellVal || typeof rawCellVal !== 'string') return [];
  const trimmed = rawCellVal.trim();
  if (!trimmed || trimmed === '-' || trimmed.toUpperCase() === '#N/A' || trimmed.toUpperCase() === 'N/A' || trimmed.toLowerCase() === 'none') {
    return [];
  }

  // Extract all https:// URLs from the string (handles single URLs and "- Slide 1: https://... - Slide 2: https://...")
  const urlMatches = trimmed.match(/https?:\/\/[^\s"'<>]+/gi);
  if (!urlMatches || urlMatches.length === 0) return [];

  return urlMatches.map((rawUrl, idx) => {
    const cleanRaw = rawUrl.replace(/[.,;)]+$/, '');
    const lower = cleanRaw.toLowerCase();
    const label = urlMatches.length > 1 ? `Asset ${idx + 1}` : 'Creative Preview';

    if (lower.includes('tiktok.com')) {
      const ttMatch = cleanRaw.match(/tiktok\.com\/(?:@[^/]+\/(?:video|photo)|v|embed\/v2|player\/v1)\/(\d+)/i);
      const videoId = ttMatch?.[1];
      return {
        label,
        rawUrl: cleanRaw,
        embedUrl: videoId ? `https://www.tiktok.com/player/v1/${videoId}?music_info=1&description=1` : '',
        sourceType: 'tiktok',
        videoId,
      };
    }

    if (lower.includes('instagram.com')) {
      const igEmbed = getInstagramEmbedLink(cleanRaw);
      return {
        label,
        rawUrl: cleanRaw,
        embedUrl: igEmbed,
        sourceType: 'instagram',
      };
    }

    if (lower.includes('drive.google.com')) {
      const isFolder = lower.includes('/folders/');
      const driveFileId = isFolder ? undefined : extractDriveFileId(cleanRaw) || undefined;
      return {
        label,
        rawUrl: cleanRaw,
        embedUrl: getDrivePreviewLink(cleanRaw),
        sourceType: isFolder ? 'drive-folder' : 'drive',
        driveFileId,
        thumbnailUrl: driveFileId ? `https://drive.google.com/thumbnail?id=${driveFileId}&sz=w240` : undefined,
      };
    }

    const isDirectImage = /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(cleanRaw);
    return {
      label,
      rawUrl: cleanRaw,
      embedUrl: '',
      sourceType: 'external',
      thumbnailUrl: isDirectImage ? cleanRaw : undefined,
    };
  });
};

export function hydrateCreativeReportData(compact: { strings: string[]; groups: any[] }): any[] {
  if (!compact || !Array.isArray(compact.strings) || !Array.isArray(compact.groups)) return [];
  const { strings, groups } = compact;
  const rows: any[] = [];

  for (let i = 0; i < groups.length; i++) {
    const [dims, days] = groups[i];
    const Brand = strings[dims[0]] || '';
    const Platform = strings[dims[1]] || '';
    const AdType = strings[dims[2]] || '';
    const KPI = strings[dims[3]] || '';
    const Format = strings[dims[4]] || '';
    const AdGroup = strings[dims[5]] || '';
    const CreativeName = strings[dims[6]] || '';
    const CreativeLink = strings[dims[7]] || '';
    const Pillar = dims[8] !== undefined ? (strings[dims[8]] || '') : '';

    for (let j = 0; j < days.length; j++) {
      const d = days[j];
      rows.push({
        Date: strings[d[0]] || '',
        Brand,
        Platform,
        'Ad Type': AdType,
        KPI,
        Format,
        'Ad Group': AdGroup,
        Pillar,
        'Creative Name': CreativeName,
        'Creative Link': CreativeLink,
        Spend: d[1],
        Impression: d[2],
        Clicks: d[3],
        '6s View': d[4],
        '15s View': d[5],
        Purchase: d[6] !== undefined ? d[6] : 0,
        GMV: d[7] !== undefined ? d[7] : 0,
        Engagement: d[8] !== undefined ? d[8] : 0,
      });
    }
  }
  return rows;
}