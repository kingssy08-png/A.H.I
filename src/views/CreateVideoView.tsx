import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Cpu,
  Film,
  ImagePlus,
  Layers,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Upload,
  Video,
  Volume2,
  Wand2,
} from 'lucide-react';
import { FreeGpuStatusCard } from '../components/FreeGpuStatusCard';
import { StockAssetsPanel } from '../components/StockAssetsPanel';
import { CAMERA_MOTIONS, STORY_STARTERS, STYLE_PRESETS } from '../data/seedData';
import {
  generateHfVideoClip,
  generateSceneStoryboard,
  generateScript,
  refineSceneWithAi,
  synthesizeVoiceover,
} from '../services/studioApi';
import type {
  AnimationStyle,
  AspectRatio,
  CameraMotion,
  CharacterProfile,
  Scene,
  StockAsset,
  StudioView,
  VideoProject,
} from '../types/studio';
import { formatTimecode, speakWithBrowserTts, svgToDataUrl } from '../utils/audioEngine';

interface CreateVideoViewProps {
  activeProject: VideoProject;
  characters: CharacterProfile[];
  pendingQuickStart: {
    idea: string;
    style: AnimationStyle;
    aspectRatio?: AspectRatio;
    cameraMotion?: CameraMotion;
    mode?: 'video' | 'script';
  } | null;
  onClearPendingQuickStart: () => void;
  onUpdateProject: (updated: VideoProject) => void;
  onCreateProject: (newProject: VideoProject) => void;
  onNavigate: (view: StudioView) => void;
}

export function CreateVideoView({
  activeProject,
  characters,
  pendingQuickStart,
  onClearPendingQuickStart,
  onUpdateProject,
  onCreateProject,
  onNavigate,
}: CreateVideoViewProps) {
  const [storyIdea, setStoryIdea] = useState(activeProject.storyIdea);
  const [style, setStyle] = useState<AnimationStyle>(activeProject.style);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(activeProject.aspectRatio);
  const [cameraMotion, setCameraMotion] = useState<CameraMotion>('Zoom In');
  const [targetDuration, setTargetDuration] = useState<number>(40);
  const [tone, setTone] = useState('');
  const [selectedCharIds, setSelectedCharIds] = useState<string[]>(activeProject.characterIds);
  const [autoStoryboard, setAutoStoryboard] = useState(true);
  const [briefExpanded, setBriefExpanded] = useState(true);

  const [selectedSceneId, setSelectedSceneId] = useState<string>(
    activeProject.scenes[0]?.id ?? ''
  );
  const [editorTab, setEditorTab] = useState<'script' | 'storyboard' | 'video' | 'stock'>('video');

  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [storyboardStatus, setStoryboardStatus] = useState<string | null>(null);
  const [refiningSceneId, setRefiningSceneId] = useState<string | null>(null);
  const [refineInstruction, setRefineInstruction] = useState('');
  const [isSynthesizingVoice, setIsSynthesizingVoice] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Text-to-Video & Image-to-Video via Fast Distilled Spaces & Colab Turbo GPU
  const [videoMode, setVideoMode] = useState<'text-to-video' | 'image-to-video'>('text-to-video');
  const [videoSpaceId, setVideoSpaceId] = useState('Lightricks/ltx-video-distilled');
  const [i2vReferenceImage, setI2vReferenceImage] = useState<string>('');
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [videoQueueStatus, setVideoQueueStatus] = useState<string | null>(null);
  const [videoQueueProgress, setVideoQueueProgress] = useState(0);
  const [activeVideoSpace, setActiveVideoSpace] = useState<string | undefined>(undefined);
  const [videoAttemptInfo, setVideoAttemptInfo] = useState<{ attempt?: number; total?: number }>({});
  const [videoTranslatedPrompt, setVideoTranslatedPrompt] = useState<string | null>(null);

  // Storyboard Animatic Keyframe Player state
  const [activeBeatIndex, setActiveBeatIndex] = useState(0);
  const [isPlayingBeats, setIsPlayingBeats] = useState(false);

  useEffect(() => {
    setStoryIdea(activeProject.storyIdea);
    setStyle(activeProject.style);
    setAspectRatio(activeProject.aspectRatio);
    setSelectedCharIds(activeProject.characterIds);
    if (!activeProject.scenes.some((s) => s.id === selectedSceneId)) {
      setSelectedSceneId(activeProject.scenes[0]?.id ?? '');
    }
  }, [activeProject.id]);

  useEffect(() => {
    if (!isPlayingBeats) return;
    const timer = window.setInterval(() => {
      setActiveBeatIndex((prev) => (prev + 1) % 3);
    }, 1600);
    return () => window.clearInterval(timer);
  }, [isPlayingBeats]);

  const activeScene =
    activeProject.scenes.find((s) => s.id === selectedSceneId) ?? activeProject.scenes[0] ?? null;

  const runScriptGeneration = async (
    ideaToUse: string,
    styleToUse: AnimationStyle,
    ratioToUse: AspectRatio = aspectRatio,
    motionToUse: CameraMotion = cameraMotion
  ) => {
    if (!ideaToUse.trim()) {
      setErrorBanner('Enter a story idea before generating a scene script.');
      return;
    }

    setErrorBanner(null);
    setIsGeneratingScript(true);
    try {
      const castDetails = characters
        .filter((c) => selectedCharIds.includes(c.id))
        .map((c) => ({
          name: c.name,
          role: c.role,
          appearancePrompt: c.appearancePrompt,
        }));

      const generated = await generateScript({
        storyIdea: ideaToUse,
        style: styleToUse,
        targetDurationSeconds: targetDuration,
        aspectRatio: ratioToUse,
        cameraMotion: motionToUse,
        characters: castDetails,
        tone,
      });

      const stylePreset = STYLE_PRESETS.find((p) => p.id === styleToUse);
      const now = new Date().toISOString();

      const newScenes: Scene[] = (generated.scenes ?? []).map((sc, idx) => ({
        id: `sc-${Date.now()}-${idx}`,
        sceneNumber: idx + 1,
        title: sc.title || `Scene ${idx + 1}`,
        durationSeconds: Math.max(4, Math.min(45, Number(sc.durationSeconds) || 8)),
        cameraAngle: sc.cameraAngle || 'Medium Shot',
        cameraMotion: motionToUse,
        lightingMood: sc.lightingMood || 'Balanced studio lighting',
        actionDescription: sc.actionDescription || '',
        visualPrompt: sc.visualPrompt || '',
        narration: sc.narration || '',
        dialogueLines: (sc.dialogueLines ?? []).map((dl, dIdx) => ({
          id: `dl-${Date.now()}-${idx}-${dIdx}`,
          speaker: dl.speaker || 'Narrator',
          emotion: dl.emotion || 'Neutral',
          line: dl.line || '',
        })),
        sfxCue: sc.sfxCue || '',
        transition: sc.transition || 'Cut',
      }));

      const newProject: VideoProject = {
        id: `proj-${Date.now()}`,
        title: generated.title || 'Untitled Animated Story',
        logline: generated.logline || '',
        storyIdea: ideaToUse,
        style: styleToUse,
        aspectRatio: ratioToUse,
        styleNotes: generated.styleNotes || '',
        suggestedMusicMood: generated.suggestedMusicMood || 'Cinematic · 96 BPM',
        selectedMusicId:
          styleToUse === 'Anime'
            ? 'track-twilight-piano'
            : styleToUse === 'Educational'
            ? 'track-science-pulse'
            : 'track-workshop-marimba',
        characterIds: selectedCharIds,
        scenes: newScenes,
        thumbnailUrl: stylePreset?.previewImage,
        createdAt: now,
        updatedAt: now,
      };

      onCreateProject(newProject);
      if (newScenes[0]) {
        setSelectedSceneId(newScenes[0].id);
      }
      setBriefExpanded(false);
      setEditorTab('script');

      if (autoStoryboard && newScenes.length > 0) {
        let workingProject = newProject;
        for (let i = 0; i < newScenes.length; i++) {
          const targetScene = newScenes[i];
          setStoryboardStatus(
            `Sketching AI storyboard keyframes for Scene ${i + 1} of ${newScenes.length}...`
          );
          try {
            const sb = await generateSceneStoryboard({
              scene: targetScene,
              style: styleToUse,
              aspectRatio: ratioToUse,
              projectTitle: newProject.title,
            });
            workingProject = {
              ...workingProject,
              updatedAt: new Date().toISOString(),
              scenes: workingProject.scenes.map((s) =>
                s.id === targetScene.id ? { ...s, storyboard: sb } : s
              ),
            };
            onUpdateProject(workingProject);
          } catch (sbErr) {
            setErrorBanner(
              sbErr instanceof Error
                ? `Storyboard sketch paused at Scene ${i + 1}: ${sbErr.message}`
                : 'Could not complete storyboard sketches.'
            );
            break;
          }
        }
        setStoryboardStatus(null);
      }
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Failed to generate script.');
    } finally {
      setIsGeneratingScript(false);
    }
  };

  const triggerQuickTextToVideo = async (
    sceneToUpdate: Scene,
    idea: string,
    qsStyle: AnimationStyle,
    qsRatio: AspectRatio,
    qsMotion: CameraMotion
  ) => {
    setErrorBanner(null);
    setIsGeneratingVideo(true);
    setVideoQueueProgress(10);
    setActiveVideoSpace(videoSpaceId);
    setVideoAttemptInfo({ attempt: 1, total: 3 });
    setVideoTranslatedPrompt(null);
    setVideoQueueStatus(`Connecting to free community GPU (${videoSpaceId})...`);
    try {
      const result = await generateHfVideoClip(
        {
          prompt: idea,
          mode: 'text-to-video',
          style: qsStyle,
          aspectRatio: qsRatio,
          cameraMotion: qsMotion,
          spaceId: videoSpaceId,
        },
        (evt) => {
          if (evt.message) setVideoQueueStatus(evt.message);
          if (typeof evt.progress === 'number') setVideoQueueProgress(evt.progress);
          if (evt.space) setActiveVideoSpace(evt.space);
          if (evt.attempt && evt.totalAttempts) {
            setVideoAttemptInfo({ attempt: evt.attempt, total: evt.totalAttempts });
          }
          if (evt.translatedPrompt) setVideoTranslatedPrompt(evt.translatedPrompt);
        }
      );

      onUpdateProject({
        ...activeProject,
        style: qsStyle,
        aspectRatio: qsRatio,
        updatedAt: new Date().toISOString(),
        scenes: activeProject.scenes.map((s) =>
          s.id === sceneToUpdate.id
            ? {
                ...s,
                visualPrompt: idea,
                cameraMotion: qsMotion,
                generatedVideoUrl: result.videoUrl,
                generatedVideoSpace: result.spaceUsed,
                generatedVideoMode: result.mode,
              }
            : s
        ),
      });
      setVideoQueueProgress(100);
      setActiveVideoSpace(result.spaceUsed);
      if (result.translatedPrompt) setVideoTranslatedPrompt(result.translatedPrompt);
      const secs = result.elapsedMs ? ` in ${(result.elapsedMs / 1000).toFixed(1)}s` : '';
      setVideoQueueStatus(`Rendered clean watermark-free clip${secs} via ${result.nodeLabel}`);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Hugging Face video generation failed.');
      setVideoQueueStatus(null);
      setVideoQueueProgress(0);
    } finally {
      setIsGeneratingVideo(false);
    }
  };

  useEffect(() => {
    if (!pendingQuickStart) return;
    const {
      idea,
      style: qsStyle,
      aspectRatio: qsRatio,
      cameraMotion: qsMotion,
      mode,
    } = pendingQuickStart;
    setStoryIdea(idea);
    setStyle(qsStyle);
    if (qsRatio) setAspectRatio(qsRatio);
    if (qsMotion) setCameraMotion(qsMotion);
    onClearPendingQuickStart();

    if (mode === 'video' && activeScene) {
      setBriefExpanded(false);
      setVideoMode('text-to-video');
      setEditorTab('video');
      const nextRatio = qsRatio ?? activeProject.aspectRatio;
      const nextMotion = qsMotion ?? activeScene.cameraMotion ?? 'Zoom In';
      const updatedScene: Scene = {
        ...activeScene,
        visualPrompt: idea,
        cameraMotion: nextMotion,
      };
      onUpdateProject({
        ...activeProject,
        style: qsStyle,
        aspectRatio: nextRatio,
        updatedAt: new Date().toISOString(),
        scenes: activeProject.scenes.map((s) => (s.id === activeScene.id ? updatedScene : s)),
      });
      void triggerQuickTextToVideo(updatedScene, idea, qsStyle, nextRatio, nextMotion);
    } else {
      void runScriptGeneration(
        idea,
        qsStyle,
        qsRatio ?? aspectRatio,
        qsMotion ?? cameraMotion
      );
    }
  }, [pendingQuickStart]);

  const updateActiveScene = (updater: (scene: Scene) => Scene) => {
    if (!activeScene) return;
    onUpdateProject({
      ...activeProject,
      updatedAt: new Date().toISOString(),
      scenes: activeProject.scenes.map((s) => (s.id === activeScene.id ? updater(s) : s)),
    });
  };

  const handleGenerateStoryboardForScene = async (scene: Scene) => {
    setErrorBanner(null);
    setStoryboardStatus(`Sketching 3 keyframes for Scene ${scene.sceneNumber}...`);
    try {
      const sb = await generateSceneStoryboard({
        scene,
        style: activeProject.style,
        aspectRatio: activeProject.aspectRatio,
        projectTitle: activeProject.title,
      });
      onUpdateProject({
        ...activeProject,
        updatedAt: new Date().toISOString(),
        scenes: activeProject.scenes.map((s) =>
          s.id === scene.id ? { ...s, storyboard: sb } : s
        ),
      });
      setEditorTab('storyboard');
      setActiveBeatIndex(0);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Storyboard generation failed.');
    } finally {
      setStoryboardStatus(null);
    }
  };

  const handleGenerateAllStoryboards = async () => {
    setErrorBanner(null);
    let working = activeProject;
    for (let i = 0; i < working.scenes.length; i++) {
      const sc = working.scenes[i];
      setStoryboardStatus(
        `Sketching AI storyboard keyframes for Scene ${i + 1} of ${working.scenes.length}...`
      );
      try {
        const sb = await generateSceneStoryboard({
          scene: sc,
          style: working.style,
          aspectRatio: working.aspectRatio,
          projectTitle: working.title,
        });
        working = {
          ...working,
          updatedAt: new Date().toISOString(),
          scenes: working.scenes.map((s) => (s.id === sc.id ? { ...s, storyboard: sb } : s)),
        };
        onUpdateProject(working);
      } catch (err) {
        setErrorBanner(err instanceof Error ? err.message : 'Storyboard batch paused.');
        break;
      }
    }
    setStoryboardStatus(null);
  };

  const handleRefineScene = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeScene || !refineInstruction.trim()) return;
    setErrorBanner(null);
    setRefiningSceneId(activeScene.id);
    try {
      const revised = await refineSceneWithAi({
        scene: activeScene,
        instruction: refineInstruction.trim(),
        style: activeProject.style,
        projectTitle: activeProject.title,
      });
      updateActiveScene((prev) => ({
        ...prev,
        title: revised.title || prev.title,
        durationSeconds: Number(revised.durationSeconds) || prev.durationSeconds,
        cameraAngle: revised.cameraAngle || prev.cameraAngle,
        lightingMood: revised.lightingMood || prev.lightingMood,
        actionDescription: revised.actionDescription || prev.actionDescription,
        visualPrompt: revised.visualPrompt || prev.visualPrompt,
        narration: revised.narration || prev.narration,
        dialogueLines: (revised.dialogueLines ?? []).map((dl, idx) => ({
          id: `dl-ref-${Date.now()}-${idx}`,
          speaker: dl.speaker,
          emotion: dl.emotion,
          line: dl.line,
        })),
        sfxCue: revised.sfxCue || prev.sfxCue,
        transition: revised.transition || prev.transition,
      }));
      setRefineInstruction('');
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Could not refine scene.');
    } finally {
      setRefiningSceneId(null);
    }
  };

  const handlePreviewNarrationVoice = async () => {
    if (!activeScene || !activeScene.narration.trim()) return;
    setErrorBanner(null);
    setIsSynthesizingVoice(true);
    try {
      const voiceName = activeScene.voiceName ?? 'Kore';
      const result = await synthesizeVoiceover({
        text: activeScene.narration,
        voiceName,
        styleInstruction: `${activeProject.style} animation narrator, ${activeScene.lightingMood}`,
      });
      updateActiveScene((prev) => ({
        ...prev,
        voiceAudioBase64: result.audioBase64,
        voiceName: result.voiceName,
      }));
      const audio = new Audio(`data:audio/wav;base64,${result.audioBase64}`);
      void audio.play();
    } catch {
      speakWithBrowserTts(activeScene.narration, {
        voiceName: activeScene.browserVoiceName,
        rate: activeScene.browserVoiceRate ?? 1,
        pitch: activeScene.browserVoicePitch ?? 1,
      });
    } finally {
      setIsSynthesizingVoice(false);
    }
  };

  const handleGenerateSceneVideoClip = async () => {
    if (!activeScene) return;
    const promptText = [activeScene.visualPrompt, activeScene.actionDescription]
      .filter(Boolean)
      .join('. ');
    if (!promptText.trim()) {
      setErrorBanner('Add a visual or action description to this scene first.');
      return;
    }

    if (videoMode === 'image-to-video' && !i2vReferenceImage) {
      setErrorBanner('Select a character portrait or reference image for Image-to-Video.');
      return;
    }

    setErrorBanner(null);
    setIsGeneratingVideo(true);
    setVideoQueueProgress(10);
    setActiveVideoSpace(videoSpaceId);
    setVideoAttemptInfo({ attempt: 1, total: 3 });
    setVideoTranslatedPrompt(null);
    setVideoQueueStatus(`Connecting to free community GPU (${videoSpaceId})...`);

    try {
      const result = await generateHfVideoClip(
        {
          prompt: promptText,
          mode: videoMode,
          imageDataUrl: videoMode === 'image-to-video' ? i2vReferenceImage : undefined,
          style: activeProject.style,
          aspectRatio: activeProject.aspectRatio,
          cameraMotion: activeScene.cameraMotion ?? cameraMotion,
          spaceId: videoSpaceId,
        },
        (evt) => {
          if (evt.message) setVideoQueueStatus(evt.message);
          if (typeof evt.progress === 'number') setVideoQueueProgress(evt.progress);
          if (evt.space) setActiveVideoSpace(evt.space);
          if (evt.attempt && evt.totalAttempts) {
            setVideoAttemptInfo({ attempt: evt.attempt, total: evt.totalAttempts });
          }
          if (evt.translatedPrompt) setVideoTranslatedPrompt(evt.translatedPrompt);
        }
      );

      updateActiveScene((prev) => ({
        ...prev,
        generatedVideoUrl: result.videoUrl,
        generatedVideoSpace: result.spaceUsed,
        generatedVideoMode: result.mode,
      }));
      setVideoQueueProgress(100);
      setActiveVideoSpace(result.spaceUsed);
      if (result.translatedPrompt) setVideoTranslatedPrompt(result.translatedPrompt);
      const secs = result.elapsedMs ? ` in ${(result.elapsedMs / 1000).toFixed(1)}s` : '';
      setVideoQueueStatus(`Rendered clean watermark-free clip${secs} via ${result.nodeLabel}`);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Hugging Face video generation failed.');
      setVideoQueueStatus(null);
      setVideoQueueProgress(0);
    } finally {
      setIsGeneratingVideo(false);
    }
  };

  const handleUploadI2vImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setI2vReferenceImage(reader.result);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleAttachStockAsset = (asset: StockAsset) => {
    if (!activeScene) return;
    const existing = activeScene.attachedAssets ?? [];
    const already = existing.some((a) => a.id === asset.id);
    const nextAssets = already
      ? existing.filter((a) => a.id !== asset.id)
      : [...existing, asset];
    updateActiveScene((prev) => ({
      ...prev,
      attachedAssets: nextAssets,
    }));
  };

  const handleSelectProjectMusic = (asset: StockAsset) => {
    onUpdateProject({
      ...activeProject,
      selectedMusicId: asset.id,
      suggestedMusicMood: `${asset.title} · ${asset.resolutionOrBpm}`,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleAddBlankScene = () => {
    const nextNum = activeProject.scenes.length + 1;
    const newScene: Scene = {
      id: `sc-${Date.now()}`,
      sceneNumber: nextNum,
      title: `Scene ${nextNum}`,
      durationSeconds: 8,
      cameraAngle: 'Medium Shot',
      cameraMotion: 'Zoom In',
      lightingMood: 'Warm key light',
      actionDescription: '',
      visualPrompt: '',
      narration: '',
      dialogueLines: [],
      sfxCue: '',
      transition: 'Cut',
    };
    onUpdateProject({
      ...activeProject,
      updatedAt: new Date().toISOString(),
      scenes: [...activeProject.scenes, newScene],
    });
    setSelectedSceneId(newScene.id);
  };

  const handleMoveScene = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= activeProject.scenes.length) return;
    const copy = [...activeProject.scenes];
    const [moved] = copy.splice(index, 1);
    copy.splice(target, 0, moved);
    const renumbered = copy.map((sc, i) => ({ ...sc, sceneNumber: i + 1 }));
    onUpdateProject({
      ...activeProject,
      updatedAt: new Date().toISOString(),
      scenes: renumbered,
    });
  };

  const handleDeleteScene = (sceneId: string) => {
    if (activeProject.scenes.length <= 1) return;
    const filtered = activeProject.scenes
      .filter((s) => s.id !== sceneId)
      .map((s, idx) => ({ ...s, sceneNumber: idx + 1 }));
    onUpdateProject({
      ...activeProject,
      updatedAt: new Date().toISOString(),
      scenes: filtered,
    });
    if (selectedSceneId === sceneId && filtered[0]) {
      setSelectedSceneId(filtered[0].id);
    }
  };

  const totalRuntime = activeProject.scenes.reduce((sum, s) => sum + s.durationSeconds, 0);
  let cumulativeSec = 0;

  return (
    <div className="space-y-6 pb-4">
      {/* Honest Free Open-Source Banner */}
      <div className="bg-[#111116]/90 backdrop-blur-xl border border-white/10 rounded-2xl px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5 text-zinc-200">
          <Cpu className="w-4 h-4 text-cyan-400 shrink-0" />
          <div>
            <span className="font-semibold text-zinc-100">
              A.H.I Resilient Video Engine (Wan 2.1 · CogVideoX-5b · Mochi 1) &amp; Gemini Script Engine
            </span>
            <span className="text-zinc-500 mx-2" aria-hidden="true">
              ·
            </span>
            <span className="text-zinc-400">
              Auto-failover routing across free community GPUs with automatic camera &amp; style translation.
            </span>
          </div>
        </div>
        <span className="font-mono text-emerald-400 shrink-0">Zero Paywalls</span>
      </div>

      {errorBanner && (
        <div className="bg-red-950/50 border border-red-500/40 text-red-200 rounded-xl px-4 py-3 flex items-center justify-between gap-4 text-xs">
          <span>{errorBanner}</span>
          <button
            type="button"
            onClick={() => setErrorBanner(null)}
            className="font-medium text-red-300 hover:text-white whitespace-nowrap shrink-0 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {storyboardStatus && (
        <div className="bg-indigo-500/10 border border-indigo-400/35 text-indigo-200 rounded-xl px-4 py-3 flex items-center gap-3 text-xs">
          <Loader2 className="w-4 h-4 animate-spin text-cyan-400 shrink-0" />
          <span>{storyboardStatus}</span>
        </div>
      )}

      {/* Collapsible Gemini Story Brief & Generator */}
      <section className="bg-[#111116]/85 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
        <button
          type="button"
          onClick={() => setBriefExpanded((v) => !v)}
          className="w-full px-6 py-4 flex items-center justify-between gap-4 hover:bg-white/[0.02] transition-colors text-left cursor-pointer"
        >
          <div>
            <h2 className="text-base font-display font-semibold text-zinc-100">
              Gemini Story Script &amp; Scene Breakdown
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Turn any story idea into an editable multi-scene script and storyboard sequence
            </p>
          </div>
          {briefExpanded ? (
            <ChevronUp className="w-4 h-4 text-zinc-400 shrink-0" />
          ) : (
            <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
          )}
        </button>

        {briefExpanded && (
          <div className="px-6 pb-6 pt-3 border-t border-white/10 space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-zinc-400">Quick Starters:</span>
              {STORY_STARTERS.map((starter) => (
                <button
                  key={starter.label}
                  type="button"
                  onClick={() => {
                    setStoryIdea(starter.idea);
                    setStyle(starter.style);
                  }}
                  className="px-3 py-1.5 text-xs bg-zinc-950 hover:bg-white/5 text-zinc-300 border border-white/10 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {starter.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="lg:col-span-2 space-y-3">
                <label className="block text-xs font-medium text-zinc-300">
                  Story Idea / Director Brief
                </label>
                <textarea
                  rows={4}
                  value={storyIdea}
                  onChange={(e) => setStoryIdea(e.target.value)}
                  placeholder="Describe your story arc, main conflict, setting, or product brief..."
                  className="w-full bg-zinc-950 border border-white/10 rounded-xl p-3.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-cyan-400/60"
                />

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1.5">Target Runtime</label>
                    <select
                      value={targetDuration}
                      onChange={(e) => setTargetDuration(Number(e.target.value))}
                      className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-cyan-400/60"
                    >
                      <option value={30}>30 seconds (3 scenes)</option>
                      <option value={45}>45 seconds (4–5 scenes)</option>
                      <option value={60}>60 seconds (6 scenes)</option>
                      <option value={90}>90 seconds (8 scenes)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1.5">Aspect Ratio</label>
                    <select
                      value={aspectRatio}
                      onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
                      className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-xs font-mono text-zinc-100 focus:outline-none focus:border-cyan-400/60"
                    >
                      <option value="16:9">16:9 Widescreen</option>
                      <option value="9:16">9:16 Vertical Reel</option>
                      <option value="1:1">1:1 Square Feed</option>
                      <option value="21:9">21:9 CinemaScope</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1.5">Camera Motion</label>
                    <select
                      value={cameraMotion}
                      onChange={(e) => setCameraMotion(e.target.value as CameraMotion)}
                      className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-cyan-400/60"
                    >
                      {CAMERA_MOTIONS.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1.5">Tone / Notes</label>
                    <input
                      type="text"
                      value={tone}
                      onChange={(e) => setTone(e.target.value)}
                      placeholder="e.g. Moody anamorphic"
                      className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-cyan-400/60"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                    Visual Style
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {STYLE_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setStyle(preset.id)}
                        className={`px-2.5 py-2 rounded-xl border text-left transition-all flex items-center justify-between gap-1.5 cursor-pointer ${
                          style === preset.id
                            ? 'bg-indigo-500/20 border-cyan-400/50 text-zinc-50'
                            : 'bg-zinc-950 border-white/10 text-zinc-400 hover:text-zinc-100'
                        }`}
                      >
                        <span className="text-[11px] font-medium truncate">{preset.title}</span>
                        {style === preset.id && <Check className="w-3 h-3 text-cyan-400 shrink-0" />}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                    Cast Characters ({selectedCharIds.length})
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {characters.map((ch) => {
                      const active = selectedCharIds.includes(ch.id);
                      return (
                        <button
                          key={ch.id}
                          type="button"
                          onClick={() =>
                            setSelectedCharIds((prev) =>
                              active ? prev.filter((id) => id !== ch.id) : [...prev, ch.id]
                            )
                          }
                          className={`px-2.5 py-1 text-xs rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            active
                              ? 'bg-indigo-500/20 border-cyan-400/40 text-cyan-200'
                              : 'bg-zinc-950 border-white/10 text-zinc-400 hover:text-zinc-100'
                          }`}
                        >
                          {ch.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2 border-t border-white/10">
              <label className="inline-flex items-center gap-2.5 text-xs text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoStoryboard}
                  onChange={(e) => setAutoStoryboard(e.target.checked)}
                  className="rounded border-white/20 bg-zinc-950 text-indigo-500"
                />
                Automatically sketch 3-keyframe AI storyboards for each scene
              </label>

              <button
                type="button"
                disabled={isGeneratingScript}
                onClick={() => void runScriptGeneration(storyIdea, style)}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-cyan-500 hover:from-indigo-400 hover:to-cyan-400 disabled:opacity-50 text-zinc-950 text-xs font-semibold rounded-xl transition-all whitespace-nowrap shrink-0 cursor-pointer"
              >
                {isGeneratingScript ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Writing Scene Script...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Generate Script &amp; Storyboards
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Active Project Header & Timeline Strip */}
      <section className="bg-[#111116]/85 backdrop-blur-xl border border-white/10 rounded-2xl p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="flex-1 space-y-2">
            <input
              type="text"
              value={activeProject.title}
              onChange={(e) =>
                onUpdateProject({
                  ...activeProject,
                  title: e.target.value,
                  updatedAt: new Date().toISOString(),
                })
              }
              aria-label="Project title"
              className="w-full bg-transparent text-xl font-display font-semibold text-zinc-100 focus:outline-none border-b border-transparent focus:border-cyan-400/60 pb-0.5"
            />
            <textarea
              rows={2}
              value={activeProject.logline}
              onChange={(e) =>
                onUpdateProject({
                  ...activeProject,
                  logline: e.target.value,
                  updatedAt: new Date().toISOString(),
                })
              }
              aria-label="Project logline"
              className="w-full bg-transparent text-sm text-zinc-400 focus:outline-none resize-none border-b border-transparent focus:border-white/20"
            />
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
              <span className="text-cyan-300">{activeProject.style}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">{activeProject.aspectRatio}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{activeProject.scenes.length} scenes</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">{formatTimecode(totalRuntime)}</span>
              <span aria-hidden="true">·</span>
              <span>Score: {activeProject.suggestedMusicMood}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={Boolean(storyboardStatus)}
              onClick={() => void handleGenerateAllStoryboards()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-white/5 hover:bg-white/10 text-zinc-100 border border-white/10 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              Sketch All Storyboards
            </button>
            <button
              type="button"
              onClick={handleAddBlankScene}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-white/5 hover:bg-white/10 text-zinc-100 border border-white/10 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Scene
            </button>
            <button
              type="button"
              onClick={() => onNavigate('export')}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-gradient-to-r from-indigo-500 to-cyan-500 hover:from-indigo-400 hover:to-cyan-400 text-zinc-950 rounded-xl transition-all whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Film className="w-3.5 h-3.5" />
              Export MP4
            </button>
          </div>
        </div>

        {/* Proportional Scene Timeline Strip */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Scene Timeline</span>
            <span className="font-mono tabular-nums">Total {formatTimecode(totalRuntime)}</span>
          </div>
          <div className="flex items-stretch gap-2 overflow-x-auto pb-1">
            {activeProject.scenes.map((scene) => {
              const startSec = cumulativeSec;
              cumulativeSec += scene.durationSeconds;
              const isSelected = activeScene?.id === scene.id;
              const hasBoard = Boolean(scene.storyboard && scene.storyboard.keyframes.length > 0);
              const assetCount = scene.attachedAssets?.length ?? 0;

              return (
                <button
                  key={scene.id}
                  type="button"
                  onClick={() => {
                    setSelectedSceneId(scene.id);
                    setActiveBeatIndex(0);
                  }}
                  style={{ minWidth: '175px', flexGrow: scene.durationSeconds }}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-indigo-500/15 border-cyan-400/60 shadow-[0_0_16px_rgba(6,182,212,0.12)]'
                      : 'bg-zinc-950 border-white/10 hover:border-white/25'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-xs font-mono tabular-nums text-zinc-400">
                    <span>
                      S{String(scene.sceneNumber).padStart(2, '0')} · {formatTimecode(startSec)}
                    </span>
                    <span>{scene.durationSeconds}s</span>
                  </div>
                  <div className="text-xs font-semibold text-zinc-100 truncate mt-1">
                    {scene.title}
                  </div>
                  <div className="text-[11px] text-zinc-500 mt-1 truncate">
                    {scene.generatedVideoUrl
                      ? 'AI clip attached'
                      : hasBoard
                      ? '3 storyboard frames'
                      : 'No visuals yet'}
                    {assetCount > 0 ? ` · ${assetCount} asset${assetCount > 1 ? 's' : ''}` : ''}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Active Scene Editor */}
      {activeScene && (
        <section className="bg-[#111116]/85 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs text-cyan-400 tabular-nums">
                Scene {String(activeScene.sceneNumber).padStart(2, '0')}
              </span>
              <span aria-hidden="true" className="text-zinc-700">
                /
              </span>
              <h3 className="text-base font-display font-semibold text-zinc-100">
                {activeScene.title}
              </h3>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1 p-1 bg-zinc-950 border border-white/10 rounded-xl">
                {(
                  [
                    { id: 'video', label: 'AI Video Clip' },
                    { id: 'script', label: 'Script & Dialogue' },
                    { id: 'storyboard', label: 'AI Storyboard' },
                    { id: 'stock', label: 'Stock Assets' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setEditorTab(tab.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                      editorTab === tab.id
                        ? 'bg-indigo-500/20 text-cyan-300 border border-indigo-400/40'
                        : 'text-zinc-400 hover:text-zinc-100 border border-transparent'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1">
                {(() => {
                  const idx = activeProject.scenes.findIndex((s) => s.id === activeScene.id);
                  return (
                    <>
                      <button
                        type="button"
                        disabled={idx <= 0}
                        onClick={() => handleMoveScene(idx, -1)}
                        title="Move scene earlier"
                        className="p-2 rounded-lg bg-zinc-950 border border-white/10 text-zinc-400 hover:text-zinc-100 disabled:opacity-35 cursor-pointer"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={idx >= activeProject.scenes.length - 1}
                        onClick={() => handleMoveScene(idx, 1)}
                        title="Move scene later"
                        className="p-2 rounded-lg bg-zinc-950 border border-white/10 text-zinc-400 hover:text-zinc-100 disabled:opacity-35 cursor-pointer"
                      >
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={activeProject.scenes.length <= 1}
                        onClick={() => handleDeleteScene(activeScene.id)}
                        title="Delete scene"
                        className="p-2 rounded-lg bg-zinc-950 border border-white/10 text-zinc-400 hover:text-red-400 disabled:opacity-35 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* Tab 1: Editable Script & Dialogue */}
          {editorTab === 'script' && (
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs text-zinc-400 mb-1.5">Scene Title</label>
                  <input
                    type="text"
                    value={activeScene.title}
                    onChange={(e) =>
                      updateActiveScene((s) => ({ ...s, title: e.target.value }))
                    }
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-cyan-400/60"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1.5">Duration (sec)</label>
                  <input
                    type="number"
                    min={2}
                    max={120}
                    value={activeScene.durationSeconds}
                    onChange={(e) =>
                      updateActiveScene((s) => ({
                        ...s,
                        durationSeconds: Math.max(2, Number(e.target.value) || 4),
                      }))
                    }
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-sm font-mono tabular-nums text-zinc-100 focus:outline-none focus:border-cyan-400/60"
                  />
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1.5">Camera Angle</label>
                  <input
                    type="text"
                    value={activeScene.cameraAngle}
                    onChange={(e) =>
                      updateActiveScene((s) => ({ ...s, cameraAngle: e.target.value }))
                    }
                    className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-cyan-400/60"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs text-zinc-400 mb-1.5">
                      Action &amp; Blocking Description
                    </label>
                    <textarea
                      rows={3}
                      value={activeScene.actionDescription}
                      onChange={(e) =>
                        updateActiveScene((s) => ({ ...s, actionDescription: e.target.value }))
                      }
                      className="w-full bg-zinc-950 border border-white/10 rounded-xl p-3 text-sm text-zinc-100 focus:outline-none focus:border-cyan-400/60"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs text-zinc-400">Visual / Frame Prompt</label>
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard?.writeText(activeScene.visualPrompt);
                          setCopiedPrompt(true);
                          setTimeout(() => setCopiedPrompt(false), 1500);
                        }}
                        className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-100 cursor-pointer"
                      >
                        {copiedPrompt ? <Check className="w-3 h-3 text-cyan-400" /> : <Copy className="w-3 h-3" />}
                        {copiedPrompt ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <textarea
                      rows={3}
                      value={activeScene.visualPrompt}
                      onChange={(e) =>
                        updateActiveScene((s) => ({ ...s, visualPrompt: e.target.value }))
                      }
                      className="w-full bg-zinc-950 border border-white/10 rounded-xl p-3 text-sm text-zinc-200 focus:outline-none focus:border-cyan-400/60"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1.5">Lighting Mood</label>
                      <input
                        type="text"
                        value={activeScene.lightingMood}
                        onChange={(e) =>
                          updateActiveScene((s) => ({ ...s, lightingMood: e.target.value }))
                        }
                        className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-cyan-400/60"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-zinc-400 mb-1.5">Transition &amp; SFX</label>
                      <input
                        type="text"
                        value={`${activeScene.transition}${activeScene.sfxCue ? ` · ${activeScene.sfxCue}` : ''}`}
                        onChange={(e) => {
                          const [trans, ...rest] = e.target.value.split('·');
                          updateActiveScene((s) => ({
                            ...s,
                            transition: (trans ?? '').trim(),
                            sfxCue: rest.join('·').trim(),
                          }));
                        }}
                        className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-cyan-400/60"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs text-zinc-400">Voiceover Narration</label>
                      <button
                        type="button"
                        disabled={isSynthesizingVoice || !activeScene.narration.trim()}
                        onClick={() => void handlePreviewNarrationVoice()}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-white/5 hover:bg-white/10 text-cyan-300 border border-white/10 rounded-lg transition-colors disabled:opacity-45 cursor-pointer whitespace-nowrap shrink-0"
                      >
                        {isSynthesizingVoice ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Volume2 className="w-3 h-3" />
                        )}
                        {isSynthesizingVoice ? 'Synthesizing...' : 'Preview Voice'}
                      </button>
                    </div>
                    <textarea
                      rows={3}
                      value={activeScene.narration}
                      onChange={(e) =>
                        updateActiveScene((s) => ({ ...s, narration: e.target.value }))
                      }
                      className="w-full bg-zinc-950 border border-white/10 rounded-xl p-3 text-sm text-zinc-100 focus:outline-none focus:border-cyan-400/60"
                    />
                  </div>

                  {/* Character Dialogue Lines */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-zinc-400">Character Dialogue</label>
                      <button
                        type="button"
                        onClick={() =>
                          updateActiveScene((s) => ({
                            ...s,
                            dialogueLines: [
                              ...s.dialogueLines,
                              {
                                id: `dl-${Date.now()}`,
                                speaker: characters[0]?.name ?? 'Lead Character',
                                emotion: 'Expressive',
                                line: '',
                              },
                            ],
                          }))
                        }
                        className="inline-flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add Line
                      </button>
                    </div>

                    {activeScene.dialogueLines.length === 0 ? (
                      <div className="bg-zinc-950 border border-white/10 rounded-xl p-3 text-xs text-zinc-500">
                        No character dialogue in this scene (narration &amp; visual beat only).
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {activeScene.dialogueLines.map((dl) => (
                          <div
                            key={dl.id}
                            className="bg-zinc-950 border border-white/10 rounded-xl p-3 space-y-2"
                          >
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={dl.speaker}
                                onChange={(e) =>
                                  updateActiveScene((s) => ({
                                    ...s,
                                    dialogueLines: s.dialogueLines.map((item) =>
                                      item.id === dl.id ? { ...item, speaker: e.target.value } : item
                                    ),
                                  }))
                                }
                                placeholder="Speaker"
                                className="flex-1 bg-[#111116] border border-white/10 rounded-lg px-2.5 py-1 text-xs font-medium text-zinc-100 focus:outline-none focus:border-cyan-400/60"
                              />
                              <input
                                type="text"
                                value={dl.emotion}
                                onChange={(e) =>
                                  updateActiveScene((s) => ({
                                    ...s,
                                    dialogueLines: s.dialogueLines.map((item) =>
                                      item.id === dl.id ? { ...item, emotion: e.target.value } : item
                                    ),
                                  }))
                                }
                                placeholder="Emotion"
                                className="w-28 bg-[#111116] border border-white/10 rounded-lg px-2.5 py-1 text-xs text-zinc-400 focus:outline-none focus:border-cyan-400/60"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  updateActiveScene((s) => ({
                                    ...s,
                                    dialogueLines: s.dialogueLines.filter((item) => item.id !== dl.id),
                                  }))
                                }
                                className="p-1 text-zinc-500 hover:text-red-400 cursor-pointer"
                                title="Remove line"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <input
                              type="text"
                              value={dl.line}
                              onChange={(e) =>
                                updateActiveScene((s) => ({
                                  ...s,
                                  dialogueLines: s.dialogueLines.map((item) =>
                                    item.id === dl.id ? { ...item, line: e.target.value } : item
                                  ),
                                }))
                              }
                              placeholder="Spoken line..."
                              className="w-full bg-[#111116] border border-white/10 rounded-lg px-2.5 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-cyan-400/60"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {(activeScene.attachedAssets?.length ?? 0) > 0 && (
                <div className="pt-4 border-t border-white/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-zinc-300">
                      Attached Stock Media ({activeScene.attachedAssets?.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditorTab('stock')}
                      className="text-xs text-cyan-400 hover:text-cyan-300 cursor-pointer"
                    >
                      Browse More
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {activeScene.attachedAssets?.map((asset) => (
                      <div
                        key={asset.id}
                        className="inline-flex items-center gap-2 px-3 py-1.5 bg-zinc-950 border border-white/10 rounded-lg text-xs text-zinc-300"
                      >
                        <span>{asset.title}</span>
                        <span className="text-zinc-500">· {asset.type}</span>
                        <button
                          type="button"
                          onClick={() => handleAttachStockAsset(asset)}
                          className="text-zinc-500 hover:text-red-400 cursor-pointer"
                          title="Detach asset"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <form
                onSubmit={handleRefineScene}
                className="pt-4 border-t border-white/10 flex flex-col sm:flex-row items-stretch sm:items-center gap-3"
              >
                <input
                  type="text"
                  value={refineInstruction}
                  onChange={(e) => setRefineInstruction(e.target.value)}
                  placeholder="Ask Gemini to revise this scene (e.g., 'Add a dramatic crane pull-back and sharper dialogue')..."
                  className="flex-1 bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-cyan-400/60"
                />
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="submit"
                    disabled={refiningSceneId === activeScene.id || !refineInstruction.trim()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-white/5 hover:bg-white/10 text-zinc-100 border border-white/10 rounded-xl transition-colors disabled:opacity-45 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {refiningSceneId === activeScene.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                    ) : (
                      <Wand2 className="w-3.5 h-3.5 text-cyan-400" />
                    )}
                    Refine Scene
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleGenerateStoryboardForScene(activeScene)}
                    disabled={Boolean(storyboardStatus)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-gradient-to-r from-indigo-500 to-cyan-500 hover:from-indigo-400 hover:to-cyan-400 text-zinc-950 rounded-xl transition-all disabled:opacity-45 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    Sketch Storyboard
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Tab 2: AI-Powered Storyboard Keyframes */}
          {editorTab === 'storyboard' && (
            <div className="p-6 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h4 className="text-sm font-semibold text-zinc-100">
                    AI Storyboard Visual Sequence · {activeProject.style}
                  </h4>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {activeScene.storyboard?.sketchNotes ||
                      'Generate 3 visual keyframes (Opening Frame, Action Beat, Closing Beat) derived from this scene description and visual style.'}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {activeScene.storyboard && activeScene.storyboard.keyframes.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setIsPlayingBeats((p) => !p)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-white/5 hover:bg-white/10 text-zinc-100 border border-white/10 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {isPlayingBeats ? (
                        <>
                          <Pause className="w-3.5 h-3.5 text-cyan-400" />
                          Stop Animatic
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5 text-cyan-400" />
                          Play Beats
                        </>
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={Boolean(storyboardStatus)}
                    onClick={() => void handleGenerateStoryboardForScene(activeScene)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-gradient-to-r from-indigo-500 to-cyan-500 hover:from-indigo-400 hover:to-cyan-400 text-zinc-950 rounded-xl transition-all disabled:opacity-45 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${storyboardStatus ? 'animate-spin' : ''}`} />
                    {activeScene.storyboard ? 'Regenerate Storyboard' : 'Generate AI Storyboard'}
                  </button>
                </div>
              </div>

              {!activeScene.storyboard || activeScene.storyboard.keyframes.length === 0 ? (
                <div className="border border-dashed border-white/15 bg-zinc-950 rounded-xl p-10 text-center space-y-3">
                  <p className="text-sm font-medium text-zinc-100">
                    No storyboard frames sketched for Scene {activeScene.sceneNumber} yet
                  </p>
                  <p className="text-xs text-zinc-400 max-w-md mx-auto">
                    Gemini will read your action description, camera angle, lighting mood, and{' '}
                    {activeProject.style} style to sketch 3 sequential keyframes.
                  </p>
                  <button
                    type="button"
                    disabled={Boolean(storyboardStatus)}
                    onClick={() => void handleGenerateStoryboardForScene(activeScene)}
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-gradient-to-r from-indigo-500 to-cyan-500 hover:from-indigo-400 hover:to-cyan-400 text-zinc-950 rounded-xl transition-all cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Sketch 3 Keyframes with Gemini
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-white/10">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-400">Scene Palette:</span>
                      <div className="flex items-center gap-1.5">
                        {activeScene.storyboard.paletteHexes.map((hex, i) => (
                          <span
                            key={`${hex}-${i}`}
                            title={hex}
                            className="w-5 h-5 rounded border border-white/15"
                            style={{ backgroundColor: hex }}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="text-xs text-zinc-400">
                      Camera: {activeScene.cameraAngle} · {activeScene.lightingMood}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {activeScene.storyboard.keyframes.map((kf, idx) => {
                      const isCurrentBeat = isPlayingBeats && activeBeatIndex === idx;
                      return (
                        <div
                          key={kf.id}
                          onClick={() => setActiveBeatIndex(idx)}
                          className={`bg-zinc-950 border rounded-xl overflow-hidden transition-all cursor-pointer ${
                            isCurrentBeat || activeBeatIndex === idx
                              ? 'border-cyan-400/70 ring-1 ring-cyan-400/20'
                              : 'border-white/10 hover:border-white/25'
                          }`}
                        >
                          <div className="aspect-video bg-[#09090B] border-b border-white/10 overflow-hidden">
                            <img
                              src={svgToDataUrl(kf.svgMarkup)}
                              alt={`${kf.beatLabel}: ${kf.caption}`}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-contain"
                            />
                          </div>
                          <div className="p-4 space-y-1.5">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-semibold text-cyan-300">
                                0{idx + 1}. {kf.beatLabel}
                              </span>
                              <span className="text-zinc-500 font-mono">{kf.cameraMotion}</span>
                            </div>
                            <p className="text-xs text-zinc-300 leading-relaxed">{kf.caption}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab 3: Text-to-Video & Image-to-Video (Free Hugging Face Gradio Spaces) */}
          {editorTab === 'video' && (
            <div className="p-6 space-y-6">
              <div className="bg-zinc-950 border border-white/10 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold text-cyan-300">
                    A.H.I Fast Distilled Video Router · 10–25s Zero-Cost Clips
                  </div>
                  <p className="text-xs text-zinc-400">
                    Prioritizes LTX-Video Distilled &amp; Wan 2.1 Fast (or your private Colab Turbo
                    GPU), translates Camera Motion &amp; Style automatically, and fails over if busy.
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <label className="text-xs text-zinc-400 whitespace-nowrap">Primary Space:</label>
                  <select
                    value={videoSpaceId}
                    onChange={(e) => setVideoSpaceId(e.target.value)}
                    className="bg-[#111116] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs font-mono text-zinc-100 focus:outline-none focus:border-cyan-400/60"
                  >
                    <option value="Lightricks/ltx-video-distilled">
                      Lightricks/ltx-video-distilled (Fast 10–25s)
                    </option>
                    <option value="multimodalart/wan2-1-fast">
                      multimodalart/wan2-1-fast (4-Step Turbo)
                    </option>
                    <option value="alexnasa/ltx-2-TURBO">alexnasa/ltx-2-TURBO (Turbo)</option>
                    <option value="zerogpu-aoti/wan2-2-fp8da-aoti-faster">
                      zerogpu-aoti/wan2-2-fp8da-aoti-faster
                    </option>
                    <option value="zai-org/CogVideoX-5B-Space">zai-org/CogVideoX-5B-Space</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-6 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1 p-1 bg-zinc-950 border border-white/10 rounded-xl w-fit">
                      {(
                        [
                          { id: 'text-to-video', label: 'Text-to-Video' },
                          { id: 'image-to-video', label: 'Image-to-Video' },
                        ] as const
                      ).map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setVideoMode(m.id)}
                          className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                            videoMode === m.id
                              ? 'bg-indigo-500/20 text-cyan-300 border border-indigo-400/40'
                              : 'text-zinc-400 hover:text-zinc-100 border border-transparent'
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>

                    <div className="inline-flex items-center gap-1.5 bg-zinc-950 border border-white/10 rounded-xl px-2.5 py-1.5">
                      <Camera className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <select
                        value={activeScene.cameraMotion ?? cameraMotion}
                        onChange={(e) =>
                          updateActiveScene((s) => ({
                            ...s,
                            cameraMotion: e.target.value as CameraMotion,
                          }))
                        }
                        className="bg-transparent text-xs text-zinc-200 focus:outline-none cursor-pointer"
                      >
                        {CAMERA_MOTIONS.map((cm) => (
                          <option key={cm.id} value={cm.id} className="bg-zinc-950">
                            {cm.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-zinc-400 mb-1.5">
                      Scene Motion Prompt ({activeProject.style} · {activeProject.aspectRatio})
                    </label>
                    <textarea
                      rows={3}
                      value={activeScene.visualPrompt}
                      onChange={(e) =>
                        updateActiveScene((s) => ({ ...s, visualPrompt: e.target.value }))
                      }
                      className="w-full bg-zinc-950 border border-white/10 rounded-xl p-3 text-sm text-zinc-100 focus:outline-none focus:border-cyan-400/60"
                    />
                  </div>

                  {videoMode === 'image-to-video' && (
                    <div className="space-y-3 bg-zinc-950 border border-white/10 rounded-xl p-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-zinc-300">
                          Choose Character Portrait or Reference Image
                        </span>
                        <label className="inline-flex items-center gap-1.5 text-xs text-cyan-400 hover:text-cyan-300 cursor-pointer">
                          <Upload className="w-3.5 h-3.5" />
                          Upload Frame
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            onChange={handleUploadI2vImage}
                            className="hidden"
                          />
                        </label>
                      </div>

                      <div className="grid grid-cols-4 gap-2">
                        {characters
                          .filter((c) => Boolean(c.avatarUrl))
                          .map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => setI2vReferenceImage(c.avatarUrl || '')}
                              className={`rounded-lg overflow-hidden border p-1 text-left transition-all cursor-pointer ${
                                i2vReferenceImage === c.avatarUrl
                                  ? 'border-cyan-400 bg-indigo-500/15'
                                  : 'border-white/10 bg-[#111116] hover:border-white/25'
                              }`}
                            >
                              <img
                                src={c.avatarUrl}
                                alt={c.name}
                                referrerPolicy="no-referrer"
                                className="w-full aspect-square object-cover rounded"
                              />
                              <div className="text-[11px] text-zinc-300 truncate mt-1 px-0.5">
                                {c.name}
                              </div>
                            </button>
                          ))}
                      </div>
                    </div>
                  )}

                  <FreeGpuStatusCard
                    isRunning={isGeneratingVideo}
                    message={videoQueueStatus}
                    progress={videoQueueProgress}
                    activeSpace={activeVideoSpace}
                    attempt={videoAttemptInfo.attempt}
                    totalAttempts={videoAttemptInfo.total}
                    translatedPrompt={videoTranslatedPrompt}
                  />

                  <button
                    type="button"
                    disabled={isGeneratingVideo}
                    onClick={() => void handleGenerateSceneVideoClip()}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-500 to-cyan-500 hover:from-indigo-400 hover:to-cyan-400 disabled:opacity-50 text-zinc-950 text-xs font-semibold rounded-xl transition-all cursor-pointer"
                  >
                    {isGeneratingVideo ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Generating on Shared GPU...
                      </>
                    ) : (
                      <>
                        <Video className="w-4 h-4" />
                        Generate{' '}
                        {videoMode === 'image-to-video' ? 'Image-to-Video' : 'Text-to-Video'} Clip
                      </>
                    )}
                  </button>
                </div>

                <div className="lg:col-span-6">
                  {activeScene.generatedVideoUrl ? (
                    <div className="bg-zinc-950 border border-white/10 rounded-xl overflow-hidden">
                      <video
                        key={activeScene.generatedVideoUrl}
                        src={activeScene.generatedVideoUrl}
                        controls
                        loop
                        className="w-full aspect-video bg-black"
                      />
                      <div className="px-4 py-3 flex items-center justify-between gap-3 border-t border-white/10 text-xs">
                        <span className="text-zinc-400">
                          Generated via{' '}
                          <span className="text-cyan-300 font-mono">
                            {activeScene.generatedVideoSpace || 'Wan-AI/Wan2.1'}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            updateActiveScene((s) => ({
                              ...s,
                              generatedVideoUrl: undefined,
                              generatedVideoSpace: undefined,
                            }))
                          }
                          className="text-red-400 hover:text-red-300 cursor-pointer"
                        >
                          Remove Clip
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="h-full min-h-[260px] bg-zinc-950 border border-dashed border-white/15 rounded-xl p-6 flex flex-col items-center justify-center text-center space-y-2">
                      <Video className="w-7 h-7 text-zinc-600" />
                      <div className="text-sm font-medium text-zinc-100">
                        No generated moving clip attached to Scene {activeScene.sceneNumber}
                      </div>
                      <p className="text-xs text-zinc-400 max-w-sm">
                        Generate a moving clip from your scene prompt or character portrait using
                        free public Hugging Face video Spaces. Attached clips are automatically
                        compiled in FFmpeg MP4 export.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tab 4: Searchable Stock Assets Library */}
          {editorTab === 'stock' && (
            <div className="p-6 space-y-4">
              <div>
                <h4 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                  <ImagePlus className="w-4 h-4 text-cyan-400" />
                  Stock Images, Motion Clips &amp; Music Library
                </h4>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Search and attach backdrops, animated overlays, or a project music track directly
                  to Scene {activeScene.sceneNumber}.
                </p>
              </div>

              <StockAssetsPanel
                activeScene={activeScene}
                selectedMusicId={activeProject.selectedMusicId}
                onAttachToScene={handleAttachStockAsset}
                onSelectMusic={handleSelectProjectMusic}
                compact={false}
              />
            </div>
          )}
        </section>
      )}
    </div>
  );
}
