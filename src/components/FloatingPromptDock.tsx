import { useState } from 'react';
import {
  Camera,
  ChevronDown,
  ChevronUp,
  Clapperboard,
  Image as ImageIcon,
  Maximize2,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { CAMERA_MOTIONS, STYLE_PRESETS } from '../data/seedData';
import type { AnimationStyle, AspectRatio, CameraMotion } from '../types/studio';

export type DockMode = 'image' | 'video' | 'script';

interface FloatingPromptDockProps {
  prompt: string;
  style: AnimationStyle;
  aspectRatio: AspectRatio;
  cameraMotion: CameraMotion;
  mode: DockMode;
  onPromptChange: (value: string) => void;
  onStyleChange: (style: AnimationStyle) => void;
  onAspectRatioChange: (ratio: AspectRatio) => void;
  onCameraMotionChange: (motion: CameraMotion) => void;
  onModeChange: (mode: DockMode) => void;
  onSubmit: () => void;
}

const RATIOS: AspectRatio[] = ['16:9', '9:16', '1:1', '21:9'];

export function FloatingPromptDock({
  prompt,
  style,
  aspectRatio,
  cameraMotion,
  mode,
  onPromptChange,
  onStyleChange,
  onAspectRatioChange,
  onCameraMotionChange,
  onModeChange,
  onSubmit,
}: FloatingPromptDockProps) {
  const [collapsed, setCollapsed] = useState(false);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && prompt.trim()) {
      e.preventDefault();
      onSubmit();
    }
  };

  if (collapsed) {
    return (
      <div className="fixed bottom-4 right-6 z-30">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-[#111116]/90 backdrop-blur-xl border border-white/15 text-xs font-medium text-zinc-100 shadow-2xl shadow-black/70 hover:border-cyan-400/50 transition-all cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          <span>Open Prompt Dock</span>
          <ChevronUp className="w-3.5 h-3.5 text-zinc-400" />
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 lg:left-[17rem] lg:right-6 z-30 pointer-events-none">
      <div className="max-w-4xl mx-auto pointer-events-auto bg-[#111116]/92 backdrop-blur-2xl border border-white/12 rounded-2xl shadow-[0_24px_60px_-15px_rgba(0,0,0,0.85)] ring-1 ring-indigo-500/15 p-3.5 space-y-3">
        {/* Top Row: Mode Switcher & Minimize */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1 p-0.5 bg-zinc-950/80 border border-white/10 rounded-lg">
            {(
              [
                { id: 'image', label: 'Text-to-Image', icon: ImageIcon },
                { id: 'video', label: 'Text-to-Video', icon: Clapperboard },
                { id: 'script', label: 'Story Script', icon: Wand2 },
              ] as const
            ).map((item) => {
              const Icon = item.icon;
              const active = mode === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onModeChange(item.id)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                    active
                      ? 'bg-indigo-500/20 text-cyan-300 border border-indigo-400/40 shadow-[0_0_12px_rgba(99,102,241,0.22)]'
                      : 'text-zinc-400 hover:text-zinc-100 border border-transparent'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 text-[11px] text-zinc-400">
            <span className="hidden sm:inline">100% Free · Zero Watermarks</span>
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              aria-label="Minimize prompt dock"
              className="p-1 rounded-md hover:bg-white/5 text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Prompt Input */}
        <div className="flex flex-col sm:flex-row items-stretch gap-2.5">
          <textarea
            rows={2}
            value={prompt}
            onChange={(e) => onPromptChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              mode === 'image'
                ? 'Describe any frame to render with free Flux.1 Schnell or SDXL...'
                : mode === 'video'
                ? 'Describe your moving shot for Wan 2.1 / CogVideoX shared GPU...'
                : 'Describe a story idea to break into editable scenes & keyframes...'
            }
            className="flex-1 bg-zinc-950/90 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-cyan-400/60 resize-none"
          />

          <button
            type="button"
            onClick={onSubmit}
            disabled={!prompt.trim()}
            className="sm:w-40 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 hover:from-indigo-400 hover:to-cyan-400 disabled:opacity-40 text-zinc-950 font-semibold text-xs tracking-wide shadow-lg shadow-indigo-500/20 transition-all cursor-pointer shrink-0"
          >
            <Sparkles className="w-4 h-4" />
            <span>
              {mode === 'image'
                ? 'Render Image'
                : mode === 'video'
                ? 'Generate Clip'
                : 'Draft Script'}
            </span>
          </button>
        </div>

        {/* Bottom Controls: Aspect Ratio, Style, Camera Motion */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            {/* Aspect Ratio Selector */}
            <div className="inline-flex items-center gap-1 bg-zinc-950/80 border border-white/10 rounded-lg p-0.5">
              <Maximize2 className="w-3 h-3 text-zinc-500 ml-1.5 mr-0.5" />
              {RATIOS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => onAspectRatioChange(r)}
                  className={`px-2 py-1 rounded-md font-mono text-[11px] tabular-nums transition-colors cursor-pointer ${
                    aspectRatio === r
                      ? 'bg-indigo-500/25 text-cyan-300 border border-cyan-400/35'
                      : 'text-zinc-400 hover:text-zinc-100 border border-transparent'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>

            {/* Visual Style Select */}
            <select
              aria-label="Visual style"
              value={style}
              onChange={(e) => onStyleChange(e.target.value as AnimationStyle)}
              className="bg-zinc-950/90 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-cyan-400/60 cursor-pointer"
            >
              {STYLE_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  Style: {preset.title}
                </option>
              ))}
            </select>

            {/* Camera Motion Select */}
            <div className="inline-flex items-center gap-1.5 bg-zinc-950/90 border border-white/10 rounded-lg px-2.5 py-1">
              <Camera className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <select
                aria-label="Camera motion control"
                value={cameraMotion}
                onChange={(e) => onCameraMotionChange(e.target.value as CameraMotion)}
                className="bg-transparent text-xs text-zinc-200 focus:outline-none cursor-pointer"
              >
                {CAMERA_MOTIONS.map((m) => (
                  <option key={m.id} value={m.id} className="bg-zinc-950 text-zinc-100">
                    Camera: {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <span className="text-[11px] text-zinc-500 font-mono hidden md:inline">
            Ctrl+Enter to launch
          </span>
        </div>
      </div>
    </div>
  );
}
