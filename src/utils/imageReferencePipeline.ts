import type { AspectRatio, VideoReferenceItem } from '../types/studio';

export const ASPECT_RATIO_DIMENSIONS: Record<AspectRatio, { w: number; h: number }> = {
  '16:9': { w: 1280, h: 720 },
  '9:16': { w: 720, h: 1280 },
  '1:1': { w: 1024, h: 1024 },
  '21:9': { w: 1344, h: 576 },
};

export function getTargetDimensionsForRatio(ratio?: AspectRatio): { w: number; h: number } {
  return ASPECT_RATIO_DIMENSIONS[ratio ?? '16:9'] ?? ASPECT_RATIO_DIMENSIONS['16:9'];
}

export function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!src.startsWith('data:') && !src.startsWith('blob:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode reference image.'));
    img.src = src;
  });
}

export async function getImageDimensions(
  src: string
): Promise<{ width: number; height: number } | null> {
  try {
    const img = await loadHtmlImage(src);
    if (!img.naturalWidth || !img.naturalHeight) return null;
    return { width: img.naturalWidth, height: img.naturalHeight };
  } catch {
    return null;
  }
}

export function doesImageMatchAspectRatio(
  width: number,
  height: number,
  targetRatio: AspectRatio,
  tolerance = 0.025
): boolean {
  if (width <= 0 || height <= 0) return false;
  const dims = getTargetDimensionsForRatio(targetRatio);
  const actual = width / height;
  const expected = dims.w / dims.h;
  return Math.abs(actual - expected) / expected <= tolerance;
}

/**
 * Computes the tight non-transparent bounding box of an image so cutouts
 * with large empty alpha margins still scale properly without shrinking the character.
 */
export function getForegroundBounds(img: HTMLImageElement): {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
} {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (w <= 0 || h <= 0) return { sx: 0, sy: 0, sw: 1, sh: 1 };

  try {
    const sampleCanvas = document.createElement('canvas');
    const maxSample = 256;
    const scale = Math.min(1, maxSample / Math.max(w, h));
    const sw = Math.max(1, Math.round(w * scale));
    const sh = Math.max(1, Math.round(h * scale));
    sampleCanvas.width = sw;
    sampleCanvas.height = sh;
    const sctx = sampleCanvas.getContext('2d');
    if (!sctx) return { sx: 0, sy: 0, sw: w, sh: h };
    sctx.drawImage(img, 0, 0, sw, sh);
    const { data } = sctx.getImageData(0, 0, sw, sh);

    let minX = sw;
    let minY = sh;
    let maxX = -1;
    let maxY = -1;
    let hasTransparency = false;

    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const alpha = data[(y * sw + x) * 4 + 3];
        if (alpha < 250) hasTransparency = true;
        if (alpha > 16) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (!hasTransparency || maxX < minX || maxY < minY) {
      return { sx: 0, sy: 0, sw: w, sh: h };
    }

    const padX = Math.round(((maxX - minX + 1) * 0.04) / scale);
    const padY = Math.round(((maxY - minY + 1) * 0.04) / scale);
    const sx = Math.max(0, Math.floor(minX / scale) - padX);
    const sy = Math.max(0, Math.floor(minY / scale) - padY);
    const ex = Math.min(w, Math.ceil((maxX + 1) / scale) + padX);
    const ey = Math.min(h, Math.ceil((maxY + 1) / scale) + padY);
    return { sx, sy, sw: Math.max(1, ex - sx), sh: Math.max(1, ey - sy) };
  } catch {
    return { sx: 0, sy: 0, sw: w, sh: h };
  }
}

/**
 * Prepares an exact target aspect-ratio canvas containing ALL uploaded subject references
 * cleanly proportioned and completely uncropped (head, body, clothing, accessories intact)
 * with zero stretching and zero blurred portrait sidebars, ready for full-scene synthesis.
 */
export async function prepareReferenceCanvasForAspectRatio(
  refs: Array<Pick<VideoReferenceItem, 'imageUrl' | 'role' | 'label'>>,
  targetRatio: AspectRatio,
  options?: { removeBackground?: boolean }
): Promise<{
  canvasDataUrl: string;
  targetWidth: number;
  targetHeight: number;
  sourceAspectDescription: string;
}> {
  const dims = getTargetDimensionsForRatio(targetRatio);
  const canvas = document.createElement('canvas');
  canvas.width = dims.w;
  canvas.height = dims.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return {
      canvasDataUrl: refs[0]?.imageUrl ?? '',
      targetWidth: dims.w,
      targetHeight: dims.h,
      sourceAspectDescription: targetRatio,
    };
  }

  // Clean neutral studio matte so reference-edit / scene-replacement models generate
  // a seamless edge-to-edge environment across the full target ratio (never blurred sidebars).
  const bgGrad = ctx.createLinearGradient(0, 0, 0, dims.h);
  bgGrad.addColorStop(0, '#E8ECF2');
  bgGrad.addColorStop(1, '#DCE2EC');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, dims.w, dims.h);

  const sceneRef = !options?.removeBackground
    ? refs.find((r) => r.role === 'Background / Scene')
    : undefined;

  if (sceneRef) {
    try {
      const bgImg = await loadHtmlImage(sceneRef.imageUrl);
      const bgScale = Math.max(dims.w / bgImg.naturalWidth, dims.h / bgImg.naturalHeight);
      const bw = bgImg.naturalWidth * bgScale;
      const bh = bgImg.naturalHeight * bgScale;
      ctx.drawImage(bgImg, (dims.w - bw) / 2, (dims.h - bh) / 2, bw, bh);
    } catch {
      // Keep clean neutral studio backdrop
    }
  }

  const subjectRefs = refs.filter(
    (r) => r.role !== 'Background / Scene' && r.role !== 'Style'
  );
  const subjectsToDraw = subjectRefs.length > 0 ? subjectRefs : refs.slice(0, 1);

  const loadedSubjects: Array<{
    img: HTMLImageElement;
    bounds: { sx: number; sy: number; sw: number; sh: number };
  }> = [];

  for (const item of subjectsToDraw.slice(0, 4)) {
    try {
      const img = await loadHtmlImage(item.imageUrl);
      loadedSubjects.push({ img, bounds: getForegroundBounds(img) });
    } catch {
      // Skip unreadable ref
    }
  }

  let sourceAspectDescription: string = targetRatio;
  if (loadedSubjects.length > 0) {
    const first = loadedSubjects[0];
    const r = first.img.naturalWidth / Math.max(1, first.img.naturalHeight);
    sourceAspectDescription =
      r < 0.8 ? '9:16 portrait' : r > 1.25 ? '16:9 landscape' : '1:1 square';

    const count = loadedSubjects.length;
    const safeTop = Math.round(dims.h * 0.1);
    const safeBottom = Math.round(dims.h * 0.08);
    const availHeight = dims.h - safeTop - safeBottom;
    const horizMargin = Math.round(dims.w * (count === 1 ? 0.16 : 0.06));
    const gap = Math.round(dims.w * 0.03);
    const slotWidth =
      (dims.w - horizMargin * 2 - gap * Math.max(0, count - 1)) / Math.max(1, count);

    loadedSubjects.forEach(({ img, bounds }, idx) => {
      // Strictly aspect-preserving contain scaling — zero stretching, zero cropping
      const maxH = count === 1 ? availHeight * 0.88 : availHeight * 0.84;
      const scale = Math.min(slotWidth / bounds.sw, maxH / bounds.sh);
      const drawW = bounds.sw * scale;
      const drawH = bounds.sh * scale;
      const slotLeft = horizMargin + idx * (slotWidth + gap);
      const dx = slotLeft + (slotWidth - drawW) / 2;
      const dy = dims.h - safeBottom - drawH;
      ctx.drawImage(img, bounds.sx, bounds.sy, bounds.sw, bounds.sh, dx, dy, drawW, drawH);
    });
  }

  return {
    canvasDataUrl: canvas.toDataURL('image/png'),
    targetWidth: dims.w,
    targetHeight: dims.h,
    sourceAspectDescription,
  };
}

/**
 * Exact target-ratio snapping for images that are already in the matching orientation
 * (e.g., 1392x752 -> 1280x720) without ever stretching or adding blurred/empty sidebars.
 */
export async function normalizeImageOutputAspectRatio(
  imageDataUrl: string,
  targetRatio: AspectRatio
): Promise<{ imageDataUrl: string; width: number; height: number; wasAdjusted: boolean }> {
  const dims = getTargetDimensionsForRatio(targetRatio);
  const img = await loadHtmlImage(imageDataUrl);
  const natW = img.naturalWidth || dims.w;
  const natH = img.naturalHeight || dims.h;

  if (doesImageMatchAspectRatio(natW, natH, targetRatio, 0.01)) {
    return { imageDataUrl, width: natW, height: natH, wasAdjusted: false };
  }

  // Only cover-crop minor aspect variance in the same orientation (never crop portrait to landscape)
  const actualRatio = natW / Math.max(1, natH);
  const expectedRatio = dims.w / dims.h;
  const ratioDelta = Math.abs(actualRatio - expectedRatio) / expectedRatio;
  if (ratioDelta > 0.16) {
    return { imageDataUrl, width: natW, height: natH, wasAdjusted: false };
  }

  const canvas = document.createElement('canvas');
  canvas.width = dims.w;
  canvas.height = dims.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { imageDataUrl, width: natW, height: natH, wasAdjusted: false };
  }

  const coverScale = Math.max(dims.w / natW, dims.h / natH);
  const dw = natW * coverScale;
  const dh = natH * coverScale;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, (dims.w - dw) / 2, (dims.h - dh) / 2, dw, dh);

  return {
    imageDataUrl: canvas.toDataURL('image/png'),
    width: dims.w,
    height: dims.h,
    wasAdjusted: true,
  };
}

/**
 * Lightweight border-connected color-flood background removal fallback used ONLY
 * when all remote AI segmentation services (RMBG / BiRefNet) are unreachable.
 */
export async function removeUniformBackgroundFallback(imageUrl: string): Promise<string> {
  const img = await loadHtmlImage(imageUrl);
  const maxSide = 960;
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return imageUrl;

  ctx.drawImage(img, 0, 0, w, h);
  const imgData = ctx.getImageData(0, 0, w, h);
  const { data } = imgData;

  // Check if image already has significant transparency
  let transparentCount = 0;
  for (let i = 3; i < data.length; i += 16) {
    if (data[i] < 200) transparentCount++;
  }
  if (transparentCount > (w * h) / 64) {
    return imageUrl;
  }

  // Sample 4 corner pixels to estimate background color
  const corners = [0, (w - 1) * 4, ((h - 1) * w) * 4, ((h - 1) * w + (w - 1)) * 4];
  let br = 0;
  let bg = 0;
  let bb = 0;
  for (const idx of corners) {
    br += data[idx];
    bg += data[idx + 1];
    bb += data[idx + 2];
  }
  br /= 4;
  bg /= 4;
  bb /= 4;

  const visited = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;

  const pushSeed = (x: number, y: number) => {
    const pos = y * w + x;
    if (visited[pos]) return;
    visited[pos] = 1;
    queue[tail++] = pos;
  };

  for (let x = 0; x < w; x++) {
    pushSeed(x, 0);
    pushSeed(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    pushSeed(0, y);
    pushSeed(w - 1, y);
  }

  const thresholdSq = 44 * 44;
  while (head < tail) {
    const pos = queue[head++];
    const pIdx = pos * 4;
    const dr = data[pIdx] - br;
    const dg = data[pIdx + 1] - bg;
    const db = data[pIdx + 2] - bb;
    const distSq = dr * dr + dg * dg + db * db;
    if (distSq > thresholdSq) continue;

    data[pIdx + 3] = 0;
    const x = pos % w;
    const y = (pos - x) / w;
    if (x > 0 && !visited[pos - 1]) {
      visited[pos - 1] = 1;
      queue[tail++] = pos - 1;
    }
    if (x < w - 1 && !visited[pos + 1]) {
      visited[pos + 1] = 1;
      queue[tail++] = pos + 1;
    }
    if (y > 0 && !visited[pos - w]) {
      visited[pos - w] = 1;
      queue[tail++] = pos - w;
    }
    if (y < h - 1 && !visited[pos + w]) {
      visited[pos + w] = 1;
      queue[tail++] = pos + w;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL('image/png');
}
