import { google } from 'googleapis';
import { extractDriveFileId } from './mediaUtils';

export interface ResolvedDriveMedia {
  fileId: string;
  fileName?: string;
  mimeType: string;
  buffer: Buffer;
  base64: string;
  assetType: 'video' | 'image' | 'video-poster';
  isPosterFrame: boolean;
  sizeBytes: number;
  durationSeconds?: number;
  width?: number;
  height?: number;
  sourceUrl: string;
}

/**
 * Robust MIME-type sniffer based on binary magic bytes.
 * Supports MP4, QuickTime MOV, WebM, JPEG, PNG, and WebP.
 */
export function sniffVerifiedMediaMimeType(
  buf: ArrayBuffer | Buffer
): 'video/mp4' | 'video/quicktime' | 'video/webm' | 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (!buf || buf.byteLength < 16) return null;
  const bytes = Buffer.isBuffer(buf)
    ? buf.subarray(0, 16)
    : new Uint8Array(buf, 0, Math.min(16, buf.byteLength));

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png';
  }

  // WebP: "RIFF" .... "WEBP"
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }

  // WebM / Matroska: 1A 45 DF A3
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return 'video/webm';
  }

  // MP4 / QuickTime ISO Base Media: bytes 4..7 === "ftyp" (66 74 79 70)
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    // Check if it's explicitly QuickTime 'qt  '
    if (bytes[8] === 0x71 && bytes[9] === 0x74) {
      return 'video/quicktime';
    }
    return 'video/mp4';
  }

  // QuickTime MOV without ftyp (moov, mdat, wide at bytes 4..7)
  const tag4 = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
  if (tag4 === 'moov' || tag4 === 'mdat' || tag4 === 'wide') {
    return 'video/quicktime';
  }

  return null;
}

/**
 * Creates authenticated Google Drive v3 client using Service Account credentials from environment.
 */
function getDriveClient() {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL?.trim();
  const rawKey = process.env.GOOGLE_PRIVATE_KEY?.trim();
  if (!clientEmail || !rawKey) return null;

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: clientEmail,
        private_key: rawKey.replace(/\\n/g, '\n').replace(/"/g, ''),
      },
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });
    return google.drive({ version: 'v3', auth });
  } catch {
    return null;
  }
}

/**
 * Extracts Drive File ID or Folder ID from any Google Drive link.
 */
export function parseDriveLink(url: string): { fileId?: string; folderId?: string } {
  if (!url || typeof url !== 'string') return {};
  const trimmed = url.trim();

  const folderMatch = trimmed.match(/\/drive\/(?:u\/\d+\/)?folders\/([a-zA-Z0-9_-]+)/i);
  if (folderMatch && folderMatch[1]) {
    return { folderId: folderMatch[1] };
  }

  const fileId = extractDriveFileId(trimmed) || undefined;
  return { fileId };
}

/**
 * Resolves a Google Drive video or image asset with multi-tier fallback:
 * 1. Google Drive API v3 via Service Account (handles private & large files with full metadata)
 * 2. Google Drive API v3 via API Key (handles public files via official Google Cloud API)
 * 3. Direct HTTP download with virus scan confirmation bypass
 * 4. High-resolution video poster/thumbnail fallback (guarantees Gemini always sees real visual frames)
 */
export async function resolveGoogleDriveMedia(
  urlOrId: string,
  maxBytes = 45 * 1024 * 1024
): Promise<ResolvedDriveMedia | null> {
  const { fileId: parsedFileId, folderId } = parseDriveLink(urlOrId);
  let targetFileId = parsedFileId;

  const drive = getDriveClient();

  // If a Folder ID was provided, query the folder to find the primary video file
  if (!targetFileId && folderId && drive) {
    try {
      const listRes = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'files(id, name, mimeType, size)',
        orderBy: 'modifiedTime desc',
        pageSize: 10,
      });
      const files = listRes.data.files || [];
      const videoFile = files.find(f => (f.mimeType || '').startsWith('video/')) || files[0];
      if (videoFile?.id) {
        targetFileId = videoFile.id;
      }
    } catch {
      // Ignore folder listing error
    }
  }

  if (!targetFileId) return null;

  // --- TIER 1: Service Account Google Drive v3 API ---
  if (drive) {
    try {
      const metaRes = await drive.files.get({
        fileId: targetFileId,
        fields: 'id, name, mimeType, size, videoMediaMetadata',
        supportsAllDrives: true,
      });

      const meta = metaRes.data;
      const reportedSize = Number(meta.size || 0);

      if (reportedSize <= maxBytes) {
        const mediaRes = await drive.files.get(
          { fileId: targetFileId, alt: 'media', supportsAllDrives: true },
          { responseType: 'arraybuffer' }
        );

        const rawBuf = Buffer.from(mediaRes.data as ArrayBuffer);
        if (rawBuf.byteLength > 1024) {
          const verifiedMime = sniffVerifiedMediaMimeType(rawBuf) || (meta.mimeType as any) || 'video/mp4';
          const isVideo = verifiedMime.startsWith('video/') || (meta.mimeType || '').startsWith('video/');

          const vMeta = meta.videoMediaMetadata;
          return {
            fileId: targetFileId,
            fileName: meta.name || 'gdrive_video',
            mimeType: verifiedMime,
            buffer: rawBuf,
            base64: rawBuf.toString('base64'),
            assetType: isVideo ? 'video' : 'image',
            isPosterFrame: false,
            sizeBytes: rawBuf.byteLength,
            durationSeconds: vMeta?.durationMillis ? Math.round(Number(vMeta.durationMillis) / 1000) : undefined,
            width: vMeta?.width ? Number(vMeta.width) : undefined,
            height: vMeta?.height ? Number(vMeta.height) : undefined,
            sourceUrl: urlOrId,
          };
        }
      }
    } catch {
      // Fallback to Tier 2
    }
  }

  // --- TIER 2: Google Cloud / Gemini API Key via Drive API v3 ---
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (apiKey) {
    try {
      const apiUrl = `https://www.googleapis.com/drive/v3/files/${targetFileId}?alt=media&key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(apiUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept: '*/*',
        },
        signal: AbortSignal.timeout(15000),
      });

      if (res.ok) {
        const contentLength = Number(res.headers.get('content-length') || 0);
        if (!contentLength || contentLength <= maxBytes) {
          const buf = await res.arrayBuffer();
          if (buf.byteLength > 4096 && buf.byteLength <= maxBytes) {
            const rawBuf = Buffer.from(buf);
            const verifiedMime = sniffVerifiedMediaMimeType(rawBuf);
            if (verifiedMime) {
              const isVideo = verifiedMime.startsWith('video/');
              return {
                fileId: targetFileId,
                fileName: 'gdrive_media',
                mimeType: verifiedMime,
                buffer: rawBuf,
                base64: rawBuf.toString('base64'),
                assetType: isVideo ? 'video' : 'image',
                isPosterFrame: false,
                sizeBytes: rawBuf.byteLength,
                sourceUrl: urlOrId,
              };
            }
          }
        }
      }
    } catch {
      // Fallback to Tier 3
    }
  }

  // --- TIER 3: Direct Web Download with Virus Warning / Confirmation Follower ---
  try {
    const ucUrl = `https://drive.google.com/uc?export=download&id=${targetFileId}`;
    const initialRes = await fetch(ucUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Referer: 'https://drive.google.com/',
        Accept: '*/*',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });

    if (initialRes.ok) {
      const initialBuf = await initialRes.arrayBuffer();
      const first16 = new Uint8Array(initialBuf.slice(0, 16));

      // If already binary and not HTML ('<')
      if (first16[0] !== 0x3c && initialBuf.byteLength > 4096 && initialBuf.byteLength <= maxBytes) {
        const rawBuf = Buffer.from(initialBuf);
        const verifiedMime = sniffVerifiedMediaMimeType(rawBuf);
        if (verifiedMime) {
          const isVideo = verifiedMime.startsWith('video/');
          return {
            fileId: targetFileId,
            fileName: 'gdrive_media',
            mimeType: verifiedMime,
            buffer: rawBuf,
            base64: rawBuf.toString('base64'),
            assetType: isVideo ? 'video' : 'image',
            isPosterFrame: false,
            sizeBytes: rawBuf.byteLength,
            sourceUrl: urlOrId,
          };
        }
      }

      // If response was HTML virus-warning page, parse confirmation token
      if (first16[0] === 0x3c) {
        const htmlText = new TextDecoder('utf-8').decode(initialBuf);
        const confirmMatch =
          htmlText.match(/name="confirm"\s+value="([^"]+)"/i) ||
          htmlText.match(/confirm=([a-zA-Z0-9_-]+)/i);
        const uuidMatch = htmlText.match(/name="uuid"\s+value="([^"]+)"/i);

        if (confirmMatch && confirmMatch[1]) {
          const confirmToken = confirmMatch[1];
          const uuidParam = uuidMatch?.[1] ? `&uuid=${encodeURIComponent(uuidMatch[1])}` : '';
          const confirmUrl = `https://drive.usercontent.google.com/download?id=${targetFileId}&export=download&confirm=${confirmToken}${uuidParam}`;

          const confirmRes = await fetch(confirmUrl, {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
              Referer: 'https://drive.google.com/',
              Accept: '*/*',
            },
            redirect: 'follow',
            signal: AbortSignal.timeout(20000),
          });

          if (confirmRes.ok) {
            const streamBuf = await confirmRes.arrayBuffer();
            const first16Confirm = new Uint8Array(streamBuf.slice(0, 16));
            if (first16Confirm[0] !== 0x3c && streamBuf.byteLength > 4096 && streamBuf.byteLength <= maxBytes) {
              const rawBuf = Buffer.from(streamBuf);
              const verifiedMime = sniffVerifiedMediaMimeType(rawBuf);
              if (verifiedMime) {
                const isVideo = verifiedMime.startsWith('video/');
                return {
                  fileId: targetFileId,
                  fileName: 'gdrive_stream',
                  mimeType: verifiedMime,
                  buffer: rawBuf,
                  base64: rawBuf.toString('base64'),
                  assetType: isVideo ? 'video' : 'image',
                  isPosterFrame: false,
                  sizeBytes: rawBuf.byteLength,
                  sourceUrl: urlOrId,
                };
              }
            }
          }
        }
      }
    }
  } catch {
    // Fallback to Tier 4
  }

  // --- TIER 4: High-Resolution Video Poster / Opening Frame Fallback ---
  // When video download is restricted by domain admin permissions or size exceeds budget,
  // Google's thumbnail engine automatically provides high-resolution extracted video frames.
  try {
    const thumbUrl = `https://drive.google.com/thumbnail?id=${targetFileId}&sz=w1200`;
    const thumbRes = await fetch(thumbUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Referer: 'https://drive.google.com/',
        Accept: 'image/jpeg,image/png,image/webp,image/*;q=0.8',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    });

    if (thumbRes.ok) {
      const thumbBuf = await thumbRes.arrayBuffer();
      if (thumbBuf.byteLength > 1024) {
        const rawBuf = Buffer.from(thumbBuf);
        const verifiedMime = sniffVerifiedMediaMimeType(rawBuf);
        if (verifiedMime && verifiedMime.startsWith('image/')) {
          return {
            fileId: targetFileId,
            fileName: 'gdrive_video_poster',
            mimeType: verifiedMime,
            buffer: rawBuf,
            base64: rawBuf.toString('base64'),
            assetType: 'video-poster',
            isPosterFrame: true, // Marker showing this is the extracted video frame
            sizeBytes: rawBuf.byteLength,
            sourceUrl: urlOrId,
          };
        }
      }
    }
  } catch {
    // Thumbnail fetch error
  }

  return null;
}

