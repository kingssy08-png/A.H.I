import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { MUSIC_PRESETS } from '../data/seedData';
import type { AspectRatio, Scene, VideoProject } from '../types/studio';
import {
  KINGSSY_DOT_CENTER,
  KINGSSY_MAIN_PATH,
  KINGSSY_SVG_VIEWBOX,
  KINGSSY_SWASH_PATH,
} from '../components/AhiLoaders';
import { renderProjectAudioMixWav, svgToDataUrl } from './audioEngine';
import { drawMotionPreset } from './motionCanvas';

const DIMENSIONS_720P: Record<AspectRatio, { w: number; h: number }> = {
  '16:9': { w: 1280, h: 720 },
  '9:16': { w: 720, h: 1280 },
  '1:1': { w: 720, h: 720 },
  '21:9': { w: 1344, h: 576 },
};

const DIMENSIONS_1080P: Record<AspectRatio, { w: number; h: number }> = {
  '16:9': { w: 1920, h: 1080 },
  '9:16': { w: 1080, h: 1920 },
  '1:1': { w: 1080, h: 1080 },
  '21:9': { w: 1920, h: 822 },
};

let sharedFfmpeg: FFmpeg | null = null;

async function decodeVideoAudioBuffer(url: string): Promise<AudioBuffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const arrBuf = await res.arrayBuffer();
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    const tempCtx = new AudioCtx();
    try {
      const decoded = await tempCtx.decodeAudioData(arrBuf.slice(0));
      return decoded;
    } finally {
      void tempCtx.close().catch(() => {});
    }
  } catch {
    return null;
  }
}

function loadImageElement(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function canvasToPngBytes(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        reject(new Error('Failed to encode frame.'));
        return;
      }
      resolve(new Uint8Array(await blob.arrayBuffer()));
    }, 'image/png');
  });
}

function drawFallbackSceneFrame(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  project: VideoProject,
  loadedImages: Map<string, HTMLImageElement>,
  localT: number,
  globalT: number,
  w: number,
  h: number
) {
  ctx.fillStyle = '#07090E';
  ctx.fillRect(0, 0, w, h);

  const progress = Math.min(1, localT / Math.max(1, scene.durationSeconds));
  const keyframes = scene.storyboard?.keyframes ?? [];

  if (keyframes.length > 0) {
    const idx = Math.min(keyframes.length - 1, Math.floor(progress * keyframes.length));
    const kfUrl = svgToDataUrl(keyframes[idx].svgMarkup);
    const img = loadedImages.get(kfUrl);
    if (img) {
      const zoom = 1 + progress * 0.06;
      ctx.drawImage(img, (w - w * zoom) / 2, (h - h * zoom) / 2, w * zoom, h * zoom);
    }
  } else if (project.thumbnailUrl && loadedImages.has(project.thumbnailUrl)) {
    const img = loadedImages.get(project.thumbnailUrl);
    if (img) {
      const zoom = 1 + progress * 0.06;
      ctx.drawImage(img, (w - w * zoom) / 2, (h - h * zoom) / 2, w * zoom, h * zoom);
    }
  } else {
    drawMotionPreset(ctx, 'starfield-warp', w, h, globalT, '#2DD4BF', false);
  }

  const caption = scene.narration || scene.dialogueLines[0]?.line || scene.actionDescription;
  if (caption) {
    const scrim = ctx.createLinearGradient(0, h * 0.68, 0, h);
    scrim.addColorStop(0, 'rgba(7,9,14,0)');
    scrim.addColorStop(0.5, 'rgba(7,9,14,0.82)');
    scrim.addColorStop(1, 'rgba(7,9,14,0.96)');
    ctx.fillStyle = scrim;
    ctx.fillRect(0, h * 0.68, w, h * 0.32);

    ctx.fillStyle = '#F4F4F5';
    ctx.font = `500 ${Math.round(Math.min(w, h) * 0.036)}px "DM Sans", sans-serif`;
    ctx.textAlign = 'center';

    const words = caption.split(' ');
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (ctx.measureText(test).width > w * 0.84) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);

    const startY = h * 0.88 - (lines.length - 1) * h * 0.045;
    lines.slice(0, 3).forEach((ln, idx) => {
      ctx.fillText(ln, w / 2, startY + idx * h * 0.048);
    });
  }
}

export interface SignatureCardExportConfig {
  enabled: boolean;
  placement: 'intro' | 'outro' | 'both';
  signatureText: string;
  subtitleText?: string;
  durationSeconds?: number;
}

function easeInOutCubic(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

let cachedKingssyMainLen: number | null = null;
let cachedKingssySwashLen: number | null = null;

function measureSvgPathLength(pathD: string, fallback: number): number {
  if (typeof document === 'undefined') return fallback;
  try {
    const svgPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    svgPath.setAttribute('d', pathD);
    const len = svgPath.getTotalLength();
    return Number.isFinite(len) && len > 0 ? len : fallback;
  } catch {
    return fallback;
  }
}

function drawSignatureCardFrame(
  ctx: CanvasRenderingContext2D,
  config: SignatureCardExportConfig,
  localT: number,
  totalDur: number,
  w: number,
  h: number
) {
  // 1. Matte Obsidian Canvas Background
  ctx.fillStyle = '#07090E';
  ctx.fillRect(0, 0, w, h);

  // Fade out gracefully in final 0.3s for seamless transition into episode or end
  let masterAlpha = 1;
  if (localT > totalDur - 0.3) {
    masterAlpha = Math.max(0, (totalDur - localT) / 0.3);
  } else if (localT < 0.15) {
    masterAlpha = Math.min(1, localT / 0.15);
  }

  ctx.save();
  ctx.globalAlpha = masterAlpha;

  // 2. Subtle Electric Mint-Cyan Radial Aura
  const aura = ctx.createRadialGradient(w * 0.5, h * 0.48, 10, w * 0.5, h * 0.48, Math.max(w, h) * 0.48);
  aura.addColorStop(0, 'rgba(45, 212, 191, 0.16)');
  aura.addColorStop(0.5, 'rgba(52, 211, 153, 0.05)');
  aura.addColorStop(1, 'rgba(7, 9, 14, 0)');
  ctx.fillStyle = aura;
  ctx.fillRect(0, 0, w, h);

  // Subtle dark frosted inner frame border
  const pad = Math.round(Math.min(w, h) * 0.045);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
  ctx.lineWidth = Math.max(1.5, w * 0.0014);
  ctx.strokeRect(pad, pad, w - pad * 2, h - pad * 2);

  // 3. Calligraphic Stroke Reveal (0s .. 1.6s ease-in-out)
  const drawProgress = easeInOutCubic(Math.min(1, localT / 1.6));

  // Light-beam sweep timing (1.6s .. 2.0s)
  const beamPhase = localT >= 1.58 && localT <= 2.04 ? (localT - 1.58) / 0.46 : -1;
  const beamBoost = beamPhase >= 0 ? Math.sin(beamPhase * Math.PI) : 0;

  const sigText = (config.signatureText || 'Kingssy').trim();
  const isKingssySignature = /^kingssy$/i.test(sigText);

  if (isKingssySignature && typeof Path2D !== 'undefined') {
    // Draw the exact continuous calligraphic "Kingssy" stroke using Path2D + setLineDash trim-path
    const svgW = KINGSSY_SVG_VIEWBOX.width;
    const svgH = KINGSSY_SVG_VIEWBOX.height;
    const scale = Math.min((w * 0.58) / svgW, (h * 0.44) / svgH);
    const ox = (w - svgW * scale) / 2;
    const oy = h * 0.45 - (svgH * scale) / 2;

    if (cachedKingssyMainLen === null) {
      cachedKingssyMainLen = measureSvgPathLength(KINGSSY_MAIN_PATH, 2400);
    }
    if (cachedKingssySwashLen === null) {
      cachedKingssySwashLen = measureSvgPathLength(KINGSSY_SWASH_PATH, 500);
    }

    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);

    const mainPath = new Path2D(KINGSSY_MAIN_PATH);
    const mainLen = cachedKingssyMainLen;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4.8;
    ctx.strokeStyle = '#F8FAFC';
    ctx.shadowColor = '#2DD4BF';
    ctx.shadowBlur = 16 + beamBoost * 22;
    ctx.setLineDash([mainLen, mainLen]);
    ctx.lineDashOffset = mainLen * (1 - drawProgress);
    ctx.stroke(mainPath);

    // Calligraphic underline swash + 'i' dot reveal in second half of stroke
    const swashProgress = easeInOutCubic(Math.max(0, Math.min(1, (localT - 0.85) / 0.9)));
    if (swashProgress > 0) {
      const swashPath = new Path2D(KINGSSY_SWASH_PATH);
      const swashLen = cachedKingssySwashLen;
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = '#2DD4BF';
      ctx.setLineDash([swashLen, swashLen]);
      ctx.lineDashOffset = swashLen * (1 - swashProgress);
      ctx.stroke(swashPath);

      ctx.save();
      ctx.globalAlpha = masterAlpha * Math.min(1, swashProgress * 1.4);
      ctx.fillStyle = '#2DD4BF';
      ctx.beginPath();
      ctx.arc(KINGSSY_DOT_CENTER.x, KINGSSY_DOT_CENTER.y, 3.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  } else {
    // Custom Show Name / Creator Signature in Great Vibes calligraphy + Mint-Cyan swash underline
    const maxFontPx = Math.round(Math.min(w * 0.115, h * 0.22));
    let fontPx = maxFontPx;
    ctx.font = `400 ${fontPx}px "Great Vibes", "Brush Script MT", cursive`;
    const measured = ctx.measureText(sigText).width;
    if (measured > w * 0.78) {
      fontPx = Math.max(32, Math.floor(fontPx * ((w * 0.78) / measured)));
      ctx.font = `400 ${fontPx}px "Great Vibes", "Brush Script MT", cursive`;
    }

    const textWidth = Math.min(w * 0.82, Math.max(220, ctx.measureText(sigText).width + 48));
    const centerY = h * 0.47;
    const revealLeft = w / 2 - textWidth / 2;
    const revealWidth = textWidth * drawProgress;

    ctx.save();
    ctx.beginPath();
    ctx.rect(revealLeft, centerY - fontPx * 1.15, revealWidth, fontPx * 1.9);
    ctx.clip();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#F8FAFC';
    ctx.shadowColor = '#2DD4BF';
    ctx.shadowBlur = 18 + beamBoost * 24;
    ctx.fillText(sigText, w / 2, centerY);
    ctx.restore();

    // Flowing Mint-Cyan Calligraphic Swash Underline
    const swashW = Math.min(w * 0.56, textWidth * 0.85);
    const sx = w / 2 - swashW / 2;
    const sy = centerY + fontPx * 0.58;
    const swashPath = new Path2D(
      `M ${sx} ${sy + 4} C ${sx + swashW * 0.28} ${sy - 10}, ${sx + swashW * 0.68} ${sy - 12}, ${sx + swashW} ${sy - 2}`
    );
    ctx.save();
    const swashGrad = ctx.createLinearGradient(sx, sy, sx + swashW, sy);
    swashGrad.addColorStop(0, 'rgba(45, 212, 191, 0.25)');
    swashGrad.addColorStop(0.45, '#F8FAFC');
    swashGrad.addColorStop(0.8, '#2DD4BF');
    swashGrad.addColorStop(1, '#34D399');
    ctx.strokeStyle = swashGrad;
    ctx.lineWidth = Math.max(2.2, w * 0.0022);
    ctx.lineCap = 'round';
    ctx.shadowColor = '#2DD4BF';
    ctx.shadowBlur = 12 + beamBoost * 16;
    ctx.setLineDash([swashW * 1.25, swashW * 1.25]);
    ctx.lineDashOffset = swashW * 1.25 * (1 - drawProgress);
    ctx.stroke(swashPath);
    ctx.restore();
  }

  // Subtle Creator Subtitle
  const sub = (config.subtitleText || '').trim();
  if (sub) {
    const subAlpha = Math.max(0, Math.min(1, (localT - 0.55) / 0.6));
    ctx.save();
    ctx.globalAlpha = masterAlpha * subAlpha;
    ctx.fillStyle = '#94A3B8';
    ctx.font = `600 ${Math.round(Math.min(w, h) * 0.022)}px "Plus Jakarta Sans", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(sub.toUpperCase().split('').join(' '), w / 2, h * 0.66);
    ctx.restore();
  }

  // 4. Diagonal Electric Mint-Cyan Light-Beam Streak (1.6s -> 2.0s)
  if (beamPhase >= 0 && beamPhase <= 1) {
    ctx.save();
    const beamX = -w * 0.35 + beamPhase * (w * 1.7);
    const beamW = Math.max(90, w * 0.16);
    ctx.translate(beamX, h / 2);
    ctx.rotate((-22 * Math.PI) / 180);
    const beamGrad = ctx.createLinearGradient(-beamW / 2, 0, beamW / 2, 0);
    beamGrad.addColorStop(0, 'rgba(45, 212, 191, 0)');
    beamGrad.addColorStop(0.32, 'rgba(45, 212, 191, 0.25)');
    beamGrad.addColorStop(0.5, 'rgba(248, 250, 252, 0.68)');
    beamGrad.addColorStop(0.68, 'rgba(52, 211, 153, 0.28)');
    beamGrad.addColorStop(1, 'rgba(45, 212, 191, 0)');
    ctx.fillStyle = beamGrad;
    ctx.fillRect(-beamW / 2, -h, beamW, h * 2);
    ctx.restore();
  }

  ctx.restore();
}

export async function compileProjectToMp4WithFfmpeg(
  project: VideoProject,
  options: {
    includeAudio?: boolean;
    musicId?: string;
    resolution?: '720p' | '1080p';
    enableAutoDuck?: boolean;
    includeFoley?: boolean;
    signatureCard?: SignatureCardExportConfig;
    onProgress?: (percent: number, phase: string) => void;
  } = {}
): Promise<string> {
  const {
    includeAudio = true,
    musicId,
    resolution = '1080p',
    enableAutoDuck = true,
    includeFoley = true,
    signatureCard,
    onProgress,
  } = options;
  const dimsTable = resolution === '1080p' ? DIMENSIONS_1080P : DIMENSIONS_720P;
  const dims = dimsTable[project.aspectRatio] ?? dimsTable['16:9'];
  const fps = 24;
  const captureFps = 12;

  onProgress?.(5, `Preparing ${resolution} video assembler...`);
  if (!sharedFfmpeg) {
    sharedFfmpeg = new FFmpeg();
  }
  const ffmpeg = sharedFfmpeg;
  if (!ffmpeg.loaded) {
    await ffmpeg.load({
      coreURL: await toBlobURL('/ffmpeg-core/ffmpeg-core.js', 'text/javascript'),
      wasmURL: await toBlobURL('/ffmpeg-core/ffmpeg-core.wasm', 'application/wasm'),
    });
  }

  if (typeof document !== 'undefined' && 'fonts' in document) {
    try {
      await document.fonts.ready;
    } catch {
      // ignore font loading timeout
    }
  }

  // Preload fallback images
  const imageUrls = new Set<string>();
  if (project.thumbnailUrl) imageUrls.add(project.thumbnailUrl);
  for (const sc of project.scenes) {
    for (const kf of sc.storyboard?.keyframes ?? []) {
      imageUrls.add(svgToDataUrl(kf.svgMarkup));
    }
  }
  const loadedImages = new Map<string, HTMLImageElement>();
  await Promise.all(
    Array.from(imageUrls).map(async (url) => {
      const img = await loadImageElement(url);
      if (img) loadedImages.set(url, img);
    })
  );

  const canvas = document.createElement('canvas');
  canvas.width = dims.w;
  canvas.height = dims.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable.');

  const segmentFiles: string[] = [];
  const totalScenes = Math.max(1, project.scenes.length);

  // Optional Animated Calligraphy Signature Intro / Outro Clip
  const useSignatureCard = Boolean(signatureCard?.enabled && signatureCard.signatureText.trim());
  const sigDuration = useSignatureCard
    ? Math.max(2.2, Math.min(4.0, signatureCard?.durationSeconds ?? 2.6))
    : 0;
  const includeIntro =
    useSignatureCard &&
    (signatureCard?.placement === 'intro' || signatureCard?.placement === 'both');
  const includeOutro =
    useSignatureCard &&
    (signatureCard?.placement === 'outro' || signatureCard?.placement === 'both');

  let sigCardFile: string | null = null;
  if (useSignatureCard && signatureCard) {
    onProgress?.(8, 'Rendering animated calligraphy signature card...');
    const sigFps = 16;
    const sigFrames = Math.max(24, Math.round(sigDuration * sigFps));
    for (let f = 0; f < sigFrames; f++) {
      const localT = f / sigFps;
      drawSignatureCardFrame(ctx, signatureCard, localT, sigDuration, dims.w, dims.h);
      const png = await canvasToPngBytes(canvas);
      await ffmpeg.writeFile(`sig_${String(f).padStart(4, '0')}.png`, png);
    }
    sigCardFile = 'sig_card.mp4';
    await ffmpeg.exec([
      '-framerate',
      String(sigFps),
      '-i',
      'sig_%04d.png',
      '-c:v',
      'libx264',
      '-r',
      String(fps),
      '-pix_fmt',
      'yuv420p',
      '-preset',
      'ultrafast',
      sigCardFile,
    ]);
    for (let f = 0; f < sigFrames; f++) {
      await ffmpeg.deleteFile(`sig_${String(f).padStart(4, '0')}.png`);
    }
    if (includeIntro) {
      segmentFiles.push(sigCardFile);
    }
  }

  const introOffsetSec = includeIntro ? sigDuration : 0;
  let scenesDurationSec = 0;

  for (let i = 0; i < project.scenes.length; i++) {
    const sc = project.scenes[i];
    const segName = `seg_${i}.mp4`;
    onProgress?.(
      Math.round(12 + (i / totalScenes) * 63),
      `Stitching Scene ${sc.sceneNumber} of ${totalScenes}...`
    );

    let usedClip = false;
    if (sc.generatedVideoUrl) {
      try {
        const clipBytes = await fetchFile(sc.generatedVideoUrl);
        const rawName = `raw_${i}.mp4`;
        await ffmpeg.writeFile(rawName, clipBytes);
        const code = await ffmpeg.exec([
          '-stream_loop',
          '-1',
          '-i',
          rawName,
          '-t',
          String(sc.durationSeconds),
          '-vf',
          `scale=${dims.w}:${dims.h}:force_original_aspect_ratio=increase,crop=${dims.w}:${dims.h},setsar=1`,
          '-r',
          String(fps),
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          '-preset',
          'ultrafast',
          '-an',
          segName,
        ]);
        await ffmpeg.deleteFile(rawName);
        if (code === 0) usedClip = true;
      } catch {
        usedClip = false;
      }
    }

    if (!usedClip) {
      const frameCount = Math.max(12, Math.round(sc.durationSeconds * captureFps));
      for (let f = 0; f < frameCount; f++) {
        const localT = f / captureFps;
        drawFallbackSceneFrame(
          ctx,
          sc,
          project,
          loadedImages,
          localT,
          scenesDurationSec + localT,
          dims.w,
          dims.h
        );
        const png = await canvasToPngBytes(canvas);
        await ffmpeg.writeFile(`sc${i}_${String(f).padStart(4, '0')}.png`, png);
      }
      await ffmpeg.exec([
        '-framerate',
        String(captureFps),
        '-i',
        `sc${i}_%04d.png`,
        '-c:v',
        'libx264',
        '-r',
        String(fps),
        '-pix_fmt',
        'yuv420p',
        '-preset',
        'ultrafast',
        segName,
      ]);
      for (let f = 0; f < frameCount; f++) {
        await ffmpeg.deleteFile(`sc${i}_${String(f).padStart(4, '0')}.png`);
      }
    }

    segmentFiles.push(segName);
    scenesDurationSec += sc.durationSeconds;
  }

  if (includeOutro && sigCardFile) {
    segmentFiles.push(sigCardFile);
  }

  const totalVideoDuration =
    introOffsetSec + scenesDurationSec + (includeOutro ? sigDuration : 0);
  const shimmerTimes: number[] = [];
  if (includeIntro) shimmerTimes.push(1.58);
  if (includeOutro) shimmerTimes.push(introOffsetSec + scenesDurationSec + 1.58);

  const concatManifest = segmentFiles.map((s) => `file '${s}'`).join('\n');
  await ffmpeg.writeFile('concat.txt', concatManifest);

  const selectedMusic =
    MUSIC_PRESETS.find((m) => m.id === (musicId ?? project.selectedMusicId)) ?? MUSIC_PRESETS[0];

  if (includeAudio && totalVideoDuration > 0) {
    onProgress?.(82, 'Mixing dialogue, Foley SFX, and auto-ducked score...');
    const decodedSceneBuffers = await Promise.all(
      project.scenes.map(async (sc) => {
        if (!sc.voiceAudioBase64 && sc.generatedVideoUrl && sc.generatedVideoMode === 'lipsync') {
          return decodeVideoAudioBuffer(sc.generatedVideoUrl);
        }
        return null;
      })
    );

    const wavBytes = await renderProjectAudioMixWav({
      totalDurationSec: totalVideoDuration,
      titleSlateDurationSec: introOffsetSec,
      signatureShimmerTimes: shimmerTimes,
      musicPreset: selectedMusic,
      musicGain: musicId === 'none' ? 0 : 0.25,
      enableAutoDuck,
      includeFoley,
      scenes: project.scenes.map((sc, idx) => ({
        durationSeconds: sc.durationSeconds,
        voiceAudioBase64: sc.voiceAudioBase64,
        sfxPresetId: sc.sfxPresetId,
        clipVoiceBuffer: decodedSceneBuffers[idx],
      })),
    });
    await ffmpeg.writeFile('mix.wav', wavBytes);

    onProgress?.(90, 'Finalizing clean MP4 download...');
    await ffmpeg.exec([
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      'concat.txt',
      '-i',
      'mix.wav',
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-shortest',
      '-movflags',
      '+faststart',
      'output.mp4',
    ]);
    await ffmpeg.deleteFile('mix.wav');
  } else {
    onProgress?.(90, 'Finalizing clean MP4 download...');
    await ffmpeg.exec([
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      'concat.txt',
      '-c:v',
      'copy',
      '-movflags',
      '+faststart',
      'output.mp4',
    ]);
  }

  const outData = await ffmpeg.readFile('output.mp4');
  const outBytes =
    typeof outData === 'string'
      ? new TextEncoder().encode(outData)
      : new Uint8Array(outData);
  const mp4Blob = new Blob([outBytes], { type: 'video/mp4' });
  const mp4Url = URL.createObjectURL(mp4Blob);

  await ffmpeg.deleteFile('concat.txt');
  await ffmpeg.deleteFile('output.mp4');
  const uniqueSegs = Array.from(new Set(segmentFiles));
  for (const seg of uniqueSegs) {
    await ffmpeg.deleteFile(seg);
  }

  onProgress?.(100, 'Video ready!');
  return mp4Url;
}

export async function stitchConversationClipsWithFfmpeg(
  clipUrls: string[],
  aspectRatio: AspectRatio = '16:9',
  onProgress?: (percent: number, phase: string) => void
): Promise<string> {
  if (clipUrls.length === 0) {
    throw new Error('No dialogue turn clips available to stitch.');
  }
  if (clipUrls.length === 1) {
    return clipUrls[0];
  }

  const dims = DIMENSIONS_720P[aspectRatio] ?? DIMENSIONS_720P['16:9'];
  onProgress?.(91, 'Loading FFmpeg.wasm to stitch conversation turns...');

  if (!sharedFfmpeg) {
    sharedFfmpeg = new FFmpeg();
  }
  const ffmpeg = sharedFfmpeg;
  if (!ffmpeg.loaded) {
    await ffmpeg.load({
      coreURL: await toBlobURL('/ffmpeg-core/ffmpeg-core.js', 'text/javascript'),
      wasmURL: await toBlobURL('/ffmpeg-core/ffmpeg-core.wasm', 'application/wasm'),
    });
  }

  const normalizedSegments: string[] = [];
  for (let i = 0; i < clipUrls.length; i++) {
    const rawName = `conv_raw_${i}.mp4`;
    const segName = `conv_seg_${i}.mp4`;
    onProgress?.(
      Math.round(92 + (i / clipUrls.length) * 5),
      `Stitching dialogue turn ${i + 1} of ${clipUrls.length}...`
    );

    const bytes = await fetchFile(clipUrls[i]);
    await ffmpeg.writeFile(rawName, bytes);

    // Normalize video resolution/fps and audio sample rate so concat preserves audio cleanly
    const code = await ffmpeg.exec([
      '-i',
      rawName,
      '-vf',
      `scale=${dims.w}:${dims.h}:force_original_aspect_ratio=increase,crop=${dims.w}:${dims.h},setsar=1`,
      '-r',
      '24',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-preset',
      'ultrafast',
      '-c:a',
      'aac',
      '-ar',
      '44100',
      '-ac',
      '2',
      '-b:a',
      '128k',
      segName,
    ]);
    await ffmpeg.deleteFile(rawName);
    if (code === 0) {
      normalizedSegments.push(segName);
    }
  }

  if (normalizedSegments.length === 0) {
    return clipUrls[0];
  }

  const concatManifest = normalizedSegments.map((s) => `file '${s}'`).join('\n');
  await ffmpeg.writeFile('conv_concat.txt', concatManifest);

  onProgress?.(98, 'Finalizing multi-speaker MP4...');
  await ffmpeg.exec([
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    'conv_concat.txt',
    '-c',
    'copy',
    '-movflags',
    '+faststart',
    'conv_output.mp4',
  ]);

  const outData = await ffmpeg.readFile('conv_output.mp4');
  const outBytes =
    typeof outData === 'string'
      ? new TextEncoder().encode(outData)
      : new Uint8Array(outData);
  const mp4Blob = new Blob([outBytes], { type: 'video/mp4' });
  const mp4Url = URL.createObjectURL(mp4Blob);

  await ffmpeg.deleteFile('conv_concat.txt');
  await ffmpeg.deleteFile('conv_output.mp4');
  for (const seg of normalizedSegments) {
    await ffmpeg.deleteFile(seg);
  }

  onProgress?.(100, 'Conversation scene ready!');
  return mp4Url;
}

