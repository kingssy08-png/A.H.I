import { getForegroundBounds, loadHtmlImage } from './imageReferencePipeline';

export type BgRemoverAspectRatio = 'original' | '1:1' | '9:16' | '16:9' | '4:5';

export type BackgroundEditConfig =
  | { mode: 'transparent' }
  | { mode: 'white' }
  | { mode: 'color'; hex: string }
  | { mode: 'image'; imageUrl: string; label?: string };

export const BG_REMOVER_ASPECT_RATIOS: Array<{
  id: BgRemoverAspectRatio;
  label: string;
  hint: string;
}> = [
  { id: 'original', label: 'Original', hint: 'Keep source size' },
  { id: '1:1', label: '1:1', hint: 'Square' },
  { id: '9:16', label: '9:16', hint: 'Vertical' },
  { id: '16:9', label: '16:9', hint: 'Widescreen' },
  { id: '4:5', label: '4:5', hint: 'Portrait' },
];

const RATIO_DIMENSIONS: Record<Exclude<BgRemoverAspectRatio, 'original'>, { w: number; h: number }> = {
  '1:1': { w: 1200, h: 1200 },
  '9:16': { w: 1080, h: 1920 },
  '16:9': { w: 1920, h: 1080 },
  '4:5': { w: 1080, h: 1350 },
};

const ACCEPTED_MIME_SET = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);
const ACCEPTED_EXT_RE = /\.(png|jpe?g|webp)$/i;

export function isSupportedUploadImage(file: File): boolean {
  const mime = (file.type || '').toLowerCase();
  if (ACCEPTED_MIME_SET.has(mime)) return true;
  if (!mime && ACCEPTED_EXT_RE.test(file.name)) return true;
  return ACCEPTED_EXT_RE.test(file.name);
}

/**
 * Reads an uploaded PNG, JPG, or WEBP from desktop or mobile camera roll/files,
 * automatically normalizes EXIF orientation via <img> -> <canvas>, and keeps
 * payload dimensions crisp while staying safely below serverless JSON limits.
 */
export function readImageFileForBgRemover(file: File): Promise<{
  dataUrl: string;
  width: number;
  height: number;
  label: string;
}> {
  if (!isSupportedUploadImage(file)) {
    return Promise.reject(new Error('Please upload a PNG, JPG, or WEBP image file.'));
  }

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const natW = img.naturalWidth || img.width;
        const natH = img.naturalHeight || img.height;
        const maxSide = 1440;
        const scale = Math.min(1, maxSide / Math.max(1, natW, natH));
        const w = Math.max(1, Math.round(natW * scale));
        const h = Math.max(1, Math.round(natH * scale));

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(objectUrl);
          reject(new Error('Could not initialize image canvas.'));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);

        const isPng =
          file.type.toLowerCase() === 'image/png' || /\.png$/i.test(file.name);
        let dataUrl = canvas.toDataURL(isPng ? 'image/png' : 'image/jpeg', 0.93);

        // Keep data URL safely under Vercel's ~4.5 MB serverless request payload limit
        if (dataUrl.length > 3_100_000) {
          const compactScale = Math.min(1, 1080 / Math.max(1, w, h));
          const cw = Math.max(1, Math.round(w * compactScale));
          const ch = Math.max(1, Math.round(h * compactScale));
          const compactCanvas = document.createElement('canvas');
          compactCanvas.width = cw;
          compactCanvas.height = ch;
          const cctx = compactCanvas.getContext('2d');
          if (cctx) {
            cctx.drawImage(canvas, 0, 0, cw, ch);
            dataUrl = compactCanvas.toDataURL(isPng ? 'image/png' : 'image/jpeg', 0.9);
            if (dataUrl.length > 3_100_000) {
              dataUrl = compactCanvas.toDataURL('image/webp', 0.9);
            }
            URL.revokeObjectURL(objectUrl);
            resolve({
              dataUrl,
              width: cw,
              height: ch,
              label: cleanFileLabel(file.name),
            });
            return;
          }
        }

        URL.revokeObjectURL(objectUrl);
        resolve({
          dataUrl,
          width: w,
          height: h,
          label: cleanFileLabel(file.name),
        });
      } catch (err) {
        URL.revokeObjectURL(objectUrl);
        reject(err instanceof Error ? err : new Error('Failed to decode uploaded image.'));
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Could not load "${file.name}". Please choose a PNG, JPG, or WEBP image.`));
    };
    img.src = objectUrl;
  });
}

function cleanFileLabel(name: string): string {
  const base = name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
  return base.slice(0, 32) || 'Cutout Subject';
}

/**
 * Composites the segmented transparent PNG onto the selected aspect ratio canvas
 * and background (Transparent alpha=0, White, Custom Color, or Uploaded Background Image).
 * Never stretches, distorts, or crops the foreground subject — expands canvas instead.
 */
export async function composeBgRemoverOutput(
  cutoutDataUrl: string,
  aspectRatio: BgRemoverAspectRatio,
  background: BackgroundEditConfig
): Promise<{
  pngDataUrl: string;
  width: number;
  height: number;
  hasTransparency: boolean;
}> {
  const fgImg = await loadHtmlImage(cutoutDataUrl);
  const natW = Math.max(1, fgImg.naturalWidth || fgImg.width);
  const natH = Math.max(1, fgImg.naturalHeight || fgImg.height);

  const targetDims =
    aspectRatio === 'original' ? { w: natW, h: natH } : RATIO_DIMENSIONS[aspectRatio];

  const canvas = document.createElement('canvas');
  canvas.width = targetDims.w;
  canvas.height = targetDims.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return {
      pngDataUrl: cutoutDataUrl,
      width: natW,
      height: natH,
      hasTransparency: background.mode === 'transparent',
    };
  }

  // Clear explicitly to full transparent alpha (0,0,0,0)
  ctx.clearRect(0, 0, targetDims.w, targetDims.h);

  // Paint selected background layer (never defaults transparency to white)
  if (background.mode === 'white') {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, targetDims.w, targetDims.h);
  } else if (background.mode === 'color') {
    ctx.fillStyle = background.hex || '#0F172A';
    ctx.fillRect(0, 0, targetDims.w, targetDims.h);
  } else if (background.mode === 'image' && background.imageUrl) {
    try {
      const bgImg = await loadHtmlImage(background.imageUrl);
      const bgW = Math.max(1, bgImg.naturalWidth || bgImg.width);
      const bgH = Math.max(1, bgImg.naturalHeight || bgImg.height);
      const coverScale = Math.max(targetDims.w / bgW, targetDims.h / bgH);
      const drawBgW = bgW * coverScale;
      const drawBgH = bgH * coverScale;
      ctx.drawImage(
        bgImg,
        (targetDims.w - drawBgW) / 2,
        (targetDims.h - drawBgH) / 2,
        drawBgW,
        drawBgH
      );
    } catch {
      // Keep transparent if background image fails to decode
    }
  }

  if (aspectRatio === 'original') {
    // Draw exact 1:1 segmented subject preserving original position & details
    ctx.drawImage(fgImg, 0, 0, targetDims.w, targetDims.h);
  } else {
    // Expand canvas cleanly around the entire subject without stretching or clipping any part
    const bounds = getForegroundBounds(fgImg);
    const padX = Math.round(targetDims.w * 0.06);
    const padY = Math.round(targetDims.h * 0.06);
    const availW = Math.max(1, targetDims.w - padX * 2);
    const availH = Math.max(1, targetDims.h - padY * 2);
    const scale = Math.min(availW / bounds.sw, availH / bounds.sh);
    const drawW = bounds.sw * scale;
    const drawH = bounds.sh * scale;
    const dx = (targetDims.w - drawW) / 2;
    const dy = (targetDims.h - drawH) / 2;
    ctx.drawImage(fgImg, bounds.sx, bounds.sy, bounds.sw, bounds.sh, dx, dy, drawW, drawH);
  }

  return {
    pngDataUrl: canvas.toDataURL('image/png'),
    width: targetDims.w,
    height: targetDims.h,
    hasTransparency: background.mode === 'transparent',
  };
}

/**
 * Always produces a genuine transparent RGBA PNG cutout (preserving full subject
 * on the selected aspect ratio canvas) for sending into Image or Video Generator.
 */
export async function exportTransparentCutoutPng(
  cutoutDataUrl: string,
  aspectRatio: BgRemoverAspectRatio
): Promise<string> {
  const res = await composeBgRemoverOutput(cutoutDataUrl, aspectRatio, {
    mode: 'transparent',
  });
  return res.pngDataUrl;
}
