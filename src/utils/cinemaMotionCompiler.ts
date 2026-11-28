import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import type { AnimationStyle, AspectRatio, CameraMotion } from '../types/studio';

const CINEMA_DIMS_BY_RATIO: Record<AspectRatio, { w: number; h: number }> = {
  '16:9': { w: 1280, h: 720 },
  '9:16': { w: 720, h: 1280 },
  '1:1': { w: 1024, h: 1024 },
  '21:9': { w: 1344, h: 576 },
};

let sharedMotionFfmpeg: FFmpeg | null = null;
let ffmpegLoadPromise: Promise<FFmpeg> | null = null;

async function getMotionFfmpeg(): Promise<FFmpeg> {
  if (sharedMotionFfmpeg?.loaded) return sharedMotionFfmpeg;
  if (ffmpegLoadPromise) return ffmpegLoadPromise;

  ffmpegLoadPromise = (async () => {
    const instance = sharedMotionFfmpeg ?? new FFmpeg();
    sharedMotionFfmpeg = instance;
    if (!instance.loaded) {
      await instance.load({
        coreURL: await toBlobURL('/ffmpeg-core/ffmpeg-core.js', 'text/javascript'),
        wasmURL: await toBlobURL('/ffmpeg-core/ffmpeg-core.wasm', 'application/wasm'),
      });
    }
    return instance;
  })();

  try {
    return await ffmpegLoadPromise;
  } catch (err) {
    ffmpegLoadPromise = null;
    throw err;
  }
}

function loadImageForCanvas(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode scene image frame.'));
    img.src = src;
  });
}

function canvasToJpegBytes(canvas: HTMLCanvasElement, quality = 0.92): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          reject(new Error('Failed to encode motion frame.'));
          return;
        }
        resolve(new Uint8Array(await blob.arrayBuffer()));
      },
      'image/jpeg',
      quality
    );
  });
}

function easeInOutSine(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return -(Math.cos(Math.PI * x) - 1) / 2;
}

export interface CinemaMotionOptions {
  imageDataUrl: string;
  aspectRatio?: AspectRatio;
  cameraMotion?: CameraMotion | string;
  style?: AnimationStyle | string;
  audioDataUrl?: string;
  durationSeconds?: number;
  onProgress?: (progressPct: number, message: string) => void;
}

export interface CinemaMotionResult {
  videoUrl: string;
  width: number;
  height: number;
  durationSeconds: number;
}

/**
 * Tier 3 Cinema Motion Fallback:
 * Compiles a smooth 5-second, high-definition, watermark-free MP4 clip directly in the browser
 * using FFmpeg.wasm from a generated Cloudflare Workers AI scene frame, complete with smooth
 * eased camera movement, warm sunlit film atmosphere, and synced voice/audio if provided.
 */
export async function compileCinemaMotionMp4WithFfmpeg(
  options: CinemaMotionOptions
): Promise<CinemaMotionResult> {
  const ratio: AspectRatio = options.aspectRatio ?? '16:9';
  const dims = CINEMA_DIMS_BY_RATIO[ratio] ?? CINEMA_DIMS_BY_RATIO['16:9'];
  const durationSec = Math.max(3, Math.min(8, options.durationSeconds ?? 5));
  const fps = 24;
  const totalFrames = Math.round(durationSec * fps);
  const motion = options.cameraMotion ?? 'Slow Dolly In';
  const isWarmStorybook = options.style === 'Warm Storybook 3D';

  options.onProgress?.(64, 'Creating your video...');

  const [img, ffmpeg] = await Promise.all([
    loadImageForCanvas(options.imageDataUrl),
    getMotionFfmpeg(),
  ]);

  const canvas = document.createElement('canvas');
  canvas.width = dims.w;
  canvas.height = dims.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not initialize motion rendering canvas.');
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const jobPrefix = `cm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const srcRatio = img.naturalWidth / Math.max(1, img.naturalHeight);
  const dstRatio = dims.w / dims.h;

  // Base cover dimensions so the source fills target aspect ratio with zero blank margins
  const baseCoverW = srcRatio > dstRatio ? dims.h * srcRatio : dims.w;
  const baseCoverH = srcRatio > dstRatio ? dims.h : dims.w / Math.max(0.01, srcRatio);

  for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
    const t = frameIdx / Math.max(1, totalFrames - 1);
    const eased = easeInOutSine(t);

    let scale = 1.04;
    let panX = 0;
    let panY = 0;

    switch (motion) {
      case 'Slow Dolly Out':
      case 'Zoom Out':
        scale = 1.13 - eased * 0.09;
        panY = (0.5 - eased) * dims.h * 0.01;
        break;
      case 'Pan Left':
        scale = 1.1;
        panX = (0.5 - eased) * dims.w * 0.065;
        break;
      case 'Pan Right':
        scale = 1.1;
        panX = (eased - 0.5) * dims.w * 0.065;
        break;
      case 'Crane Up':
      case 'Drone Flyover':
        scale = 1.09;
        panY = (0.5 - eased) * dims.h * 0.055;
        break;
      case 'Handheld Orbit':
      case 'Orbit':
        scale = 1.07 + Math.sin(t * Math.PI) * 0.025;
        panX = Math.sin(t * Math.PI * 1.5) * dims.w * 0.022;
        panY = Math.cos(t * Math.PI * 1.2) * dims.h * 0.014;
        break;
      case 'Static':
        scale = 1.02 + Math.sin(t * Math.PI) * 0.01;
        panX = Math.sin(t * Math.PI * 2) * dims.w * 0.004;
        panY = Math.cos(t * Math.PI * 2) * dims.h * 0.003;
        break;
      case 'Slow Dolly In':
      case 'Zoom In':
      case 'Auto':
      default:
        scale = 1.01 + eased * 0.1;
        panY = -eased * dims.h * 0.012;
        break;
    }

    const drawW = baseCoverW * scale;
    const drawH = baseCoverH * scale;
    const drawX = (dims.w - drawW) / 2 + panX;
    const drawY = (dims.h - drawH) / 2 + panY;

    ctx.clearRect(0, 0, dims.w, dims.h);
    ctx.drawImage(img, drawX, drawY, drawW, drawH);

    // Subtle warm sunlit atmospheric bloom & floating golden motes
    const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2);
    const sunGrad = ctx.createRadialGradient(
      dims.w * (0.28 + eased * 0.06),
      dims.h * 0.18,
      dims.w * 0.04,
      dims.w * (0.28 + eased * 0.06),
      dims.h * 0.18,
      dims.w * 0.72
    );
    sunGrad.addColorStop(
      0,
      isWarmStorybook
        ? `rgba(255, 238, 198, ${(0.11 + pulse * 0.03).toFixed(3)})`
        : `rgba(255, 226, 175, ${(0.06 + pulse * 0.025).toFixed(3)})`
    );
    sunGrad.addColorStop(1, 'rgba(255, 226, 175, 0)');
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = sunGrad;
    ctx.fillRect(0, 0, dims.w, dims.h);
    ctx.restore();

    // Subtle cinematic edge vignette (keeps center crisp and warm)
    const vig = ctx.createRadialGradient(
      dims.w * 0.5,
      dims.h * 0.5,
      Math.min(dims.w, dims.h) * 0.36,
      dims.w * 0.5,
      dims.h * 0.5,
      Math.max(dims.w, dims.h) * 0.76
    );
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, isWarmStorybook ? 'rgba(32, 22, 14, 0.14)' : 'rgba(7, 9, 14, 0.2)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, dims.w, dims.h);

    const frameFile = `${jobPrefix}_${String(frameIdx).padStart(4, '0')}.jpg`;
    const jpgBytes = await canvasToJpegBytes(canvas, 0.92);
    await ffmpeg.writeFile(frameFile, jpgBytes);

    if (frameIdx % 20 === 0) {
      options.onProgress?.(66 + Math.round((frameIdx / totalFrames) * 20), 'Creating your video...');
    }
  }

  options.onProgress?.(88, 'Creating your video...');

  const outFile = `${jobPrefix}_out.mp4`;
  let audioFile: string | null = null;
  if (options.audioDataUrl && options.audioDataUrl.trim().length > 16) {
    try {
      audioFile = `${jobPrefix}_audio.wav`;
      const audioBytes = await fetchFile(options.audioDataUrl);
      await ffmpeg.writeFile(audioFile, audioBytes);
    } catch {
      audioFile = null;
    }
  }

  const args: string[] = [
    '-framerate',
    String(fps),
    '-i',
    `${jobPrefix}_%04d.jpg`,
    ...(audioFile ? ['-i', audioFile] : []),
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-preset',
    'ultrafast',
    '-crf',
    '20',
    ...(audioFile ? ['-c:a', 'aac', '-b:a', '128k', '-shortest'] : []),
    '-movflags',
    '+faststart',
    outFile,
  ];

  await ffmpeg.exec(args);

  const rawOut = await ffmpeg.readFile(outFile);
  const outBytes =
    typeof rawOut === 'string' ? new TextEncoder().encode(rawOut) : new Uint8Array(rawOut);
  const mp4Blob = new Blob([outBytes], { type: 'video/mp4' });
  const videoUrl = URL.createObjectURL(mp4Blob);

  // Clean up virtual filesystem
  await ffmpeg.deleteFile(outFile).catch(() => {});
  if (audioFile) await ffmpeg.deleteFile(audioFile).catch(() => {});
  for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
    await ffmpeg
      .deleteFile(`${jobPrefix}_${String(frameIdx).padStart(4, '0')}.jpg`)
      .catch(() => {});
  }

  options.onProgress?.(100, 'Video ready');
  return {
    videoUrl,
    width: dims.w,
    height: dims.h,
    durationSeconds: durationSec,
  };
}
