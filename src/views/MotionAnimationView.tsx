import { useEffect, useState } from 'react';
import {
  Camera,
  Check,
  Layers,
  Loader2,
  Move3d,
  Pause,
  Play,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { MotionClipPreview } from '../components/MotionClipPreview';
import { CAMERA_MOTIONS } from '../data/seedData';
import { STOCK_ASSETS } from '../data/stockAssets';
import { generateSceneStoryboard } from '../services/studioApi';
import type { CameraMotion, Scene, StockAsset, VideoProject } from '../types/studio';
import { svgToDataUrl } from '../utils/audioEngine';

interface MotionAnimationViewProps {
  activeProject: VideoProject;
  onUpdateProject: (updated: VideoProject) => void;
}

export function MotionAnimationView({
  activeProject,
  onUpdateProject,
}: MotionAnimationViewProps) {
  const [selectedSceneId, setSelectedSceneId] = useState(activeProject.scenes[0]?.id ?? '');
  const [activeBeatIndex, setActiveBeatIndex] = useState(0);
  const [isPlayingBeats, setIsPlayingBeats] = useState(false);
  const [isGeneratingBoard, setIsGeneratingBoard] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!activeProject.scenes.some((s) => s.id === selectedSceneId)) {
      setSelectedSceneId(activeProject.scenes[0]?.id ?? '');
    }
  }, [activeProject, selectedSceneId]);

  useEffect(() => {
    if (!isPlayingBeats) return;
    const id = window.setInterval(() => {
      setActiveBeatIndex((prev) => (prev + 1) % 3);
    }, 1500);
    return () => window.clearInterval(id);
  }, [isPlayingBeats]);

  const activeScene: Scene | null =
    activeProject.scenes.find((s) => s.id === selectedSceneId) ?? activeProject.scenes[0] ?? null;

  const motionPlates = STOCK_ASSETS.filter((a) => a.type === 'video');

  const handleSetCameraMotion = (motion: CameraMotion) => {
    if (!activeScene) return;
    onUpdateProject({
      ...activeProject,
      updatedAt: new Date().toISOString(),
      scenes: activeProject.scenes.map((sc) =>
        sc.id === activeScene.id ? { ...sc, cameraMotion: motion } : sc
      ),
    });
  };

  const handleToggleMotionPlate = (asset: StockAsset) => {
    if (!activeScene) return;
    const existing = activeScene.attachedAssets ?? [];
    const has = existing.some((a) => a.id === asset.id);
    const next = has ? existing.filter((a) => a.id !== asset.id) : [...existing, asset];
    onUpdateProject({
      ...activeProject,
      updatedAt: new Date().toISOString(),
      scenes: activeProject.scenes.map((sc) =>
        sc.id === activeScene.id ? { ...sc, attachedAssets: next } : sc
      ),
    });
  };

  const handleGenerateBoard = async () => {
    if (!activeScene) return;
    setErrorMsg(null);
    setIsGeneratingBoard(true);
    try {
      const sb = await generateSceneStoryboard({
        scene: activeScene,
        style: activeProject.style,
        aspectRatio: activeProject.aspectRatio,
        projectTitle: activeProject.title,
      });
      onUpdateProject({
        ...activeProject,
        updatedAt: new Date().toISOString(),
        scenes: activeProject.scenes.map((sc) =>
          sc.id === activeScene.id ? { ...sc, storyboard: sb } : sc
        ),
      });
      setActiveBeatIndex(0);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Storyboard sketch failed.');
    } finally {
      setIsGeneratingBoard(false);
    }
  };

  if (!activeScene) return null;

  return (
    <div className="space-y-6 pb-4">
      {errorMsg && (
        <div className="bg-red-950/50 border border-red-500/40 text-red-200 rounded-xl px-4 py-3 text-xs flex items-center justify-between">
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

      {/* Scene & Camera Choreography Selector */}
      <section className="bg-[#111116]/85 backdrop-blur-xl border border-white/10 rounded-2xl p-6 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-display font-semibold text-zinc-100 flex items-center gap-2">
              <Camera className="w-4 h-4 text-cyan-400" />
              Camera Motion &amp; Choreography Controls
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Assign camera movement paths and inspect AI storyboard keyframe blocking for{' '}
              <span className="text-zinc-200">{activeProject.title}</span>
            </p>
          </div>

          <select
            value={activeScene.id}
            onChange={(e) => setSelectedSceneId(e.target.value)}
            className="bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-zinc-100 focus:outline-none focus:border-cyan-400/60"
          >
            {activeProject.scenes.map((sc) => (
              <option key={sc.id} value={sc.id}>
                Scene {sc.sceneNumber}: {sc.title}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
          {CAMERA_MOTIONS.map((m) => {
            const active = (activeScene.cameraMotion ?? 'Static') === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => handleSetCameraMotion(m.id)}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  active
                    ? 'bg-indigo-500/20 border-cyan-400/60 text-zinc-50 shadow-[0_0_16px_rgba(6,182,212,0.14)]'
                    : 'bg-zinc-950/80 border-white/10 text-zinc-400 hover:text-zinc-100'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <Move3d className={`w-3.5 h-3.5 ${active ? 'text-cyan-400' : 'text-zinc-500'}`} />
                  {active && <Check className="w-3 h-3 text-cyan-400" />}
                </div>
                <div className="text-xs font-semibold mt-2">{m.label}</div>
                <div className="text-[11px] text-zinc-500 line-clamp-2 mt-0.5">{m.description}</div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Gemini 3-Keyframe Storyboard Sequence */}
      <section className="bg-[#111116]/85 backdrop-blur-xl border border-white/10 rounded-2xl p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-display font-semibold text-zinc-100 flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-400" />
              3-Keyframe AI Storyboard Sequence
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              {activeScene.storyboard?.sketchNotes ||
                'Powered by Gemini 2.5 Flash — Opening Frame, Action Beat, and Closing Transition'}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {activeScene.storyboard && activeScene.storyboard.keyframes.length > 0 && (
              <button
                type="button"
                onClick={() => setIsPlayingBeats((p) => !p)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-zinc-100 cursor-pointer"
              >
                {isPlayingBeats ? (
                  <>
                    <Pause className="w-3.5 h-3.5 text-cyan-400" />
                    Stop Animatic
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 text-cyan-400" />
                    Play Keyframes
                  </>
                )}
              </button>
            )}
            <button
              type="button"
              disabled={isGeneratingBoard}
              onClick={() => void handleGenerateBoard()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 hover:from-indigo-400 hover:to-cyan-400 disabled:opacity-45 text-zinc-950 text-xs font-semibold cursor-pointer"
            >
              {isGeneratingBoard ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Sketching...
                </>
              ) : (
                <>
                  <RefreshCw className="w-3.5 h-3.5" />
                  {activeScene.storyboard ? 'Regenerate Keyframes' : 'Sketch 3 Keyframes'}
                </>
              )}
            </button>
          </div>
        </div>

        {!activeScene.storyboard || activeScene.storyboard.keyframes.length === 0 ? (
          <div className="border border-dashed border-white/15 bg-zinc-950/70 rounded-xl p-10 text-center space-y-3">
            <p className="text-sm font-medium text-zinc-200">
              No storyboard frames sketched for Scene {activeScene.sceneNumber} yet
            </p>
            <button
              type="button"
              disabled={isGeneratingBoard}
              onClick={() => void handleGenerateBoard()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-400/40 text-xs font-medium text-indigo-200 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              Sketch Keyframes with Gemini
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {activeScene.storyboard.keyframes.map((kf, idx) => {
              const highlighted = (isPlayingBeats && activeBeatIndex === idx) || activeBeatIndex === idx;
              return (
                <div
                  key={kf.id}
                  onClick={() => setActiveBeatIndex(idx)}
                  className={`bg-zinc-950 border rounded-xl overflow-hidden transition-all cursor-pointer ${
                    highlighted
                      ? 'border-cyan-400/70 ring-1 ring-cyan-400/25'
                      : 'border-white/10 hover:border-white/25'
                  }`}
                >
                  <div className="aspect-video bg-[#09090B] border-b border-white/10">
                    <img
                      src={svgToDataUrl(kf.svgMarkup)}
                      alt={`${kf.beatLabel}: ${kf.caption}`}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <div className="p-4 space-y-1">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-cyan-300">
                        0{idx + 1}. {kf.beatLabel}
                      </span>
                      <span className="text-zinc-500">{kf.cameraMotion}</span>
                    </div>
                    <p className="text-xs text-zinc-300 leading-relaxed">{kf.caption}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Procedural Motion Overlay Plates */}
      <section className="bg-[#111116]/85 backdrop-blur-xl border border-white/10 rounded-2xl p-6 space-y-4">
        <div>
          <h3 className="text-base font-display font-semibold text-zinc-100">
            Free Atmospheric Motion Plates (Compiled in MP4 Export)
          </h3>
          <p className="text-xs text-zinc-400 mt-0.5">
            Attach real-time procedural motion layers to Scene {activeScene.sceneNumber}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {motionPlates.map((plate) => {
            const attached = (activeScene.attachedAssets ?? []).some((a) => a.id === plate.id);
            return (
              <div
                key={plate.id}
                className={`bg-zinc-950 border rounded-xl overflow-hidden transition-all ${
                  attached ? 'border-cyan-400/60' : 'border-white/10'
                }`}
              >
                <div className="aspect-video border-b border-white/10">
                  <MotionClipPreview
                    preset={plate.motionPreset}
                    accentColor={plate.accentColor}
                    active={true}
                  />
                </div>
                <div className="p-3.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-zinc-100 truncate">{plate.title}</div>
                    <div className="text-[11px] text-zinc-500 font-mono">{plate.resolutionOrBpm}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggleMotionPlate(plate)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer shrink-0 ${
                      attached
                        ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200'
                        : 'bg-white/5 hover:bg-white/10 border-white/10 text-zinc-200'
                    }`}
                  >
                    {attached ? 'Attached' : 'Attach'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
