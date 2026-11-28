import { useEffect, useState } from 'react';
import {
  Check,
  Cpu,
  Download,
  Film,
  Image as ImageIcon,
  Loader2,
  Sparkles,
  UserPlus,
} from 'lucide-react';
import { FreeGpuStatusCard } from '../components/FreeGpuStatusCard';
import { STYLE_PRESETS } from '../data/seedData';
import { generateHfImage } from '../services/studioApi';
import type {
  AnimationStyle,
  AspectRatio,
  CharacterProfile,
  GeneratedImageItem,
  ImageEngine,
} from '../types/studio';

interface TextToImageViewProps {
  gallery: GeneratedImageItem[];
  initialPrompt: string;
  initialStyle: AnimationStyle;
  initialAspectRatio: AspectRatio;
  autoTriggerKey?: number;
  onAddToGallery: (item: GeneratedImageItem) => void;
  onSendToImageToVideo: (imageUrl: string, prompt: string, style: AnimationStyle) => void;
  onSaveToCharacterLibrary: (character: CharacterProfile) => void;
}

const RATIOS: AspectRatio[] = ['16:9', '9:16', '1:1', '21:9'];

function downloadCleanPng(sourceUrl: string, filename: string) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || 1024;
    canvas.height = img.naturalHeight || 1024;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  };
  img.src = sourceUrl;
}

export function TextToImageView({
  gallery,
  initialPrompt,
  initialStyle,
  initialAspectRatio,
  autoTriggerKey = 0,
  onAddToGallery,
  onSendToImageToVideo,
  onSaveToCharacterLibrary,
}: TextToImageViewProps) {
  const [prompt, setPrompt] = useState(
    initialPrompt ||
      'A sleek cybernetic navigator standing beside a glowing glass astrolabe on a rain-slicked rooftop, volumetric indigo & cyan cinema lighting'
  );
  const [style, setStyle] = useState<AnimationStyle>(initialStyle);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(initialAspectRatio);
  const [engine, setEngine] = useState<ImageEngine>('flux-schnell');
  const [customSpaceId, setCustomSpaceId] = useState('black-forest-labs/FLUX.1-schnell');

  const [isGenerating, setIsGenerating] = useState(false);
  const [queueMessage, setQueueMessage] = useState<string | null>(null);
  const [queueProgress, setQueueProgress] = useState(0);
  const [activeSpace, setActiveSpace] = useState<string | undefined>(undefined);
  const [attemptInfo, setAttemptInfo] = useState<{ attempt?: number; total?: number }>({});
  const [translatedPrompt, setTranslatedPrompt] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedCharId, setSavedCharId] = useState<string | null>(null);

  const handleEngineSwitch = (nextEngine: ImageEngine) => {
    setEngine(nextEngine);
    setCustomSpaceId(
      nextEngine === 'flux-schnell'
        ? 'black-forest-labs/FLUX.1-schnell'
        : 'stabilityai/stable-diffusion-3.5-large-turbo'
    );
  };

  const runGeneration = async (
    targetPrompt: string,
    targetStyle: AnimationStyle,
    targetRatio: AspectRatio
  ) => {
    const cleaned = targetPrompt.trim();
    if (!cleaned || isGenerating) return;
    setErrorMsg(null);
    setIsGenerating(true);
    setQueueProgress(10);
    setActiveSpace(customSpaceId);
    setAttemptInfo({ attempt: 1, total: 3 });
    setTranslatedPrompt(null);
    setQueueMessage('Creating your image...');

    try {
      const res = await generateHfImage(
        {
          prompt: cleaned,
          style: targetStyle,
          aspectRatio: targetRatio,
          engine,
          spaceId: customSpaceId,
        },
        (evt) => {
          if (evt.message) setQueueMessage(evt.message);
          if (typeof evt.progress === 'number') setQueueProgress(evt.progress);
          if (evt.space) setActiveSpace(evt.space);
          if (evt.attempt && evt.totalAttempts) {
            setAttemptInfo({ attempt: evt.attempt, total: evt.totalAttempts });
          }
          if (evt.translatedPrompt) setTranslatedPrompt(evt.translatedPrompt);
        }
      );

      const created: GeneratedImageItem = {
        id: `img-${Date.now()}`,
        prompt: cleaned,
        style: targetStyle,
        aspectRatio: targetRatio,
        engine,
        spaceUsed: res.spaceUsed,
        imageDataUrl: res.imageDataUrl,
        createdAt: new Date().toISOString(),
      };
      onAddToGallery(created);
      setQueueProgress(100);
      setActiveSpace(res.spaceUsed);
      setTranslatedPrompt(res.translatedPrompt);
      const secs = res.elapsedMs ? ` in ${(res.elapsedMs / 1000).toFixed(1)}s` : '';
      setQueueMessage(
        `Rendered ${res.width}×${res.height} watermark-free PNG${secs} via ${res.nodeLabel}`
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Image creation is temporarily busy. Please try again.'
      );
      setQueueMessage(null);
      setQueueProgress(0);
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    if (initialPrompt) {
      setPrompt(initialPrompt);
    }
    setStyle(initialStyle);
    setAspectRatio(initialAspectRatio);
  }, [initialPrompt, initialStyle, initialAspectRatio]);

  useEffect(() => {
    if (autoTriggerKey > 0 && initialPrompt.trim()) {
      void runGeneration(initialPrompt, initialStyle, initialAspectRatio);
    }
  }, [autoTriggerKey]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    await runGeneration(prompt, style, aspectRatio);
  };

  const handleSaveAsCharacter = (item: GeneratedImageItem) => {
    const newChar: CharacterProfile = {
      id: `char-${Date.now()}`,
      name: `Hero Frame ${gallery.length + 1}`,
      role: 'Lead Visual Subject',
      styleAffinity: item.style,
      appearancePrompt: item.prompt,
      personalityTraits: ['Distinctive', 'Expressive', 'Consistent'],
      voiceName: 'Kore',
      voiceStyle: `${item.style} lead delivery`,
      signatureProps: 'Generated from Text-to-Image studio',
      colorPalette: ['#09090B', '#6366F1', '#06B6D4', '#E4E4E7'],
      avatarUrl: item.imageDataUrl,
      avatarSource: 'flux',
    };
    onSaveToCharacterLibrary(newChar);
    setSavedCharId(item.id);
    window.setTimeout(() => setSavedCharId(null), 2200);
  };

  return (
    <div className="space-y-6 pb-4">
      {/* Honest Open-Source Engine Header */}
      <div className="bg-[#111116]/90 backdrop-blur-xl border border-white/10 rounded-2xl px-5 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5 text-zinc-200">
          <Cpu className="w-4 h-4 text-cyan-400 shrink-0" />
          <div>
            <span className="font-semibold text-zinc-100">
              A.H.I Instant Cloudflare Flux.1 &amp; HF Fallback Image Studio
            </span>
            <span className="text-zinc-500 mx-2" aria-hidden="true">
              ·
            </span>
            <span className="text-zinc-400">
              Primary <span className="font-mono text-cyan-300">@cf/black-forest-labs/flux-1-schnell</span>{' '}
              (1–3s zero-queue) with automatic failover to HF Spaces or Colab Turbo GPU.
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-zinc-500">Speed Engine:</span>
          <span className="font-mono text-emerald-400">
            {isGenerating ? 'Rendering Now...' : '1–3s Instant Ready'}
          </span>
        </div>
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

      {queueMessage && (
        <FreeGpuStatusCard
          isRunning={isGenerating}
          message={queueMessage}
          progress={queueProgress}
          activeSpace={activeSpace}
          attempt={attemptInfo.attempt}
          totalAttempts={attemptInfo.total}
          translatedPrompt={translatedPrompt}
        />
      )}

      {/* Generator Workbench */}
      <form
        onSubmit={(e) => void handleGenerate(e)}
        className="bg-[#111116]/85 backdrop-blur-xl border border-white/10 rounded-2xl p-6 space-y-5"
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-7 space-y-4">
            <div>
              <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                Scene or Concept Prompt
              </label>
              <textarea
                rows={4}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe lighting, subject, lens, environment, and atmosphere..."
                className="w-full bg-zinc-950/90 border border-white/10 rounded-xl p-3.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-cyan-400/60"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">
                  Open-Source Model Engine
                </label>
                <div className="grid grid-cols-2 gap-2 p-1 bg-zinc-950/90 border border-white/10 rounded-xl">
                  {(
                    [
                      { id: 'flux-schnell', label: 'Flux.1 Schnell' },
                      { id: 'sdxl', label: 'SD 3.5 Turbo / SDXL' },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleEngineSwitch(item.id)}
                      className={`py-2 text-xs font-medium rounded-lg transition-all cursor-pointer ${
                        engine === item.id
                          ? 'bg-indigo-500/25 text-cyan-300 border border-indigo-400/40'
                          : 'text-zinc-400 hover:text-zinc-100 border border-transparent'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs text-zinc-400 mb-1.5">
                  Hugging Face Space ID
                </label>
                <input
                  type="text"
                  value={customSpaceId}
                  onChange={(e) => setCustomSpaceId(e.target.value)}
                  className="w-full bg-zinc-950/90 border border-white/10 rounded-xl px-3 py-2.5 text-xs font-mono text-zinc-100 focus:outline-none focus:border-cyan-400/60"
                />
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 space-y-4">
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Visual Style Preset</label>
              <div className="grid grid-cols-2 gap-2">
                {STYLE_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setStyle(preset.id)}
                    className={`px-3 py-2 rounded-xl border text-left text-xs transition-all cursor-pointer flex items-center justify-between gap-2 ${
                      style === preset.id
                        ? 'bg-indigo-500/15 border-cyan-400/50 text-zinc-50 shadow-[0_0_15px_rgba(6,182,212,0.12)]'
                        : 'bg-zinc-950/80 border-white/10 text-zinc-400 hover:text-zinc-100'
                    }`}
                  >
                    <span className="truncate">{preset.title}</span>
                    {style === preset.id && <Check className="w-3.5 h-3.5 text-cyan-400 shrink-0" />}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Frame Aspect Ratio</label>
              <div className="grid grid-cols-4 gap-2">
                {RATIOS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setAspectRatio(r)}
                    className={`py-2 rounded-xl border font-mono text-xs tabular-nums transition-all cursor-pointer ${
                      aspectRatio === r
                        ? 'bg-indigo-500/20 border-cyan-400/50 text-cyan-300'
                        : 'bg-zinc-950/80 border-white/10 text-zinc-400 hover:text-zinc-100'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={isGenerating || !prompt.trim()}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 hover:from-indigo-400 hover:to-cyan-400 disabled:opacity-45 text-zinc-950 text-xs font-semibold shadow-lg shadow-indigo-500/20 transition-all cursor-pointer"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Rendering on Shared GPU...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Generate High-Res Image (Free PNG)
                </>
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Live Generation Gallery */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-display font-semibold text-zinc-100 flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-cyan-400" />
              Live Generation Gallery ({gallery.length})
            </h3>
            <p className="text-xs text-zinc-400">
              Download watermark-free PNGs, send any frame straight to Image-to-Video, or save as a
              reusable Character
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {gallery.map((item) => (
            <div
              key={item.id}
              className="bg-[#111116] border border-white/10 hover:border-indigo-400/40 rounded-2xl overflow-hidden flex flex-col justify-between transition-all"
            >
              <div>
                <div className="aspect-video bg-zinc-950 relative overflow-hidden border-b border-white/10">
                  <img
                    src={item.imageDataUrl}
                    alt={item.prompt}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between text-[11px] font-mono text-zinc-100 bg-zinc-950/75 backdrop-blur-md border border-white/10 rounded-lg px-2.5 py-1">
                    <span className="text-cyan-300 truncate">{item.spaceUsed}</span>
                    <span className="shrink-0 ml-2">{item.aspectRatio}</span>
                  </div>
                </div>

                <div className="p-4 space-y-1.5">
                  <div className="text-[11px] font-mono text-indigo-300">
                    {item.style} · {item.engine === 'flux-schnell' ? 'Flux.1 Schnell' : 'SDXL'}
                  </div>
                  <p className="text-xs text-zinc-300 leading-relaxed line-clamp-2">{item.prompt}</p>
                </div>
              </div>

              <div className="px-4 pb-4 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      onSendToImageToVideo(item.imageDataUrl, item.prompt, item.style)
                    }
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-gradient-to-r from-indigo-500/20 to-cyan-500/20 hover:from-indigo-500/30 hover:to-cyan-500/30 border border-cyan-400/40 text-xs font-medium text-cyan-200 transition-all cursor-pointer whitespace-nowrap"
                  >
                    <Film className="w-3.5 h-3.5" />
                    Animate Image
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      downloadCleanPng(item.imageDataUrl, `ahi-${item.id}.png`)
                    }
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-zinc-200 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5 text-zinc-300" />
                    Download PNG
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => handleSaveAsCharacter(item)}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-zinc-950/90 hover:bg-white/5 border border-white/10 text-xs font-medium text-zinc-300 transition-colors cursor-pointer"
                >
                  {savedCharId === item.id ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-300">Saved to Character Library</span>
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Save to Character Library</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
