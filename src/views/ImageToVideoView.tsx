import { useEffect, useState } from 'react';
import {
  Camera,
  Check,
  Cpu,
  Download,
  Film,
  Loader2,
  Sparkles,
  Upload,
  Video,
} from 'lucide-react';
import { FreeGpuStatusCard } from '../components/FreeGpuStatusCard';
import { CAMERA_MOTIONS, STYLE_PRESETS } from '../data/seedData';
import { generateHfVideoClip } from '../services/studioApi';
import type {
  AnimationStyle,
  AspectRatio,
  CameraMotion,
  CharacterProfile,
  GeneratedImageItem,
  VideoProject,
} from '../types/studio';

interface ImageToVideoViewProps {
  activeProject: VideoProject;
  characters: CharacterProfile[];
  gallery: GeneratedImageItem[];
  pendingImage: { imageUrl: string; prompt: string; style: AnimationStyle } | null;
  onClearPendingImage: () => void;
  onAttachClipToScene: (
    sceneId: string,
    videoUrl: string,
    spaceUsed: string,
    cameraMotion: CameraMotion
  ) => void;
}

const VIDEO_SPACES = [
  'multimodalart/wan2-1-fast',
  'ysharma/wan2-1-fast',
  'Lightricks/ltx-video-distilled',
  'zerogpu-aoti/wan2-2-fp8da-aoti-faster',
  'zai-org/CogVideoX-5B-Space',
];

export function ImageToVideoView({
  activeProject,
  characters,
  gallery,
  pendingImage,
  onClearPendingImage,
  onAttachClipToScene,
}: ImageToVideoViewProps) {
  const [sourceImage, setSourceImage] = useState<string>(
    pendingImage?.imageUrl ||
      gallery[0]?.imageDataUrl ||
      '/src/assets/images/char_luna_pilot_1795461026794.jpg'
  );
  const [prompt, setPrompt] = useState(
    pendingImage?.prompt ||
      'Gentle wind lifts her hair and coat collar as warm twilight lantern light flickers softly across the frame'
  );
  const [style, setStyle] = useState<AnimationStyle>(pendingImage?.style || activeProject.style);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(activeProject.aspectRatio);
  const [cameraMotion, setCameraMotion] = useState<CameraMotion>('Zoom In');
  const [spaceId, setSpaceId] = useState(VIDEO_SPACES[0]);

  const [targetSceneId, setTargetSceneId] = useState(activeProject.scenes[0]?.id ?? '');
  const [isGenerating, setIsGenerating] = useState(false);
  const [queueStatus, setQueueStatus] = useState<string | null>(null);
  const [queueProgress, setQueueProgress] = useState(0);
  const [activeSpace, setActiveSpace] = useState<string | undefined>(undefined);
  const [attemptInfo, setAttemptInfo] = useState<{ attempt?: number; total?: number }>({});
  const [translatedPrompt, setTranslatedPrompt] = useState<string | null>(null);
  const [generatedClipUrl, setGeneratedClipUrl] = useState<string | null>(null);
  const [spaceUsed, setSpaceUsed] = useState<string>('');
  const [attachedOk, setAttachedOk] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (pendingImage) {
      setSourceImage(pendingImage.imageUrl);
      if (pendingImage.prompt) setPrompt(pendingImage.prompt);
      setStyle(pendingImage.style);
      onClearPendingImage();
    }
  }, [pendingImage, onClearPendingImage]);

  const handleUploadImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setSourceImage(reader.result);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceImage || !prompt.trim()) return;
    setErrorMsg(null);
    setAttachedOk(false);
    setIsGenerating(true);
    setQueueProgress(10);
    setActiveSpace(spaceId);
    setAttemptInfo({ attempt: 1, total: 3 });
    setTranslatedPrompt(null);
    setQueueStatus(`Connecting to free community GPU (${spaceId})...`);

    try {
      const result = await generateHfVideoClip(
        {
          prompt: prompt.trim(),
          mode: 'image-to-video',
          imageDataUrl: sourceImage,
          style,
          aspectRatio,
          cameraMotion,
          spaceId,
        },
        (evt) => {
          if (evt.message) setQueueStatus(evt.message);
          if (typeof evt.progress === 'number') setQueueProgress(evt.progress);
          if (evt.space) setActiveSpace(evt.space);
          if (evt.attempt && evt.totalAttempts) {
            setAttemptInfo({ attempt: evt.attempt, total: evt.totalAttempts });
          }
          if (evt.translatedPrompt) setTranslatedPrompt(evt.translatedPrompt);
        }
      );

      setGeneratedClipUrl(result.videoUrl);
      setSpaceUsed(result.spaceUsed);
      setQueueProgress(100);
      setActiveSpace(result.spaceUsed);
      if (result.translatedPrompt) setTranslatedPrompt(result.translatedPrompt);
      const secs = result.elapsedMs ? ` in ${(result.elapsedMs / 1000).toFixed(1)}s` : '';
      setQueueStatus(`Rendered clean watermark-free MP4${secs} via ${result.nodeLabel}`);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Hugging Face Image-to-Video Space is busy.'
      );
      setQueueStatus(null);
      setQueueProgress(0);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6 pb-4">
      {/* Honest Free GPU Banner */}
      <div className="bg-[#111116]/90 backdrop-blur-xl border border-white/10 rounded-2xl px-5 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5 text-zinc-200">
          <Cpu className="w-4 h-4 text-cyan-400 shrink-0" />
          <div>
            <span className="font-semibold text-zinc-100">
              A.H.I Fast Distilled I2V (Wan 2.1 Fast · LTX-Video Distilled)
            </span>
            <span className="text-zinc-500 mx-2" aria-hidden="true">
              ·
            </span>
            <span className="text-zinc-400">
              10–25s distilled video routing with automatic camera/style translation &amp; Colab Turbo support.
            </span>
          </div>
        </div>
        <select
          value={spaceId}
          onChange={(e) => setSpaceId(e.target.value)}
          className="bg-zinc-950 border border-white/10 rounded-lg px-3 py-1.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-cyan-400/60"
        >
          {VIDEO_SPACES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {errorMsg && (
        <div className="bg-red-950/50 border border-red-500/40 text-red-200 rounded-xl px-4 py-3 text-xs flex items-center justify-between gap-3">
          <span>{errorMsg}</span>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-red-300 hover:text-white cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Source Image Picker & Motion Controls */}
        <form
          onSubmit={(e) => void handleGenerate(e)}
          className="lg:col-span-6 bg-[#111116]/85 backdrop-blur-xl border border-white/10 rounded-2xl p-6 space-y-5"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-display font-semibold text-zinc-100">
                1. Starting Reference Frame
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Pick from Text-to-Image, Character Library, or upload your own still
              </p>
            </div>
            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-cyan-300 cursor-pointer shrink-0">
              <Upload className="w-3.5 h-3.5" />
              Upload Still
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleUploadImage}
                className="hidden"
              />
            </label>
          </div>

          <div className="aspect-video bg-zinc-950 border border-white/10 rounded-xl overflow-hidden flex items-center justify-center">
            <img
              src={sourceImage}
              alt="Selected Image-to-Video reference"
              referrerPolicy="no-referrer"
              className="w-full h-full object-contain"
            />
          </div>

          {/* Quick Source Tray */}
          <div className="grid grid-cols-5 gap-2">
            {[
              ...gallery.slice(0, 3).map((g) => ({ id: g.id, url: g.imageDataUrl, label: g.style })),
              ...characters
                .filter((c) => Boolean(c.avatarUrl))
                .slice(0, 2)
                .map((c) => ({ id: c.id, url: c.avatarUrl || '', label: c.name })),
            ].map((thumb) => (
              <button
                key={thumb.id}
                type="button"
                onClick={() => setSourceImage(thumb.url)}
                title={thumb.label}
                className={`rounded-lg overflow-hidden border transition-all cursor-pointer aspect-square ${
                  sourceImage === thumb.url
                    ? 'border-cyan-400 ring-2 ring-cyan-400/25'
                    : 'border-white/10 opacity-75 hover:opacity-100'
                }`}
              >
                <img
                  src={thumb.url}
                  alt={thumb.label}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>

          <div>
            <label className="block text-xs text-zinc-400 mb-1.5">
              2. Motion &amp; Action Direction
            </label>
            <textarea
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe how the subject and environment should move..."
              className="w-full bg-zinc-950/90 border border-white/10 rounded-xl p-3 text-sm text-zinc-100 focus:outline-none focus:border-cyan-400/60"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Visual Style</label>
              <select
                value={style}
                onChange={(e) => setStyle(e.target.value as AnimationStyle)}
                className="w-full bg-zinc-950 border border-white/10 rounded-xl px-2.5 py-2 text-xs text-zinc-100 focus:outline-none focus:border-cyan-400/60"
              >
                {STYLE_PRESETS.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Aspect Ratio</label>
              <select
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
                className="w-full bg-zinc-950 border border-white/10 rounded-xl px-2.5 py-2 text-xs font-mono text-zinc-100 focus:outline-none focus:border-cyan-400/60"
              >
                <option value="16:9">16:9</option>
                <option value="9:16">9:16</option>
                <option value="1:1">1:1</option>
                <option value="21:9">21:9</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5 flex items-center gap-1">
                <Camera className="w-3 h-3 text-cyan-400" />
                Camera Motion
              </label>
              <select
                value={cameraMotion}
                onChange={(e) => setCameraMotion(e.target.value as CameraMotion)}
                className="w-full bg-zinc-950 border border-white/10 rounded-xl px-2.5 py-2 text-xs text-zinc-100 focus:outline-none focus:border-cyan-400/60"
              >
                {CAMERA_MOTIONS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <FreeGpuStatusCard
            isRunning={isGenerating}
            message={queueStatus}
            progress={queueProgress}
            activeSpace={activeSpace}
            attempt={attemptInfo.attempt}
            totalAttempts={attemptInfo.total}
            translatedPrompt={translatedPrompt}
          />

          <button
            type="submit"
            disabled={isGenerating || !prompt.trim()}
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 hover:from-indigo-400 hover:to-cyan-400 disabled:opacity-45 text-zinc-950 text-xs font-semibold shadow-lg shadow-indigo-500/20 transition-all cursor-pointer"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Animating on Shared GPU...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Animate Still Image (Free MP4)
              </>
            )}
          </button>
        </form>

        {/* Output Video Player & Project Attachment */}
        <section className="lg:col-span-6 bg-[#111116]/85 backdrop-blur-xl border border-white/10 rounded-2xl p-6 flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-display font-semibold text-zinc-100">
                  3. Rendered Motion Output
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Clean, watermark-free clip ready for download or timeline assembly
                </p>
              </div>
              {spaceUsed && (
                <span className="font-mono text-[11px] text-cyan-300">{spaceUsed}</span>
              )}
            </div>

            {generatedClipUrl ? (
              <div className="bg-zinc-950 border border-indigo-400/35 rounded-xl overflow-hidden">
                <video
                  key={generatedClipUrl}
                  src={generatedClipUrl}
                  controls
                  loop
                  className="w-full aspect-video bg-black"
                />
              </div>
            ) : (
              <div className="aspect-video bg-zinc-950/80 border border-dashed border-white/15 rounded-xl p-8 flex flex-col items-center justify-center text-center space-y-2.5">
                <Video className="w-8 h-8 text-zinc-600" />
                <div className="text-sm font-medium text-zinc-200">
                  Ready to animate your still frame
                </div>
                <p className="text-xs text-zinc-500 max-w-sm">
                  Select a portrait or Text-to-Image frame on the left, choose a camera motion preset,
                  and launch free Image-to-Video rendering on Hugging Face Spaces.
                </p>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-white/10 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
              <select
                value={targetSceneId}
                onChange={(e) => setTargetSceneId(e.target.value)}
                className="flex-1 bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-cyan-400/60"
              >
                {activeProject.scenes.map((sc) => (
                  <option key={sc.id} value={sc.id}>
                    {activeProject.title} · S{sc.sceneNumber}: {sc.title}
                  </option>
                ))}
              </select>

              <button
                type="button"
                disabled={!generatedClipUrl || !targetSceneId}
                onClick={() => {
                  if (!generatedClipUrl) return;
                  onAttachClipToScene(
                    targetSceneId,
                    generatedClipUrl,
                    spaceUsed || spaceId,
                    cameraMotion
                  );
                  setAttachedOk(true);
                }}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 disabled:opacity-40 border border-indigo-400/40 text-xs font-medium text-indigo-200 cursor-pointer whitespace-nowrap"
              >
                {attachedOk ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    Attached to Scene
                  </>
                ) : (
                  <>
                    <Film className="w-3.5 h-3.5 text-cyan-400" />
                    Attach to Project Scene
                  </>
                )}
              </button>
            </div>

            {generatedClipUrl && (
              <a
                href={generatedClipUrl}
                download={`ahi-i2v-${Date.now()}.mp4`}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-zinc-100 transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-cyan-400" />
                Download Watermark-Free MP4 Clip
              </a>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
