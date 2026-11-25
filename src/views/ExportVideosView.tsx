import { useEffect, useMemo, useRef, useState } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import {
  Download,
  FileCode2,
  FileText,
  Film,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Upload,
  Video,
} from 'lucide-react';
import { MUSIC_PRESETS } from '../data/seedData';
import { STOCK_ASSETS } from '../data/stockAssets';
import type { AspectRatio, Scene, VideoProject } from '../types/studio';
import {
  formatTimecode,
  renderProjectAudioMixWav,
  svgToDataUrl,
} from '../utils/audioEngine';
import { drawMotionPreset } from '../utils/motionCanvas';

interface ExportVideosViewProps {
  projects: VideoProject[];
  activeProject: VideoProject;
  onSelectProject: (projectId: string) => void;
  onExportAhiProject: (projectId: string) => void;
  onImportAhiFile: (file: File) => void;
}

const ASPECT_PRESETS: Array<{
  id: AspectRatio;
  label: string;
  w: number;
  h: number;
}> = [
  { id: '16:9', label: '16:9 Widescreen (1280 × 720)', w: 1280, h: 720 },
  { id: '9:16', label: '9:16 Vertical Reel (720 × 1280)', w: 720, h: 1280 },
  { id: '1:1', label: '1:1 Square Feed (720 × 720)', w: 720, h: 720 },
  { id: '21:9', label: '21:9 CinemaScope (1344 × 576)', w: 1344, h: 576 },
];

export function ExportVideosView({
  projects,
  activeProject,
  onSelectProject,
  onExportAhiProject,
  onImportAhiFile,
}: ExportVideosViewProps) {
  const [exportRatio, setExportRatio] = useState<AspectRatio>(activeProject.aspectRatio);
  const [fps, setFps] = useState<24 | 30>(24);
  const [includeSubtitles, setIncludeSubtitles] = useState(true);
  const [includeTitleSlate, setIncludeTitleSlate] = useState(true);
  const [includeMotionOverlays, setIncludeMotionOverlays] = useState(true);
  const [includeAudioMix, setIncludeAudioMix] = useState(true);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isRendering, setIsRendering] = useState(false);
  const [renderPhase, setRenderPhase] = useState('');
  const [renderProgress, setRenderProgress] = useState(0);
  const [exportedMp4Url, setExportedMp4Url] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const loadedImagesRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const ffmpegRef = useRef<FFmpeg | null>(null);

  useEffect(() => {
    setExportRatio(activeProject.aspectRatio);
    setExportedMp4Url(null);
  }, [activeProject.id, activeProject.aspectRatio]);

  const titleSlateDuration = includeTitleSlate ? 3 : 0;
  const scenesDuration = activeProject.scenes.reduce((sum, s) => sum + s.durationSeconds, 0);
  const totalDuration = titleSlateDuration + scenesDuration;

  const resConfig =
    ASPECT_PRESETS.find((r) => r.id === exportRatio) ?? ASPECT_PRESETS[0];

  const selectedMusicPreset = useMemo(() => {
    const preset = MUSIC_PRESETS.find((m) => m.id === activeProject.selectedMusicId);
    if (preset) return preset;
    const stock = STOCK_ASSETS.find(
      (s) => s.id === activeProject.selectedMusicId && s.musicConfig
    );
    if (stock?.musicConfig) {
      return {
        id: stock.id,
        title: stock.title,
        mood: stock.category,
        description: stock.resolutionOrBpm,
        ...stock.musicConfig,
      };
    }
    return MUSIC_PRESETS[0];
  }, [activeProject.selectedMusicId]);

  useEffect(() => {
    const urls = new Set<string>();
    if (activeProject.thumbnailUrl) urls.add(activeProject.thumbnailUrl);
    for (const sc of activeProject.scenes) {
      for (const kf of sc.storyboard?.keyframes ?? []) {
        urls.add(svgToDataUrl(kf.svgMarkup));
      }
      for (const asset of sc.attachedAssets ?? []) {
        if (asset.previewImageUrl) urls.add(asset.previewImageUrl);
      }
    }

    urls.forEach((url) => {
      if (!loadedImagesRef.current.has(url)) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = url;
        loadedImagesRef.current.set(url, img);
      }
    });
  }, [activeProject]);

  const drawTitleSlate = (ctx: CanvasRenderingContext2D, t: number, w: number, h: number) => {
    ctx.fillStyle = '#09090B';
    ctx.fillRect(0, 0, w, h);
    const alpha = Math.min(1, t * 1.4 + 0.15, (titleSlateDuration - t) * 1.6 + 0.15);
    ctx.save();
    ctx.globalAlpha = Math.max(0.1, alpha);

    if (activeProject.thumbnailUrl) {
      const bgImg = loadedImagesRef.current.get(activeProject.thumbnailUrl);
      if (bgImg && bgImg.complete && bgImg.naturalWidth > 0) {
        ctx.globalAlpha = 0.28 * alpha;
        ctx.drawImage(bgImg, 0, 0, w, h);
        ctx.globalAlpha = Math.max(0.1, alpha);
      }
    }

    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(9,9,11,0.65)');
    grad.addColorStop(1, 'rgba(9,9,11,0.92)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = '#22D3EE';
    ctx.font = `600 ${Math.round(Math.min(w, h) * 0.036)}px "Plus Jakarta Sans", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(activeProject.style.toUpperCase(), w / 2, h * 0.4);

    ctx.fillStyle = '#F4F4F5';
    ctx.font = `700 ${Math.round(Math.min(w, h) * 0.072)}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillText(activeProject.title, w / 2, h * 0.49);

    ctx.fillStyle = '#D4D4D8';
    ctx.font = `400 ${Math.round(Math.min(w, h) * 0.03)}px "DM Sans", sans-serif`;
    const words = activeProject.logline.split(' ');
    let line = '';
    let y = h * 0.57;
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > w * 0.78) {
        ctx.fillText(line, w / 2, y);
        line = word;
        y += h * 0.045;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, w / 2, y);
    ctx.restore();
  };

  const drawSceneFrame = (
    ctx: CanvasRenderingContext2D,
    targetScene: Scene,
    sceneLocalTime: number,
    globalTime: number,
    w: number,
    h: number
  ) => {
    ctx.fillStyle = '#09090B';
    ctx.fillRect(0, 0, w, h);

    const sceneProgress = Math.min(
      1,
      sceneLocalTime / Math.max(1, targetScene.durationSeconds)
    );

    const keyframes = targetScene.storyboard?.keyframes ?? [];
    const attachedImage = targetScene.attachedAssets?.find(
      (a) => a.type === 'image' && a.previewImageUrl
    );
    const attachedVideo = targetScene.attachedAssets?.find(
      (a) => a.type === 'video' && a.motionPreset
    );

    if (keyframes.length > 0) {
      const kfIdx = Math.min(keyframes.length - 1, Math.floor(sceneProgress * keyframes.length));
      const kfUrl = svgToDataUrl(keyframes[kfIdx].svgMarkup);
      const img = loadedImagesRef.current.get(kfUrl);
      if (img && img.complete && img.naturalWidth > 0) {
        const zoom = 1 + sceneProgress * 0.06;
        const dw = w * zoom;
        const dh = h * zoom;
        ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
      }
    } else if (attachedImage?.previewImageUrl) {
      const img = loadedImagesRef.current.get(attachedImage.previewImageUrl);
      if (img && img.complete && img.naturalWidth > 0) {
        const zoom = 1 + sceneProgress * 0.08;
        ctx.drawImage(img, (w - w * zoom) / 2, (h - h * zoom) / 2, w * zoom, h * zoom);
      }
    } else if (attachedVideo?.motionPreset) {
      drawMotionPreset(ctx, attachedVideo.motionPreset, w, h, globalTime, attachedVideo.accentColor, false);
    } else if (activeProject.thumbnailUrl) {
      const img = loadedImagesRef.current.get(activeProject.thumbnailUrl);
      if (img && img.complete && img.naturalWidth > 0) {
        const zoom = 1 + sceneProgress * 0.06;
        ctx.drawImage(img, (w - w * zoom) / 2, (h - h * zoom) / 2, w * zoom, h * zoom);
      }
    }

    if (includeMotionOverlays && attachedVideo?.motionPreset && keyframes.length > 0) {
      ctx.save();
      ctx.globalAlpha = 0.45;
      drawMotionPreset(ctx, attachedVideo.motionPreset, w, h, globalTime, attachedVideo.accentColor, true);
      ctx.restore();
    }

    ctx.save();
    ctx.fillStyle = 'rgba(9, 9, 11, 0.72)';
    ctx.fillRect(w * 0.03, h * 0.04, Math.min(w * 0.55, 380), h * 0.07);
    ctx.fillStyle = '#22D3EE';
    ctx.font = `600 ${Math.round(Math.min(w, h) * 0.024)}px "JetBrains Mono", monospace`;
    ctx.textAlign = 'left';
    ctx.fillText(
      `S${String(targetScene.sceneNumber).padStart(2, '0')} · ${targetScene.cameraAngle}`,
      w * 0.045,
      h * 0.085
    );
    ctx.restore();

    if (includeSubtitles) {
      const caption = targetScene.dialogueLines[0]?.line
        ? `${targetScene.dialogueLines[0].speaker}: "${targetScene.dialogueLines[0].line}"`
        : targetScene.narration || targetScene.actionDescription;

      if (caption) {
        const scrim = ctx.createLinearGradient(0, h * 0.68, 0, h);
        scrim.addColorStop(0, 'rgba(9,9,11,0)');
        scrim.addColorStop(0.5, 'rgba(9,9,11,0.78)');
        scrim.addColorStop(1, 'rgba(9,9,11,0.92)');
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
  };

  const drawFrameAt = useMemo(() => {
    return (ctx: CanvasRenderingContext2D, t: number, w: number, h: number) => {
      if (includeTitleSlate && t < titleSlateDuration) {
        drawTitleSlate(ctx, t, w, h);
        return;
      }

      let cursor = titleSlateDuration;
      let targetScene: Scene = activeProject.scenes[activeProject.scenes.length - 1];
      let sceneLocalTime = 0;

      for (const sc of activeProject.scenes) {
        if (t >= cursor && t < cursor + sc.durationSeconds) {
          targetScene = sc;
          sceneLocalTime = t - cursor;
          break;
        }
        cursor += sc.durationSeconds;
      }

      if (!targetScene) return;
      drawSceneFrame(ctx, targetScene, sceneLocalTime, t, w, h);
    };
  }, [activeProject, includeMotionOverlays, includeSubtitles, includeTitleSlate, titleSlateDuration]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawFrameAt(ctx, currentTime, canvas.width, canvas.height);
  }, [currentTime, drawFrameAt, exportRatio]);

  useEffect(() => {
    if (!isPlaying || isRendering) return;
    let rafId = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setCurrentTime((prev) => {
        const next = prev + dt;
        if (next >= totalDuration) {
          setIsPlaying(false);
          return 0;
        }
        return next;
      });
      rafId = window.requestAnimationFrame(tick);
    };
    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [isPlaying, isRendering, totalDuration]);

  const canvasToPngBytes = (canvas: HTMLCanvasElement): Promise<Uint8Array> =>
    new Promise((resolve, reject) => {
      canvas.toBlob(async (blob) => {
        if (!blob) {
          reject(new Error('Failed to snapshot frame.'));
          return;
        }
        resolve(new Uint8Array(await blob.arrayBuffer()));
      }, 'image/png');
    });

  const handleRenderMp4WithFfmpeg = async () => {
    setExportError(null);
    setIsPlaying(false);
    setIsRendering(true);
    setRenderProgress(2);
    setExportedMp4Url(null);

    try {
      setRenderPhase('Loading FFmpeg.wasm core...');
      if (!ffmpegRef.current) {
        ffmpegRef.current = new FFmpeg();
      }
      const ffmpeg = ffmpegRef.current;

      if (!ffmpeg.loaded) {
        await ffmpeg.load({
          coreURL: await toBlobURL('/ffmpeg-core/ffmpeg-core.js', 'text/javascript'),
          wasmURL: await toBlobURL('/ffmpeg-core/ffmpeg-core.wasm', 'application/wasm'),
        });
      }

      const offscreen = document.createElement('canvas');
      offscreen.width = resConfig.w;
      offscreen.height = resConfig.h;
      const ctx = offscreen.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context unavailable.');

      const segmentFiles: string[] = [];
      const captureFps = 12;
      const totalSteps =
        (includeTitleSlate ? 1 : 0) + activeProject.scenes.length + (includeAudioMix ? 2 : 1);
      let completedSteps = 0;

      if (includeTitleSlate) {
        setRenderPhase('Encoding opening title slate...');
        const slateFrames = Math.round(titleSlateDuration * captureFps);
        for (let f = 0; f < slateFrames; f++) {
          drawTitleSlate(ctx, f / captureFps, resConfig.w, resConfig.h);
          const png = await canvasToPngBytes(offscreen);
          await ffmpeg.writeFile(`slate_${String(f).padStart(4, '0')}.png`, png);
        }
        await ffmpeg.exec([
          '-framerate',
          String(captureFps),
          '-i',
          'slate_%04d.png',
          '-c:v',
          'libx264',
          '-r',
          String(fps),
          '-pix_fmt',
          'yuv420p',
          '-preset',
          'ultrafast',
          'seg_slate.mp4',
        ]);
        for (let f = 0; f < slateFrames; f++) {
          await ffmpeg.deleteFile(`slate_${String(f).padStart(4, '0')}.png`);
        }
        segmentFiles.push('seg_slate.mp4');
        completedSteps += 1;
        setRenderProgress(Math.round((completedSteps / totalSteps) * 85));
      }

      let timeCursor = titleSlateDuration;
      for (let i = 0; i < activeProject.scenes.length; i++) {
        const sc = activeProject.scenes[i];
        const segName = `seg_${i}.mp4`;
        setRenderPhase(`Encoding Scene ${sc.sceneNumber} of ${activeProject.scenes.length}...`);

        let usedGeneratedClip = false;
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
              `scale=${resConfig.w}:${resConfig.h}:force_original_aspect_ratio=increase,crop=${resConfig.w}:${resConfig.h},setsar=1`,
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
            if (code === 0) usedGeneratedClip = true;
          } catch {
            usedGeneratedClip = false;
          }
        }

        if (!usedGeneratedClip) {
          const frameCount = Math.max(12, Math.round(sc.durationSeconds * captureFps));
          for (let f = 0; f < frameCount; f++) {
            const localT = f / captureFps;
            drawSceneFrame(ctx, sc, localT, timeCursor + localT, resConfig.w, resConfig.h);
            const png = await canvasToPngBytes(offscreen);
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
        timeCursor += sc.durationSeconds;
        completedSteps += 1;
        setRenderProgress(Math.round((completedSteps / totalSteps) * 85));
      }

      const concatManifest = segmentFiles.map((s) => `file '${s}'`).join('\n');
      await ffmpeg.writeFile('concat.txt', concatManifest);

      if (includeAudioMix) {
        setRenderPhase('Mixing free background score & scene voiceovers...');
        const wavBytes = await renderProjectAudioMixWav({
          totalDurationSec: totalDuration,
          titleSlateDurationSec: titleSlateDuration,
          musicPreset: selectedMusicPreset,
          musicGain: 0.28,
          scenes: activeProject.scenes,
        });
        await ffmpeg.writeFile('mix.wav', wavBytes);

        setRenderPhase('Muxing final watermark-free MP4...');
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
        setRenderPhase('Packaging watermark-free MP4...');
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
      setExportedMp4Url(mp4Url);

      await ffmpeg.deleteFile('concat.txt');
      await ffmpeg.deleteFile('output.mp4');
      for (const seg of segmentFiles) {
        await ffmpeg.deleteFile(seg);
      }

      setRenderProgress(100);
      setRenderPhase('Clean MP4 ready for download');
    } catch (err) {
      setExportError(
        err instanceof Error
          ? `FFmpeg.wasm export error: ${err.message}`
          : 'Failed to assemble MP4 with FFmpeg.wasm.'
      );
    } finally {
      setIsRendering(false);
    }
  };

  const downloadTextFile = (filename: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportMarkdown = () => {
    const md = [
      `# ${activeProject.title}`,
      `Style: ${activeProject.style} | Aspect Ratio: ${exportRatio}`,
      `\n> ${activeProject.logline}\n`,
      `## Visual Direction\n${activeProject.styleNotes}\n`,
      ...activeProject.scenes.map(
        (sc) =>
          `### Scene ${sc.sceneNumber}: ${sc.title} (${sc.durationSeconds}s)\n- **Camera:** ${sc.cameraAngle}\n- **Lighting:** ${sc.lightingMood}\n- **Action:** ${sc.actionDescription}\n- **Narration:** ${sc.narration}\n${
            sc.dialogueLines.length > 0
              ? `- **Dialogue:**\n${sc.dialogueLines.map((d) => `  - **${d.speaker}** (${d.emotion}): "${d.line}"`).join('\n')}\n`
              : ''
          }- **SFX / Transition:** ${sc.sfxCue} · ${sc.transition}\n`
      ),
    ].join('\n');
    downloadTextFile(
      `${activeProject.title.toLowerCase().replace(/\s+/g, '-')}-script.md`,
      md,
      'text/markdown'
    );
  };

  const handleExportSrt = () => {
    let cursor = 0;
    const toSrtTime = (sec: number) => {
      const hrs = Math.floor(sec / 3600);
      const mins = Math.floor((sec % 3600) / 60);
      const secs = Math.floor(sec % 60);
      return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')},000`;
    };
    const srt = activeProject.scenes
      .map((sc, idx) => {
        const start = cursor;
        const end = cursor + sc.durationSeconds;
        cursor = end;
        const text = sc.narration || sc.dialogueLines[0]?.line || sc.actionDescription;
        return `${idx + 1}\n${toSrtTime(start)} --> ${toSrtTime(end)}\n${text}\n`;
      })
      .join('\n');
    downloadTextFile(
      `${activeProject.title.toLowerCase().replace(/\s+/g, '-')}.srt`,
      srt,
      'text/plain'
    );
  };

  const handleExportJson = () => {
    downloadTextFile(
      `${activeProject.title.toLowerCase().replace(/\s+/g, '-')}-bundle.json`,
      JSON.stringify(activeProject, null, 2),
      'application/json'
    );
  };

  const generatedClipCount = activeProject.scenes.filter((s) => Boolean(s.generatedVideoUrl)).length;

  return (
    <div className="space-y-6 pb-4">
      {exportError && (
        <div className="bg-red-950/50 border border-red-500/40 text-red-200 rounded-xl px-4 py-3 text-sm">
          {exportError}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Preview & Rendered MP4 Stage */}
        <section className="lg:col-span-8 bg-[#111116]/85 backdrop-blur-xl border border-white/10 rounded-2xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-display font-semibold text-zinc-100">
                FFmpeg.wasm Clean MP4 Export Stage
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5 tabular-nums">
                {activeProject.scenes.length} scenes · {generatedClipCount} AI video clip
                {generatedClipCount === 1 ? '' : 's'} · Watermark-free browser assembly
              </p>
            </div>
            <div className="font-mono text-xs tabular-nums text-cyan-300">
              {formatTimecode(currentTime)} / {formatTimecode(totalDuration)}
            </div>
          </div>

          {exportedMp4Url ? (
            <div className="bg-zinc-950 border border-emerald-500/40 rounded-xl overflow-hidden">
              <video
                src={exportedMp4Url}
                controls
                className="w-full max-h-[440px] bg-black"
              />
              <div className="px-4 py-3 border-t border-white/10 flex items-center justify-between text-xs">
                <span className="text-emerald-300 font-medium">
                  MP4 compiled cleanly in browser ({exportRatio} · {fps} fps · no watermark)
                </span>
                <button
                  type="button"
                  onClick={() => setExportedMp4Url(null)}
                  className="text-zinc-400 hover:text-white cursor-pointer"
                >
                  Back to Canvas Preview
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-[#09090B] border border-white/10 rounded-xl overflow-hidden flex items-center justify-center max-h-[460px]">
              <canvas
                ref={canvasRef}
                width={resConfig.w}
                height={resConfig.h}
                className="max-w-full max-h-[440px] w-auto h-auto block"
              />
            </div>
          )}

          {/* Scrub & Playback Controls */}
          <div className="space-y-3">
            <input
              type="range"
              min={0}
              max={Math.max(1, totalDuration)}
              step={0.1}
              value={currentTime}
              disabled={isRendering}
              onChange={(e) => {
                setIsPlaying(false);
                setCurrentTime(Number(e.target.value));
              }}
              className="w-full accent-cyan-400"
            />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isRendering || Boolean(exportedMp4Url)}
                  onClick={() => setIsPlaying((p) => !p)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-zinc-100 border border-white/10 text-xs font-medium rounded-xl transition-colors cursor-pointer disabled:opacity-45"
                >
                  {isPlaying ? (
                    <>
                      <Pause className="w-3.5 h-3.5 text-cyan-400" />
                      Pause
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 text-cyan-400" />
                      Play Preview
                    </>
                  )}
                </button>
                <button
                  type="button"
                  disabled={isRendering}
                  onClick={() => {
                    setIsPlaying(false);
                    setCurrentTime(0);
                    setExportedMp4Url(null);
                  }}
                  className="p-2 bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-zinc-100 border border-white/10 rounded-xl cursor-pointer disabled:opacity-45"
                  title="Reset preview"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>

              {exportedMp4Url && (
                <a
                  href={exportedMp4Url}
                  download={`${activeProject.title.toLowerCase().replace(/\s+/g, '-')}-${exportRatio.replace(':', 'x')}.mp4`}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/50 text-emerald-200 text-xs font-semibold rounded-xl transition-colors whitespace-nowrap shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download Clean MP4
                </a>
              )}
            </div>
          </div>
        </section>

        {/* Export Configuration & Formats */}
        <section className="lg:col-span-4 bg-[#111116]/85 backdrop-blur-xl border border-white/10 rounded-2xl p-6 space-y-5 flex flex-col justify-between">
          <div className="space-y-4">
            <h3 className="text-base font-display font-semibold text-zinc-100">
              MP4 Export Settings
            </h3>

            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Target Project</label>
              <select
                value={activeProject.id}
                onChange={(e) => {
                  setIsPlaying(false);
                  setCurrentTime(0);
                  setExportedMp4Url(null);
                  onSelectProject(e.target.value);
                }}
                className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-cyan-400/60"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} ({p.style})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Aspect Ratio</label>
              <div className="space-y-1.5">
                {ASPECT_PRESETS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={isRendering}
                    onClick={() => setExportRatio(opt.id)}
                    className={`w-full px-3 py-2 text-xs rounded-xl border text-left transition-all cursor-pointer ${
                      exportRatio === opt.id
                        ? 'bg-indigo-500/20 border-cyan-400/50 text-zinc-50'
                        : 'bg-zinc-950 border-white/10 text-zinc-400 hover:text-zinc-100'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Frame Rate</label>
              <div className="grid grid-cols-2 gap-2">
                {([24, 30] as const).map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    disabled={isRendering}
                    onClick={() => setFps(rate)}
                    className={`py-2 text-xs font-mono tabular-nums rounded-xl border transition-all cursor-pointer ${
                      fps === rate
                        ? 'bg-indigo-500/20 border-cyan-400/50 text-cyan-200'
                        : 'bg-zinc-950 border-white/10 text-zinc-400'
                    }`}
                  >
                    {rate} fps
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2.5 pt-2">
              <label className="flex items-center gap-2.5 text-xs text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeTitleSlate}
                  onChange={(e) => setIncludeTitleSlate(e.target.checked)}
                  className="rounded border-white/20 bg-zinc-950 text-indigo-500"
                />
                Include opening title slate (3s)
              </label>
              <label className="flex items-center gap-2.5 text-xs text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeSubtitles}
                  onChange={(e) => setIncludeSubtitles(e.target.checked)}
                  className="rounded border-white/20 bg-zinc-950 text-indigo-500"
                />
                Burn-in narration &amp; dialogue subtitles
              </label>
              <label className="flex items-center gap-2.5 text-xs text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeMotionOverlays}
                  onChange={(e) => setIncludeMotionOverlays(e.target.checked)}
                  className="rounded border-white/20 bg-zinc-950 text-indigo-500"
                />
                Composite stock motion overlays
              </label>
              <label className="flex items-center gap-2.5 text-xs text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeAudioMix}
                  onChange={(e) => setIncludeAudioMix(e.target.checked)}
                  className="rounded border-white/20 bg-zinc-950 text-indigo-500"
                />
                Include free score &amp; attached scene voices
              </label>
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t border-white/10">
            {isRendering && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-cyan-300 font-mono tabular-nums">
                  <span className="truncate">{renderPhase}</span>
                  <span>{renderProgress}%</span>
                </div>
                <div className="h-1.5 bg-zinc-950 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400 transition-all duration-150"
                    style={{ width: `${renderProgress}%` }}
                  />
                </div>
              </div>
            )}

            <button
              type="button"
              disabled={isRendering}
              onClick={() => void handleRenderMp4WithFfmpeg()}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-500 to-cyan-500 hover:from-indigo-400 hover:to-cyan-400 disabled:opacity-50 text-zinc-950 text-xs font-semibold rounded-xl transition-all cursor-pointer"
            >
              {isRendering ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Building MP4 in Browser...
                </>
              ) : (
                <>
                  <Video className="w-4 h-4" />
                  Compile Clean MP4 (FFmpeg.wasm)
                </>
              )}
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onExportAhiProject(activeProject.id)}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-400/40 text-xs font-medium text-cyan-200 rounded-xl cursor-pointer whitespace-nowrap"
              >
                <FileCode2 className="w-3.5 h-3.5" />
                Save .AHI Backup
              </button>
              <label className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-zinc-200 rounded-xl cursor-pointer whitespace-nowrap">
                <Upload className="w-3.5 h-3.5 text-cyan-400" />
                Load .AHI
                <input
                  type="file"
                  accept=".ahi,.json"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) onImportAhiFile(f);
                  }}
                  className="hidden"
                />
              </label>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={handleExportMarkdown}
                className="inline-flex items-center justify-center gap-1 px-2.5 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-zinc-300 rounded-xl cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" />
                .MD
              </button>
              <button
                type="button"
                onClick={handleExportSrt}
                className="inline-flex items-center justify-center gap-1 px-2.5 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-zinc-300 rounded-xl cursor-pointer"
              >
                <Film className="w-3.5 h-3.5" />
                .SRT
              </button>
              <button
                type="button"
                onClick={handleExportJson}
                className="inline-flex items-center justify-center gap-1 px-2.5 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-zinc-300 rounded-xl cursor-pointer"
              >
                <FileCode2 className="w-3.5 h-3.5" />
                .JSON
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
