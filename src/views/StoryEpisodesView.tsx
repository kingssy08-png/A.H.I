import { useEffect, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  Clapperboard,
  Download,
  Film,
  Loader2,
  Lock,
  MessageSquareQuote,
  Music,
  PenTool,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
  Square,
  Unlock,
  Users,
  Video,
  Volume2,
  X,
} from 'lucide-react';
import { AhiCalligraphyStage, AhiGenerationLoader } from '../components/AhiLoaders';
import { MUSIC_PRESETS, STYLE_PRESETS } from '../data/seedData';
import {
  generateHfVideoClip,
  generateScript,
  generateTalkingSceneClip,
  synthesizeVoiceover,
  type TalkingShotAngle,
} from '../services/studioApi';
import type {
  AnimationStyle,
  AspectRatio,
  CameraMotion,
  CharacterProfile,
  FoleySfxId,
  Scene,
  ShowBible,
  ShowTargetAge,
  StoryBeatTag,
  VideoProject,
} from '../types/studio';
import {
  FOLEY_SFX_PRESETS,
  speakWithBrowserTts,
  studioAudio,
} from '../utils/audioEngine';
import {
  compileProjectToMp4WithFfmpeg,
  stitchConversationClipsWithFfmpeg,
} from '../utils/projectExporter';

interface StoryEpisodesViewProps {
  activeProject: VideoProject;
  projects: VideoProject[];
  characters: CharacterProfile[];
  showBible: ShowBible;
  initialStep?: 1 | 2 | 3;
  defaultAspectRatio?: AspectRatio;
  onUpdateProject: (updated: VideoProject) => void;
  onCreateProject: (created: VideoProject) => void;
  onSelectProject: (projectId: string) => void;
  onUpdateShowBible: (bible: ShowBible) => void;
}

const SIMPLE_STYLES: Array<{ label: string; value: AnimationStyle }> = [
  { label: 'Warm Storybook 3D', value: 'Warm Storybook 3D' },
  { label: 'Enchanted Storybook', value: 'Enchanted Storybook' },
  { label: '3D Animation / Kids', value: '3D Pixar-Style Cartoon' },
  { label: 'Anime', value: 'Anime' },
  { label: 'Cinematic Film', value: 'Cinematic Film' },
  { label: '2D Illustration', value: '2D Illustration' },
  { label: 'Music Video', value: 'Music Video' },
  { label: 'Product Ad', value: 'Product Ad' },
  { label: 'Educational', value: 'Educational' },
];

const SIMPLE_SIZES: Array<{ label: string; value: AspectRatio }> = [
  { label: '16:9 YouTube', value: '16:9' },
  { label: '9:16 TikTok/Reels', value: '9:16' },
  { label: '1:1 Square', value: '1:1' },
];

const AGE_GROUPS: ShowTargetAge[] = [
  'Ages 3-5 (Preschool)',
  'Ages 6-8 (Early Kids)',
  'Ages 9-12 (Tween Adventure)',
  'All-Ages Family',
];

const CAMERA_MOTIONS: CameraMotion[] = [
  'Auto',
  'Zoom In',
  'Zoom Out',
  'Pan Left',
  'Pan Right',
  'Orbit',
  'Drone Flyover',
  'Static',
];

const STORY_BEATS: StoryBeatTag[] = [
  'Hook',
  'Adventure',
  'Funny Moment',
  'Heartwarming Lesson',
  'Outro',
];

interface EpisodeTalkLine {
  id: string;
  characterId: string;
  text: string;
  shotAngle: TalkingShotAngle;
}

export function StoryEpisodesView({
  activeProject,
  projects,
  characters,
  showBible,
  initialStep = 1,
  defaultAspectRatio = '16:9',
  onUpdateProject,
  onCreateProject,
  onSelectProject,
  onUpdateShowBible,
}: StoryEpisodesViewProps) {
  const [step, setStep] = useState<1 | 2 | 3>(initialStep);
  const [showBibleOpen, setShowBibleOpen] = useState(false);

  const [topic, setTopic] = useState(activeProject.storyIdea || '');
  const [lengthMode, setLengthMode] = useState<'short' | 'episode'>('episode');
  const [style, setStyle] = useState<AnimationStyle>(
    showBible.lockVisualStyle ? showBible.visualStyle : activeProject.style
  );
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(
    defaultAspectRatio || activeProject.aspectRatio || '16:9'
  );
  const [seasonNum, setSeasonNum] = useState<number>(activeProject.seasonNumber ?? 1);
  const [episodeNum, setEpisodeNum] = useState<number>(
    Math.max(1, (activeProject.episodeNumber ?? projects.length) + 1)
  );
  const [selectedCastIds, setSelectedCastIds] = useState<string[]>(() =>
    characters.slice(0, 3).map((c) => c.id)
  );

  const [isDrafting, setIsDrafting] = useState(false);
  const [clipLoadingId, setClipLoadingId] = useState<string | null>(null);
  const [clipProgress, setClipProgress] = useState(15);
  const [clipStatus, setClipStatus] = useState<string | null>(null);
  const [voiceLoadingId, setVoiceLoadingId] = useState<string | null>(null);

  // Full Episode Sequential Preview
  const [episodePreviewIndex, setEpisodePreviewIndex] = useState<number | null>(null);

  // Embedded Multi-Character Dialogue Composer Modal for a Scene
  const [talkSceneId, setTalkSceneId] = useState<string | null>(null);
  const [talkLines, setTalkLines] = useState<EpisodeTalkLine[]>([]);
  const [talkBgUrl, setTalkBgUrl] = useState<string>(
    activeProject.thumbnailUrl || '/src/assets/images/style_3d_cartoon_1795461025240.jpg'
  );
  const [talkActionPrompt, setTalkActionPrompt] = useState(
    'expressive 3D animated character gestures warmly while speaking, gentle camera drift'
  );
  const [isComposingTalk, setIsComposingTalk] = useState(false);
  const [talkProgress, setTalkProgress] = useState(0);
  const [talkStatus, setTalkStatus] = useState<string | null>(null);

  // Step 3 Audio Mixer & Exporter State
  const [selectedMusicId, setSelectedMusicId] = useState(
    activeProject.selectedMusicId || MUSIC_PRESETS[0].id
  );
  const [playingMusicPreviewId, setPlayingMusicPreviewId] = useState<string | null>(null);
  const [enableAutoDuck, setEnableAutoDuck] = useState(true);
  const [exportResolution, setExportResolution] = useState<'1080p' | '720p'>('1080p');
  const [sigEnabled, setSigEnabled] = useState(true);
  const [sigPlacement, setSigPlacement] = useState<'intro' | 'outro' | 'both'>('intro');
  const [sigText, setSigText] = useState('Kingssy');
  const [sigSubtitle, setSigSubtitle] = useState('A.H.I PRESENTS');
  const [sigReplayKey, setSigReplayKey] = useState(1);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportPhase, setExportPhase] = useState('');
  const [finalMp4Url, setFinalMp4Url] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setStep(initialStep);
    setFinalMp4Url(null);
    setEpisodePreviewIndex(null);
  }, [activeProject.id, initialStep]);

  useEffect(() => {
    if (showBible.lockVisualStyle) {
      setStyle(showBible.visualStyle);
    }
  }, [showBible.lockVisualStyle, showBible.visualStyle]);

  useEffect(() => {
    if (step === 3) {
      setSigReplayKey((k) => k + 1);
    }
  }, [step]);

  useEffect(() => {
    return () => {
      studioAudio.stop();
    };
  }, []);

  const talkModalScene = activeProject.scenes.find((s) => s.id === talkSceneId) ?? null;

  const openTalkComposerForScene = (scene: Scene) => {
    const cast =
      (scene.assignedCharacterIds?.length
        ? characters.filter((c) => scene.assignedCharacterIds?.includes(c.id))
        : characters.slice(0, 2)) || characters;
    const usableCast = cast.length > 0 ? cast : characters;
    const defaultSpeakerId = usableCast[0]?.id ?? '';
    const secondSpeakerId = usableCast[1]?.id ?? defaultSpeakerId;

    const initialLines: EpisodeTalkLine[] =
      scene.dialogueLines.length > 0
        ? scene.dialogueLines.map((dl, idx) => {
            const matchedChar =
              usableCast.find(
                (c) => c.name.toLowerCase() === dl.speaker.trim().toLowerCase()
              ) ?? usableCast[idx % Math.max(1, usableCast.length)];
            return {
              id: `etl-${Date.now()}-${idx}`,
              characterId: matchedChar?.id ?? defaultSpeakerId,
              text: dl.line,
              shotAngle:
                usableCast.length >= 2
                  ? idx % 2 === 1
                    ? 'over-shoulder'
                    : 'two-shot'
                  : 'close-up',
            };
          })
        : [
            {
              id: `etl-${Date.now()}-0`,
              characterId: defaultSpeakerId,
              text: scene.narration || '',
              shotAngle: usableCast.length >= 2 ? 'two-shot' : 'close-up',
            },
            ...(usableCast.length >= 2
              ? [
                  {
                    id: `etl-${Date.now()}-1`,
                    characterId: secondSpeakerId,
                    text: '',
                    shotAngle: 'over-shoulder' as TalkingShotAngle,
                  },
                ]
              : []),
          ];

    setTalkLines(initialLines);
    setTalkBgUrl(
      activeProject.thumbnailUrl || '/src/assets/images/style_3d_cartoon_1795461025240.jpg'
    );
    setTalkActionPrompt(scene.actionDescription || 'expressive warm dialogue acting');
    setTalkSceneId(scene.id);
  };

  const handleComposeTalkScene = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!talkModalScene) return;
    const valid = talkLines.filter((ln) => ln.text.trim().length >= 2);
    if (valid.length === 0) {
      setErrorMsg('Type at least one dialogue line before generating conversation.');
      return;
    }

    setErrorMsg(null);
    setIsComposingTalk(true);
    setTalkProgress(8);
    setTalkStatus('Step 1 · Compositing characters with matching 3D rim-lighting...');

    try {
      const turnClips: string[] = [];
      for (let i = 0; i < valid.length; i++) {
        const line = valid[i];
        const speaker =
          characters.find((c) => c.id === line.characterId) ?? characters[0];
        if (!speaker) continue;
        const coStars = characters
          .filter((c) => c.id !== speaker.id && talkLines.some((tl) => tl.characterId === c.id))
          .slice(0, 2)
          .map((c) => ({
            imageUrl: c.avatarUrl || '/src/assets/images/char_luna_pilot_1795461026794.jpg',
            label: c.name,
          }));

        const prefix =
          valid.length > 1 ? `Turn ${i + 1}/${valid.length} (${speaker.name}) · ` : '';
        const res = await generateTalkingSceneClip(
          {
            characterImageUrl:
              speaker.avatarUrl || '/src/assets/images/char_luna_pilot_1795461026794.jpg',
            characterLabel: speaker.name,
            coStarCharacters: coStars,
            shotAngle: line.shotAngle,
            backgroundImageUrl: talkBgUrl || undefined,
            dialogue: line.text.trim(),
            voicePreset: speaker.voicePreset ?? 'female',
            voiceName: speaker.lockedVoice !== false ? speaker.voiceName : undefined,
            voiceStyleInstruction:
              speaker.lockedVoice !== false ? speaker.voiceStyle : undefined,
            voicePitch: speaker.lockedVoice !== false ? speaker.voicePitch : undefined,
            voiceSpeed: speaker.lockedVoice !== false ? speaker.voiceSpeed : undefined,
            actionPrompt: talkActionPrompt,
            style: activeProject.style,
            aspectRatio: activeProject.aspectRatio,
          },
          (evt) => {
            const pct = typeof evt.progress === 'number' ? evt.progress : 25;
            const scaled =
              valid.length > 1
                ? Math.round(((i + pct / 100) / valid.length) * 88)
                : pct;
            setTalkProgress(Math.max(8, scaled));
            if (evt.message) setTalkStatus(`${prefix}${evt.message}`);
          }
        );
        turnClips.push(res.videoUrl);
      }

      let finalUrl = turnClips[0];
      if (turnClips.length > 1) {
        setTalkStatus(`Stitching ${turnClips.length} shot-reverse-shot turns...`);
        setTalkProgress(92);
        finalUrl = await stitchConversationClipsWithFfmpeg(
          turnClips,
          activeProject.aspectRatio,
          (pct, phase) => {
            setTalkProgress(pct);
            setTalkStatus(phase);
          }
        );
      }

      updateScene(talkModalScene.id, (sc) => ({
        ...sc,
        generatedVideoUrl: finalUrl,
        generatedVideoMode: 'lipsync',
        narration: valid.map((v) => v.text.trim()).join(' '),
        dialogueLines: valid.map((v, idx) => ({
          id: `dl-${Date.now()}-${idx}`,
          speaker: characters.find((c) => c.id === v.characterId)?.name || 'Speaker',
          emotion: 'Expressive',
          line: v.text.trim(),
        })),
      }));

      setTalkSceneId(null);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Conversation scene generation is temporarily busy. Please try again.'
      );
    } finally {
      setIsComposingTalk(false);
      setTalkStatus(null);
      setTalkProgress(0);
    }
  };

  const handleCreateScript = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim()) return;
    setErrorMsg(null);
    setIsDrafting(true);
    try {
      const targetDurationSeconds = lengthMode === 'short' ? 28 : 48;
      const castPool = characters.filter((c) => selectedCastIds.includes(c.id));
      const castForPrompt = castPool.length > 0 ? castPool : characters.slice(0, 3);
      const effectiveStyle = showBible.lockVisualStyle ? showBible.visualStyle : style;

      const generated = await generateScript({
        storyIdea: topic.trim(),
        style: effectiveStyle,
        targetDurationSeconds,
        aspectRatio,
        cameraMotion: 'Zoom In',
        kidsShowMode: true,
        showBible: {
          showTitle: showBible.showTitle,
          visualStyle: showBible.visualStyle,
          lockVisualStyle: showBible.lockVisualStyle,
          worldSetting: showBible.worldSetting,
          targetAgeGroup: showBible.targetAgeGroup,
        },
        characters: castForPrompt.map((c) => ({
          id: c.id,
          name: c.name,
          role: c.role,
          appearancePrompt: c.appearancePrompt,
          voiceArchetype: c.voiceArchetype,
        })),
      });

      const preset = STYLE_PRESETS.find((s) => s.id === effectiveStyle);
      const now = new Date().toISOString();
      const newScenes: Scene[] = (generated.scenes ?? []).map((sc, idx) => ({
        id: `sc-${Date.now()}-${idx}`,
        sceneNumber: idx + 1,
        title: sc.title || `Scene ${idx + 1}`,
        storyBeat: sc.storyBeat || STORY_BEATS[idx % STORY_BEATS.length],
        durationSeconds: Math.max(5, Math.min(8, Number(sc.durationSeconds) || 6)),
        cameraAngle: sc.cameraAngle || 'Medium Shot',
        cameraMotion: sc.cameraMotion || 'Zoom In',
        lightingMood: sc.lightingMood || 'Warm Golden Hour',
        actionDescription: sc.actionDescription || '',
        visualPrompt: sc.visualPrompt || sc.actionDescription || '',
        narration: sc.narration || '',
        assignedCharacterIds: Array.isArray(sc.assignedCharacterIds)
          ? sc.assignedCharacterIds
          : castForPrompt.slice(0, 2).map((c) => c.id),
        dialogueLines: (sc.dialogueLines ?? []).map((dl, dIdx) => ({
          id: `dl-${Date.now()}-${idx}-${dIdx}`,
          speaker: dl.speaker || 'Narrator',
          emotion: dl.emotion || 'Neutral',
          line: dl.line || '',
        })),
        sfxCue: sc.sfxCue || '',
        sfxPresetId: sc.sfxPresetId || 'none',
        transition: sc.transition || 'Cut',
      }));

      const newProj: VideoProject = {
        id: `proj-${Date.now()}`,
        title: generated.title || 'Untitled Episode',
        seriesTitle: showBible.showTitle,
        seasonNumber: seasonNum,
        episodeNumber: episodeNum,
        targetAgeGroup: showBible.targetAgeGroup,
        logline: generated.logline || topic.trim(),
        storyIdea: topic.trim(),
        style: effectiveStyle,
        aspectRatio,
        styleNotes: generated.styleNotes || '',
        suggestedMusicMood: generated.suggestedMusicMood || 'Upbeat',
        selectedMusicId,
        characterIds: castForPrompt.map((c) => c.id),
        scenes: newScenes,
        thumbnailUrl: preset?.previewImage,
        createdAt: now,
        updatedAt: now,
      };

      onCreateProject(newProj);
      setEpisodeNum((n) => n + 1);
      setStep(2);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Could not draft episode scenes right now. Please retry.'
      );
    } finally {
      setIsDrafting(false);
    }
  };

  const updateScene = (sceneId: string, updater: (sc: Scene) => Scene) => {
    onUpdateProject({
      ...activeProject,
      updatedAt: new Date().toISOString(),
      scenes: activeProject.scenes.map((sc) => (sc.id === sceneId ? updater(sc) : sc)),
    });
  };

  const handleGenerateSceneClip = async (scene: Scene) => {
    setErrorMsg(null);
    setClipLoadingId(scene.id);
    setClipProgress(14);
    setClipStatus('Smart Cinematography Director expanding 3D shot prompt...');
    try {
      const assignedChars = characters.filter((c) =>
        scene.assignedCharacterIds?.includes(c.id)
      );
      const refs = assignedChars
        .filter((c) => Boolean(c.avatarUrl))
        .slice(0, 3)
        .map((c) => {
          const descParts = [c.appearancePrompt?.trim()].filter(Boolean);
          if (c.signatureProps?.trim()) {
            descParts.push(`Signature props: ${c.signatureProps.trim()}`);
          }
          if (c.colorPalette && c.colorPalette.length > 0) {
            descParts.push(`Colors: ${c.colorPalette.join(', ')}`);
          }
          return {
            imageUrl: c.avatarUrl!,
            role: 'Character' as const,
            label: c.name,
            description: descParts.join('. '),
          };
        });

      const res = await generateHfVideoClip(
        {
          prompt: scene.visualPrompt || scene.actionDescription || scene.title,
          mode: refs.length > 0 ? 'image-to-video' : 'text-to-video',
          imageDataUrl: refs[0]?.imageUrl,
          referenceImages: refs.length > 0 ? refs : undefined,
          style: activeProject.style,
          aspectRatio: activeProject.aspectRatio,
          cameraMotion: scene.cameraMotion ?? 'Zoom In',
        },
        (evt) => {
          if (typeof evt.progress === 'number') setClipProgress(evt.progress);
          if (evt.message) setClipStatus(evt.message);
        }
      );
      updateScene(scene.id, (sc) => ({
        ...sc,
        generatedVideoUrl: res.videoUrl,
        generatedVideoSpace: res.spaceUsed,
        generatedVideoMode: res.mode,
      }));
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : `Could not generate video clip for Scene ${scene.sceneNumber}.`
      );
    } finally {
      setClipLoadingId(null);
      setClipStatus(null);
      setClipProgress(0);
    }
  };

  const handleGenerateSceneVoice = async (scene: Scene) => {
    const line = scene.narration || scene.dialogueLines[0]?.line || scene.actionDescription;
    if (!line.trim()) return;
    setErrorMsg(null);
    setVoiceLoadingId(scene.id);
    const leadChar = characters.find((c) => scene.assignedCharacterIds?.includes(c.id));
    const voiceToUse =
      leadChar && leadChar.lockedVoice !== false
        ? leadChar.voiceName
        : scene.voiceName ?? 'Kore';
    const voiceStyle =
      leadChar && leadChar.lockedVoice !== false
        ? leadChar.voiceStyle
        : 'Warm animated storyteller voice';

    try {
      const res = await synthesizeVoiceover({
        text: line.trim(),
        voiceName: voiceToUse,
        styleInstruction: voiceStyle,
      });
      updateScene(scene.id, (sc) => ({
        ...sc,
        voiceAudioBase64: res.audioBase64,
        voiceName: res.voiceName,
      }));
      const audio = new Audio(`data:audio/wav;base64,${res.audioBase64}`);
      void audio.play();
    } catch {
      speakWithBrowserTts(line, {
        rate: leadChar?.voiceSpeed ?? 1,
        pitch: leadChar?.voicePitch ?? 1,
      });
    } finally {
      setVoiceLoadingId(null);
    }
  };

  const handleCombineAndExport = async () => {
    setErrorMsg(null);
    setIsExporting(true);
    setExportProgress(5);
    setFinalMp4Url(null);
    try {
      const mp4 = await compileProjectToMp4WithFfmpeg(activeProject, {
        includeAudio: true,
        musicId: selectedMusicId,
        resolution: exportResolution,
        enableAutoDuck,
        includeFoley: true,
        signatureCard: {
          enabled: sigEnabled,
          placement: sigPlacement,
          signatureText: sigText.trim() || showBible.showTitle || 'A.H.I',
          subtitleText: sigSubtitle.trim(),
          durationSeconds: 2.6,
        },
        onProgress: (pct, phase) => {
          setExportProgress(pct);
          setExportPhase(phase);
        },
      });
      setFinalMp4Url(mp4);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Could not combine episode MP4. Please try again.'
      );
    } finally {
      setIsExporting(false);
    }
  };

  const readyClipsCount = activeProject.scenes.filter((s) => Boolean(s.generatedVideoUrl)).length;
  const readyVoicesCount = activeProject.scenes.filter(
    (s) => Boolean(s.voiceAudioBase64) || s.generatedVideoMode === 'lipsync'
  ).length;
  const readyScenesWithClips = activeProject.scenes.filter((s) => Boolean(s.generatedVideoUrl));
  const previewScene =
    episodePreviewIndex !== null ? readyScenesWithClips[episodePreviewIndex] ?? null : null;

  return (
    <div className="max-w-5xl mx-auto space-y-5 pb-20">
      {/* Show Bible Memory + Series Header */}
      <div className="bg-[rgba(17,22,33,0.72)] backdrop-blur-2xl border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] rounded-2xl overflow-hidden">
        <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-[#2DD4BF]/15 border border-[#2DD4BF]/40 flex items-center justify-center shrink-0">
              <BookOpen className="w-4 h-4 text-[#2DD4BF]" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-display font-bold text-[#F8FAFC] truncate">
                  Show Bible: {showBible.showTitle}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-[#2DD4BF]/15 border border-[#2DD4BF]/35 text-[10px] font-semibold text-[#2DD4BF]">
                  {showBible.targetAgeGroup}
                </span>
                {showBible.lockVisualStyle && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] text-[#94A3B8]">
                    <Lock className="w-2.5 h-2.5 text-[#2DD4BF]" />
                    {showBible.visualStyle}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[#94A3B8] truncate">{showBible.worldSetting}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <select
              value={activeProject.id}
              onChange={(e) => onSelectProject(e.target.value)}
              aria-label="Switch Episode"
              className="bg-[#07090E]/80 border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-[#F8FAFC] focus:outline-none focus:border-[#2DD4BF]/50 max-w-[190px]"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id} className="bg-[#0B0F18]">
                  S{p.seasonNumber ?? 1}E{p.episodeNumber ?? 1} · {p.title}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => {
                setTopic('');
                setStep(1);
              }}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#2DD4BF] hover:bg-[#34D399] text-[#07090E] text-xs font-bold cursor-pointer transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              New Episode
            </button>

            <button
              type="button"
              onClick={() => setShowBibleOpen((o) => !o)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-[#F8FAFC] cursor-pointer transition-colors"
            >
              Edit Show Bible
              {showBibleOpen ? (
                <ChevronUp className="w-3.5 h-3.5 text-[#2DD4BF]" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-[#2DD4BF]" />
              )}
            </button>
          </div>
        </div>

        {showBibleOpen && (
          <div className="px-4 pb-4 pt-3 border-t border-white/10 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs bg-[#07090E]/45">
            <div className="space-y-1">
              <label className="block text-[11px] font-medium text-[#94A3B8]">
                Series / Show Title
              </label>
              <input
                type="text"
                value={showBible.showTitle}
                onChange={(e) =>
                  onUpdateShowBible({ ...showBible, showTitle: e.target.value })
                }
                className="w-full bg-[#07090E]/80 border border-white/10 focus:border-[#2DD4BF]/60 rounded-xl px-3 py-2 text-xs text-[#F8FAFC] focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-[#94A3B8]">
                  Target Age Group
                </label>
                <select
                  value={showBible.targetAgeGroup}
                  onChange={(e) =>
                    onUpdateShowBible({
                      ...showBible,
                      targetAgeGroup: e.target.value as ShowTargetAge,
                    })
                  }
                  className="w-full bg-[#07090E]/80 border border-white/10 rounded-xl px-2.5 py-2 text-xs text-[#F8FAFC] focus:outline-none focus:border-[#2DD4BF]/50"
                >
                  {AGE_GROUPS.map((age) => (
                    <option key={age} value={age} className="bg-[#0B0F18]">
                      {age}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-medium text-[#94A3B8]">Show Style</label>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateShowBible({
                        ...showBible,
                        lockVisualStyle: !showBible.lockVisualStyle,
                      })
                    }
                    className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#2DD4BF] cursor-pointer"
                  >
                    {showBible.lockVisualStyle ? (
                      <>
                        <Lock className="w-2.5 h-2.5" />
                        Locked
                      </>
                    ) : (
                      <>
                        <Unlock className="w-2.5 h-2.5 text-[#94A3B8]" />
                        Unlocked
                      </>
                    )}
                  </button>
                </div>
                <select
                  value={showBible.visualStyle}
                  onChange={(e) =>
                    onUpdateShowBible({
                      ...showBible,
                      visualStyle: e.target.value as AnimationStyle,
                    })
                  }
                  className="w-full bg-[#07090E]/80 border border-white/10 rounded-xl px-2.5 py-2 text-xs text-[#F8FAFC] focus:outline-none focus:border-[#2DD4BF]/50"
                >
                  {SIMPLE_STYLES.map((s) => (
                    <option key={s.value} value={s.value} className="bg-[#0B0F18]">
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="md:col-span-2 space-y-1">
              <label className="block text-[11px] font-medium text-[#94A3B8]">
                Persistent World Setting &amp; Series Rules (Remembered by AI Showrunner)
              </label>
              <textarea
                rows={2}
                value={showBible.worldSetting}
                onChange={(e) =>
                  onUpdateShowBible({ ...showBible, worldSetting: e.target.value })
                }
                placeholder="Describe recurring locations, cozy rules, tone, and magic elements..."
                className="w-full bg-[#07090E]/80 border border-white/10 focus:border-[#2DD4BF]/60 rounded-xl p-2.5 text-xs text-[#F8FAFC] focus:outline-none"
              />
            </div>
          </div>
        )}
      </div>

      {/* Guided 3-Step Bar */}
      <div className="bg-[rgba(17,22,33,0.72)] backdrop-blur-2xl border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] rounded-2xl p-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              { num: 1, label: '1. AI Showrunner' },
              { num: 2, label: '2. Cinema Timeline & Shots' },
              { num: 3, label: '3. Foley Mixer & 1080p Export' },
            ] as const
          ).map((item) => {
            const active = step === item.num;
            const done = step > item.num;
            return (
              <button
                key={item.num}
                type="button"
                onClick={() => setStep(item.num)}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  active
                    ? 'bg-[#2DD4BF] text-[#07090E] shadow-[0_0_18px_rgba(45,212,191,0.22)]'
                    : done
                    ? 'bg-white/10 text-[#F8FAFC]'
                    : 'bg-transparent text-[#94A3B8] hover:text-[#F8FAFC]'
                }`}
              >
                {done && <Check className="w-3.5 h-3.5 text-[#2DD4BF]" />}
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        <div className="text-xs text-[#94A3B8] px-2 flex items-center gap-2 truncate max-w-sm">
          <span className="px-2 py-0.5 rounded bg-[#07090E]/80 border border-white/10 text-[10px] font-bold text-[#2DD4BF] tabular-nums">
            S{activeProject.seasonNumber ?? 1} · E{activeProject.episodeNumber ?? 1}
          </span>
          <span className="text-[#F8FAFC] font-medium truncate">{activeProject.title}</span>
        </div>
      </div>

      {errorMsg && (
        <div className="bg-red-950/50 border border-red-500/40 text-red-200 rounded-2xl px-4 py-3 text-xs flex items-center justify-between gap-3 backdrop-blur-xl">
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

      {/* STEP 1: AI Showrunner & Episode Architect */}
      {step === 1 && (
        <form
          onSubmit={(e) => void handleCreateScript(e)}
          className="bg-[rgba(17,22,33,0.72)] backdrop-blur-2xl border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] rounded-2xl p-6 sm:p-8 space-y-6"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <h1 className="text-xl sm:text-2xl font-display font-bold text-[#F8FAFC]">
                AI Showrunner &amp; Episode Architect
              </h1>
              <p className="text-xs text-[#94A3B8]">
                Gemini structures your idea into a 5-beat kids&apos; show arc (Hook, Adventure, Funny
                Moment, Heartwarming Lesson, Outro) split into 5–8s shots.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0 text-xs">
              <label className="inline-flex items-center gap-1.5 bg-[#07090E]/75 border border-white/10 rounded-xl px-2.5 py-1.5">
                <span className="text-[#64748B]">S</span>
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={seasonNum}
                  onChange={(e) => setSeasonNum(Math.max(1, Number(e.target.value) || 1))}
                  className="w-10 bg-transparent text-[#F8FAFC] font-bold focus:outline-none tabular-nums"
                />
              </label>
              <label className="inline-flex items-center gap-1.5 bg-[#07090E]/75 border border-white/10 rounded-xl px-2.5 py-1.5">
                <span className="text-[#64748B]">Ep</span>
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={episodeNum}
                  onChange={(e) => setEpisodeNum(Math.max(1, Number(e.target.value) || 1))}
                  className="w-10 bg-transparent text-[#F8FAFC] font-bold focus:outline-none tabular-nums"
                />
              </label>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-medium text-[#F8FAFC]">Episode Story Idea</label>
            <textarea
              rows={3}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g., Milo the fox builds a glowing lantern glider to help lost baby fireflies find their way home..."
              className="w-full bg-[#07090E]/75 border border-white/10 focus:border-[#2DD4BF]/60 rounded-2xl p-4 text-sm text-[#F8FAFC] placeholder-[#64748B] focus:outline-none"
            />
            <div className="flex flex-wrap gap-2 pt-1">
              {[
                'Milo the Fox invents a rainbow-powered bubble submarine to rescue a shy sea turtle',
                'Pip and Professor Barnaby discover a hidden library inside a giant hollow oak tree',
                'The rooftop workshop crew bakes a gravity-defying cloud cake for the Moon Festival',
              ].map((sample) => (
                <button
                  key={sample}
                  type="button"
                  onClick={() => setTopic(sample)}
                  className="text-[11px] px-3 py-1 rounded-full bg-[#07090E]/75 hover:border-[#2DD4BF]/40 border border-white/10 text-[#94A3B8] hover:text-[#F8FAFC] cursor-pointer transition-colors"
                >
                  {sample}
                </button>
              ))}
            </div>
          </div>

          {/* Episode Cast Picker */}
          {characters.length > 0 && (
            <div className="space-y-2">
              <label className="block text-xs font-medium text-[#F8FAFC] flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-[#2DD4BF]" />
                Assign Episode Cast (with Locked Voices)
              </label>
              <div className="flex flex-wrap gap-2">
                {characters.map((c) => {
                  const selected = selectedCastIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() =>
                        setSelectedCastIds((prev) =>
                          prev.includes(c.id) ? prev.filter((id) => id !== c.id) : [...prev, c.id]
                        )
                      }
                      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs transition-all cursor-pointer ${
                        selected
                          ? 'bg-[#2DD4BF]/15 border-[#2DD4BF]/60 text-[#F8FAFC]'
                          : 'bg-[#07090E]/75 border-white/10 text-[#94A3B8] hover:border-white/25'
                      }`}
                    >
                      <img
                        src={c.avatarUrl || '/src/assets/images/char_luna_pilot_1795461026794.jpg'}
                        alt={c.name}
                        className="w-5 h-5 rounded-md object-cover"
                      />
                      <span className="font-medium">{c.name}</span>
                      {selected && <Check className="w-3 h-3 text-[#2DD4BF]" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="block text-xs font-medium text-[#F8FAFC]">Episode Length</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setLengthMode('short')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    lengthMode === 'short'
                      ? 'bg-[#2DD4BF]/15 border-[#2DD4BF]/60 text-[#F8FAFC]'
                      : 'bg-[#07090E]/75 border-white/10 hover:border-[#2DD4BF]/35 text-[#94A3B8]'
                  }`}
                >
                  <div className="text-xs font-semibold">Mini Short</div>
                  <div className="text-[11px] opacity-80 mt-0.5">5 Beats · ~30s</div>
                </button>
                <button
                  type="button"
                  onClick={() => setLengthMode('episode')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    lengthMode === 'episode'
                      ? 'bg-[#2DD4BF]/15 border-[#2DD4BF]/60 text-[#F8FAFC]'
                      : 'bg-[#07090E]/75 border-white/10 hover:border-[#2DD4BF]/35 text-[#94A3B8]'
                  }`}
                >
                  <div className="text-xs font-semibold">Show Episode</div>
                  <div className="text-[11px] opacity-80 mt-0.5">7 Shots · ~50s</div>
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-[#F8FAFC]">
                Visual Style {showBible.lockVisualStyle ? '(Locked by Bible)' : ''}
              </label>
              <select
                value={showBible.lockVisualStyle ? showBible.visualStyle : style}
                disabled={showBible.lockVisualStyle}
                onChange={(e) => setStyle(e.target.value as AnimationStyle)}
                className="w-full bg-[#07090E]/75 border border-white/10 disabled:opacity-70 rounded-xl px-3.5 py-3 text-xs text-[#F8FAFC] focus:outline-none focus:border-[#2DD4BF]/60"
              >
                {SIMPLE_STYLES.map((s) => (
                  <option key={s.value} value={s.value} className="bg-[#0B0F18]">
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-[#F8FAFC]">Video Size</label>
              <select
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
                className="w-full bg-[#07090E]/75 border border-white/10 rounded-xl px-3.5 py-3 text-xs text-[#F8FAFC] focus:outline-none focus:border-[#2DD4BF]/60"
              >
                {SIMPLE_SIZES.map((sz) => (
                  <option key={sz.value} value={sz.value} className="bg-[#0B0F18]">
                    {sz.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="text-xs text-[#94A3B8] hover:text-[#F8FAFC] cursor-pointer"
            >
              Or edit active episode shots ({activeProject.scenes.length}) →
            </button>

            <button
              type="submit"
              disabled={isDrafting || !topic.trim()}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#2DD4BF] hover:bg-[#34D399] disabled:opacity-45 text-[#07090E] text-xs font-bold shadow-[0_0_22px_rgba(45,212,191,0.22)] cursor-pointer transition-colors"
            >
              {isDrafting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Drafting 5-Beat Episode...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Draft 5-Beat Episode
                </>
              )}
            </button>
          </div>

          {isDrafting && (
            <div className="pt-2 flex justify-center">
              <AhiGenerationLoader
                mode="episode"
                progress={62}
                statusMessage="AI Showrunner building 5-beat arc, casting characters & assigning Foley..."
              />
            </div>
          )}
        </form>
      )}

      {/* STEP 2: Cinema Timeline + Shot Cards + Multi-Character Dialogue Composer */}
      {step === 2 && (
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-display font-bold text-[#F8FAFC]">
                S{activeProject.seasonNumber ?? 1} · E{activeProject.episodeNumber ?? 1} —{' '}
                {activeProject.title}
              </h2>
              <p className="text-xs text-[#94A3B8]">
                {activeProject.logline ||
                  'Generate shots, compose multi-character dialogue, or regenerate any single shot anytime.'}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {readyScenesWithClips.length > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setEpisodePreviewIndex(episodePreviewIndex !== null ? null : 0)
                  }
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-xs font-semibold text-[#F8FAFC] cursor-pointer transition-colors"
                >
                  {episodePreviewIndex !== null ? (
                    <>
                      <Square className="w-3.5 h-3.5 text-[#2DD4BF]" />
                      Close Preview
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 text-[#2DD4BF]" />
                      Preview Episode ({readyScenesWithClips.length})
                    </>
                  )}
                </button>
              )}

              <button
                type="button"
                onClick={() => setStep(3)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#2DD4BF] hover:bg-[#34D399] text-[#07090E] text-xs font-bold shadow-[0_0_18px_rgba(45,212,191,0.22)] cursor-pointer transition-colors"
              >
                Foley Mixer &amp; Export
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Interactive Cinema Timeline Strip */}
          <div className="bg-[rgba(17,22,33,0.72)] backdrop-blur-2xl border border-white/10 rounded-2xl p-3 space-y-2.5">
            <div className="flex items-center justify-between text-[11px] text-[#94A3B8] px-1">
              <span className="font-semibold text-[#F8FAFC] flex items-center gap-1.5">
                <Clapperboard className="w-3.5 h-3.5 text-[#2DD4BF]" />
                Cinema Shot Timeline
              </span>
              <span className="tabular-nums">
                {activeProject.scenes.reduce((acc, s) => acc + s.durationSeconds, 0)}s Total ·{' '}
                {readyClipsCount}/{activeProject.scenes.length} Rendered
              </span>
            </div>

            <div className="flex items-stretch gap-2 overflow-x-auto pb-1">
              {activeProject.scenes.map((sc) => {
                const isReady = Boolean(sc.generatedVideoUrl);
                return (
                  <div
                    key={sc.id}
                    className={`min-w-[140px] flex-1 rounded-xl p-2.5 border transition-all ${
                      isReady
                        ? 'bg-[#2DD4BF]/10 border-[#2DD4BF]/45'
                        : 'bg-[#07090E]/75 border-white/10'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 text-[10px] font-bold">
                      <span className="text-[#2DD4BF]">Shot {sc.sceneNumber}</span>
                      <span className="text-[#94A3B8] tabular-nums">{sc.durationSeconds}s</span>
                    </div>
                    <div className="text-[11px] font-medium text-[#F8FAFC] truncate mt-0.5">
                      {sc.title}
                    </div>
                    <div className="text-[10px] text-[#64748B] truncate mt-0.5">
                      {sc.storyBeat || 'Story Beat'} ·{' '}
                      {isReady ? 'Ready' : 'Pending'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Sequential Full Episode Preview Player */}
          {previewScene && previewScene.generatedVideoUrl && (
            <div className="bg-[rgba(17,22,33,0.85)] backdrop-blur-2xl border border-[#2DD4BF]/40 rounded-2xl p-4 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#2DD4BF]">
                  Playing Shot {previewScene.sceneNumber}: {previewScene.title} (
                  {(episodePreviewIndex ?? 0) + 1}/{readyScenesWithClips.length})
                </span>
                <button
                  type="button"
                  onClick={() => setEpisodePreviewIndex(null)}
                  className="text-[#94A3B8] hover:text-[#F8FAFC] cursor-pointer"
                >
                  Close Player
                </button>
              </div>
              <video
                key={previewScene.id}
                src={previewScene.generatedVideoUrl}
                controls
                autoPlay
                onEnded={() => {
                  const next = (episodePreviewIndex ?? 0) + 1;
                  if (next < readyScenesWithClips.length) {
                    setEpisodePreviewIndex(next);
                  } else {
                    setEpisodePreviewIndex(0);
                  }
                }}
                className="w-full max-h-[420px] rounded-xl bg-black border border-white/10"
              />
            </div>
          )}

          {/* Scene Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeProject.scenes.map((scene) => {
              const isClipBusy = clipLoadingId === scene.id;
              const isVoiceBusy = voiceLoadingId === scene.id;
              const assignedChars = characters.filter((c) =>
                scene.assignedCharacterIds?.includes(c.id)
              );

              return (
                <div
                  key={scene.id}
                  className="bg-[rgba(17,22,33,0.72)] backdrop-blur-2xl border border-white/10 hover:border-[#2DD4BF]/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] hover:shadow-[0_0_24px_rgba(45,212,191,0.10)] rounded-2xl p-5 flex flex-col justify-between space-y-4 transition-all"
                >
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="px-2.5 py-0.5 rounded-full bg-[#2DD4BF]/15 border border-[#2DD4BF]/35 text-[#2DD4BF] text-[11px] font-semibold">
                          Shot {scene.sceneNumber} · {scene.durationSeconds}s
                        </span>
                        {scene.storyBeat && (
                          <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] font-medium text-[#F8FAFC]">
                            {scene.storyBeat}
                          </span>
                        )}
                      </div>
                      {scene.generatedVideoUrl && (
                        <span className="text-[11px] text-[#34D399] font-medium">
                          {scene.generatedVideoMode === 'lipsync' ? 'Talking Clip Ready' : 'Clip Ready'}
                        </span>
                      )}
                    </div>

                    <input
                      type="text"
                      value={scene.title}
                      onChange={(e) =>
                        updateScene(scene.id, (sc) => ({ ...sc, title: e.target.value }))
                      }
                      className="w-full bg-transparent text-sm font-display font-semibold text-[#F8FAFC] border-b border-white/10 pb-1.5 focus:outline-none focus:border-[#2DD4BF]/60"
                    />

                    {/* Assigned Cast & Camera Motion & Foley SFX */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-[#64748B] mb-1">
                          Camera Motion
                        </label>
                        <select
                          value={scene.cameraMotion || 'Zoom In'}
                          onChange={(e) =>
                            updateScene(scene.id, (sc) => ({
                              ...sc,
                              cameraMotion: e.target.value as CameraMotion,
                            }))
                          }
                          className="w-full bg-[#07090E]/75 border border-white/10 rounded-lg px-2 py-1.5 text-[11px] text-[#F8FAFC] focus:outline-none focus:border-[#2DD4BF]/50"
                        >
                          {CAMERA_MOTIONS.map((m) => (
                            <option key={m} value={m} className="bg-[#0B0F18]">
                              {m}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] text-[#64748B] mb-1">
                          Foley SFX Cue
                        </label>
                        <div className="flex items-center gap-1">
                          <select
                            value={scene.sfxPresetId || 'none'}
                            onChange={(e) => {
                              const nextSfx = e.target.value as FoleySfxId;
                              updateScene(scene.id, (sc) => ({ ...sc, sfxPresetId: nextSfx }));
                            }}
                            className="flex-1 min-w-0 bg-[#07090E]/75 border border-white/10 rounded-lg px-2 py-1.5 text-[11px] text-[#F8FAFC] focus:outline-none focus:border-[#2DD4BF]/50"
                          >
                            {FOLEY_SFX_PRESETS.map((sfx) => (
                              <option key={sfx.id} value={sfx.id} className="bg-[#0B0F18]">
                                {sfx.label}
                              </option>
                            ))}
                          </select>
                          {scene.sfxPresetId && scene.sfxPresetId !== 'none' && (
                            <button
                              type="button"
                              onClick={() => studioAudio.playFoleySfx(scene.sfxPresetId!)}
                              className="p-1.5 rounded-lg bg-[#07090E]/80 border border-white/10 hover:border-[#2DD4BF]/50 text-[#2DD4BF] cursor-pointer"
                              title="Play Foley SFX"
                            >
                              <Volume2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {assignedChars.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {assignedChars.map((c) => (
                          <span
                            key={c.id}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#07090E]/75 border border-white/10 text-[10px] text-[#94A3B8]"
                          >
                            <img
                              src={c.avatarUrl || '/src/assets/images/char_luna_pilot_1795461026794.jpg'}
                              alt={c.name}
                              className="w-3.5 h-3.5 rounded-full object-cover"
                            />
                            {c.name}
                          </span>
                        ))}
                      </div>
                    )}

                    <div>
                      <label className="block text-[11px] text-[#64748B] mb-1">
                        3D Cinema Action &amp; Visual Prompt
                      </label>
                      <textarea
                        rows={3}
                        value={scene.visualPrompt}
                        onChange={(e) =>
                          updateScene(scene.id, (sc) => ({
                            ...sc,
                            visualPrompt: e.target.value,
                            actionDescription: e.target.value,
                          }))
                        }
                        className="w-full bg-[#07090E]/75 border border-white/10 rounded-xl p-2.5 text-xs text-[#F8FAFC] focus:outline-none focus:border-[#2DD4BF]/60"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] text-[#64748B] mb-1">
                        Narration / Dialogue Line
                      </label>
                      <textarea
                        rows={2}
                        value={scene.narration}
                        onChange={(e) =>
                          updateScene(scene.id, (sc) => ({ ...sc, narration: e.target.value }))
                        }
                        placeholder="Optional narrator or character line..."
                        className="w-full bg-[#07090E]/75 border border-white/10 rounded-xl p-2.5 text-xs text-[#F8FAFC] placeholder-[#64748B] focus:outline-none focus:border-[#2DD4BF]/60"
                      />
                    </div>

                    {isClipBusy ? (
                      <AhiGenerationLoader
                        mode="video"
                        progress={clipProgress}
                        statusMessage={clipStatus}
                        compact
                      />
                    ) : (
                      scene.generatedVideoUrl && (
                        <video
                          key={scene.generatedVideoUrl}
                          src={scene.generatedVideoUrl}
                          controls
                          loop={scene.generatedVideoMode !== 'lipsync'}
                          className="w-full aspect-video rounded-xl bg-black border border-white/10"
                        />
                      )
                    )}
                  </div>

                  <div className="space-y-2 pt-1">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={isClipBusy}
                        onClick={() => void handleGenerateSceneClip(scene)}
                        className="inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-[#2DD4BF] hover:bg-[#34D399] disabled:opacity-45 text-[#07090E] text-xs font-bold cursor-pointer transition-colors"
                      >
                        {isClipBusy ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Rendering...
                          </>
                        ) : scene.generatedVideoUrl ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5" />
                            Regenerate Shot
                          </>
                        ) : (
                          <>
                            <Film className="w-3.5 h-3.5" />
                            Render Shot
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        disabled={isVoiceBusy || !scene.narration.trim()}
                        onClick={() => void handleGenerateSceneVoice(scene)}
                        className="inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-40 border border-white/10 hover:border-[#2DD4BF]/40 text-[#F8FAFC] text-xs font-medium cursor-pointer transition-colors"
                      >
                        {isVoiceBusy ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#2DD4BF]" />
                            Voicing...
                          </>
                        ) : (
                          <>
                            <Volume2 className="w-3.5 h-3.5 text-[#2DD4BF]" />
                            {scene.voiceAudioBase64 ? 'Replay Voice' : 'Lock Voiceover'}
                          </>
                        )}
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => openTalkComposerForScene(scene)}
                      className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-[#07090E]/75 hover:border-[#2DD4BF]/50 border border-white/10 text-[11px] font-semibold text-[#2DD4BF] cursor-pointer transition-colors"
                    >
                      <MessageSquareQuote className="w-3.5 h-3.5" />
                      Compose Multi-Character Dialogue Scene (Lip-Synced)
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Embedded Multi-Character Dialogue Composer Modal for Shot */}
      {talkModalScene && (
        <div
          className="fixed inset-0 z-50 bg-[#07090E]/85 backdrop-blur-md flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isComposingTalk) setTalkSceneId(null);
          }}
        >
          <div className="w-full max-w-2xl bg-[rgba(17,22,33,0.94)] backdrop-blur-2xl border border-white/10 rounded-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_24px_64px_rgba(0,0,0,0.75)] overflow-hidden">
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-display font-bold text-[#F8FAFC]">
                  Multi-Character Dialogue Composer · Shot {talkModalScene.sceneNumber}
                </h3>
                <p className="text-[11px] text-[#94A3B8]">
                  Uses each character&apos;s Locked Voice Profile &amp; automatic shot-reverse-shot
                  framing.
                </p>
              </div>
              <button
                type="button"
                disabled={isComposingTalk}
                onClick={() => setTalkSceneId(null)}
                className="p-1.5 rounded-lg text-[#94A3B8] hover:text-[#F8FAFC] cursor-pointer"
                aria-label="Close composer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => void handleComposeTalkScene(e)}
              className="p-6 space-y-4 max-h-[82vh] overflow-y-auto text-xs"
            >
              {isComposingTalk ? (
                <div className="py-6 flex justify-center">
                  <AhiGenerationLoader
                    mode="talking"
                    progress={talkProgress}
                    statusMessage={talkStatus}
                  />
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <label className="block font-medium text-[#F8FAFC]">
                      Acting &amp; 3D Lighting Direction
                    </label>
                    <input
                      type="text"
                      value={talkActionPrompt}
                      onChange={(e) => setTalkActionPrompt(e.target.value)}
                      className="w-full bg-[#07090E]/80 border border-white/10 focus:border-[#2DD4BF]/60 rounded-xl px-3.5 py-2 text-xs text-[#F8FAFC] focus:outline-none"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[#F8FAFC]">
                        Dialogue Script ({talkLines.length} Turns)
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const last = talkLines[talkLines.length - 1];
                          const idx = characters.findIndex((c) => c.id === last?.characterId);
                          const nextChar =
                            characters[(idx + 1) % Math.max(1, characters.length)];
                          setTalkLines((prev) => [
                            ...prev,
                            {
                              id: `etl-${Date.now()}`,
                              characterId: nextChar?.id ?? '',
                              text: '',
                              shotAngle: prev.length % 2 === 1 ? 'over-shoulder' : 'close-up',
                            },
                          ]);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#2DD4BF] text-[#07090E] text-[11px] font-bold cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        Add Line
                      </button>
                    </div>

                    {talkLines.map((ln, idx) => (
                      <div
                        key={ln.id}
                        className="bg-[#07090E]/75 border border-white/10 rounded-xl p-3 space-y-2"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-[#2DD4BF]/15 text-[#2DD4BF] font-bold tabular-nums">
                            #{idx + 1}
                          </span>
                          <select
                            value={ln.characterId}
                            onChange={(e) =>
                              setTalkLines((prev) =>
                                prev.map((item) =>
                                  item.id === ln.id
                                    ? { ...item, characterId: e.target.value }
                                    : item
                                )
                              )
                            }
                            className="bg-[rgba(17,22,33,0.9)] border border-white/10 rounded-lg px-2.5 py-1 text-xs text-[#F8FAFC]"
                          >
                            {characters.map((c) => (
                              <option key={c.id} value={c.id} className="bg-[#0B0F18]">
                                {c.name} ({c.voiceArchetype || c.voiceName})
                              </option>
                            ))}
                          </select>

                          <select
                            value={ln.shotAngle}
                            onChange={(e) =>
                              setTalkLines((prev) =>
                                prev.map((item) =>
                                  item.id === ln.id
                                    ? { ...item, shotAngle: e.target.value as TalkingShotAngle }
                                    : item
                                )
                              )
                            }
                            className="bg-[rgba(17,22,33,0.9)] border border-white/10 rounded-lg px-2.5 py-1 text-xs text-[#94A3B8]"
                          >
                            <option value="two-shot" className="bg-[#0B0F18]">
                              Two-Shot Together
                            </option>
                            <option value="close-up" className="bg-[#0B0F18]">
                              Close-Up on Speaker
                            </option>
                            <option value="over-shoulder" className="bg-[#0B0F18]">
                              Over-the-Shoulder
                            </option>
                          </select>

                          {talkLines.length > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                setTalkLines((prev) => prev.filter((item) => item.id !== ln.id))
                              }
                              className="ml-auto text-[#64748B] hover:text-red-400 cursor-pointer"
                            >
                              Remove
                            </button>
                          )}
                        </div>

                        <input
                          type="text"
                          value={ln.text}
                          onChange={(e) =>
                            setTalkLines((prev) =>
                              prev.map((item) =>
                                item.id === ln.id ? { ...item, text: e.target.value } : item
                              )
                            )
                          }
                          placeholder="What does this character say?"
                          className="w-full bg-[rgba(17,22,33,0.9)] border border-white/10 focus:border-[#2DD4BF]/60 rounded-lg px-3 py-1.5 text-xs text-[#F8FAFC] focus:outline-none"
                        />
                      </div>
                    ))}
                  </div>
                </>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={isComposingTalk}
                  onClick={() => setTalkSceneId(null)}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-[#94A3B8] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isComposingTalk}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#2DD4BF] hover:bg-[#34D399] disabled:opacity-45 text-[#07090E] font-bold cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {isComposingTalk ? 'Rendering Dialogue...' : 'Generate Talking Shot'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* STEP 3: Foley Soundboard, Auto-Ducking Score Mixer & 1080p YouTube Exporter */}
      {step === 3 && (
        <div className="bg-[rgba(17,22,33,0.72)] backdrop-blur-2xl border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] rounded-2xl p-6 sm:p-8 space-y-6 max-w-3xl mx-auto">
          <div className="space-y-1">
            <h2 className="text-xl font-display font-bold text-[#F8FAFC]">
              Kids&apos; Show Audio Mixer &amp; 1080p YouTube Assembler
            </h2>
            <p className="text-xs text-[#94A3B8]">
              Preview Foley sound effects, auto-duck music under dialogue, and stitch all{' '}
              {activeProject.scenes.length} shots into a crisp watermark-free 16:9 MP4.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="bg-[#07090E]/75 border border-white/10 rounded-2xl p-4">
              <div className="text-[#64748B]">Total Shots</div>
              <div className="text-xl font-display font-bold text-[#F8FAFC] mt-1 tabular-nums">
                {activeProject.scenes.length}
              </div>
            </div>
            <div className="bg-[#07090E]/75 border border-white/10 rounded-2xl p-4">
              <div className="text-[#64748B]">Rendered Clips</div>
              <div className="text-xl font-display font-bold text-[#F8FAFC] mt-1 tabular-nums">
                {readyClipsCount} / {activeProject.scenes.length}
              </div>
            </div>
            <div className="bg-[#07090E]/75 border border-white/10 rounded-2xl p-4">
              <div className="text-[#64748B]">Speech Ready</div>
              <div className="text-xl font-display font-bold text-[#F8FAFC] mt-1 tabular-nums">
                {readyVoicesCount} / {activeProject.scenes.length}
              </div>
            </div>
          </div>

          {/* Interactive Foley Soundboard */}
          <div className="bg-[#07090E]/75 border border-white/10 rounded-2xl p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#F8FAFC] flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5 text-[#2DD4BF]" />
                Royalty-Free Foley Soundboard (Click to Audition)
              </span>
              <span className="text-[10px] text-[#64748B]">
                Auto-mixed on scenes with assigned SFX
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {FOLEY_SFX_PRESETS.filter((s) => s.id !== 'none').map((sfx) => (
                <button
                  key={sfx.id}
                  type="button"
                  onClick={() => studioAudio.playFoleySfx(sfx.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[rgba(17,22,33,0.85)] hover:border-[#2DD4BF]/60 border border-white/10 text-[11px] font-medium text-[#F8FAFC] cursor-pointer transition-colors"
                  title={sfx.description}
                >
                  <Play className="w-3 h-3 text-[#2DD4BF]" />
                  {sfx.label}
                </button>
              ))}
            </div>
          </div>

          {/* Musical Score & Automatic Voice Ducking */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-xs font-medium text-[#F8FAFC] flex items-center gap-1.5">
                <Music className="w-3.5 h-3.5 text-[#2DD4BF]" />
                Musical Score Bed
              </label>
              <div className="flex items-center gap-2">
                <select
                  value={selectedMusicId}
                  onChange={(e) => setSelectedMusicId(e.target.value)}
                  className="flex-1 bg-[#07090E]/75 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-[#F8FAFC] focus:outline-none focus:border-[#2DD4BF]/60"
                >
                  {MUSIC_PRESETS.map((m) => (
                    <option key={m.id} value={m.id} className="bg-[#0B0F18]">
                      {m.title} ({m.mood})
                    </option>
                  ))}
                  <option value="none" className="bg-[#0B0F18]">
                    No Background Music
                  </option>
                </select>

                {selectedMusicId !== 'none' && (
                  <button
                    type="button"
                    onClick={() => {
                      if (playingMusicPreviewId === selectedMusicId) {
                        studioAudio.stop();
                        setPlayingMusicPreviewId(null);
                      } else {
                        const track = MUSIC_PRESETS.find((m) => m.id === selectedMusicId);
                        if (track) {
                          studioAudio.playPreset(track, 0.55);
                          setPlayingMusicPreviewId(track.id);
                        }
                      }
                    }}
                    className="px-3 py-2.5 rounded-xl bg-[#07090E]/80 border border-white/10 hover:border-[#2DD4BF]/50 text-xs text-[#2DD4BF] cursor-pointer"
                    title="Preview Score"
                  >
                    {playingMusicPreviewId === selectedMusicId ? 'Stop' : 'Play'}
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-[#F8FAFC]">
                YouTube Export Quality &amp; Audio Mixing
              </label>
              <div className="flex items-center gap-2">
                <select
                  value={exportResolution}
                  onChange={(e) => setExportResolution(e.target.value as '1080p' | '720p')}
                  className="flex-1 bg-[#07090E]/75 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-[#F8FAFC] focus:outline-none focus:border-[#2DD4BF]/60"
                >
                  <option value="1080p" className="bg-[#0B0F18]">
                    1080p Full HD (YouTube 16:9)
                  </option>
                  <option value="720p" className="bg-[#0B0F18]">
                    720p Fast Export
                  </option>
                </select>
              </div>
              <label className="inline-flex items-center gap-2 text-[11px] text-[#94A3B8] cursor-pointer pt-0.5">
                <input
                  type="checkbox"
                  checked={enableAutoDuck}
                  onChange={(e) => setEnableAutoDuck(e.target.checked)}
                  className="accent-[#2DD4BF]"
                />
                Automatic Voice Ducking (lowers score under dialogue)
              </label>
            </div>
          </div>

          {/* 1-Click Animated Calligraphy Signature Intro / Outro Card */}
          <div className="bg-[#07090E]/75 border border-white/10 rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#2DD4BF]/15 border border-[#2DD4BF]/35 flex items-center justify-center shrink-0">
                  <PenTool className="w-4 h-4 text-[#2DD4BF]" />
                </div>
                <div>
                  <h3 className="text-xs font-display font-bold text-[#F8FAFC]">
                    Animated Calligraphy Intro / Signature Card
                  </h3>
                  <p className="text-[11px] text-[#94A3B8]">
                    1.6s handwriting reveal + 0.4s Mint-Cyan light sweep · Prepend or append free to your MP4
                  </p>
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={sigEnabled}
                onClick={() => {
                  setSigEnabled((v) => !v);
                  setSigReplayKey((k) => k + 1);
                }}
                className="inline-flex items-center gap-2 text-xs text-[#F8FAFC] cursor-pointer"
              >
                <span
                  className={`relative inline-flex items-center w-9 h-5 rounded-full border transition-all duration-300 ${
                    sigEnabled
                      ? 'bg-[#2DD4BF]/25 border-[#2DD4BF]/80 shadow-[0_0_12px_rgba(45,212,191,0.35)]'
                      : 'bg-white/[0.08] border-white/15'
                  }`}
                >
                  <span
                    className={`w-3.5 h-3.5 rounded-full transition-all duration-300 ${
                      sigEnabled
                        ? 'translate-x-[18px] bg-[#2DD4BF] shadow-[0_0_8px_rgba(45,212,191,0.85)]'
                        : 'translate-x-[2px] bg-[#94A3B8]'
                    }`}
                  />
                </span>
                <span className="font-semibold text-[11px]">
                  {sigEnabled ? 'Included in MP4' : 'Disabled'}
                </span>
              </button>
            </div>

            {sigEnabled && (
              <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_1fr] gap-4 items-center">
                {/* Live Animated Preview Canvas */}
                <div className="relative aspect-video rounded-2xl bg-[#07090E] border border-white/15 overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                  <AhiCalligraphyStage
                    signatureText={sigText}
                    subtitleText={sigSubtitle}
                    replayKey={sigReplayKey}
                    compact
                    className="w-full h-full"
                  />
                  <button
                    type="button"
                    onClick={() => setSigReplayKey((k) => k + 1)}
                    className="absolute bottom-2.5 right-2.5 z-30 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.08] hover:bg-white/[0.15] border border-white/15 hover:border-[#2DD4BF]/50 text-[11px] font-medium text-[#F8FAFC] backdrop-blur-xl transition-all cursor-pointer"
                  >
                    <Play className="w-3 h-3 text-[#2DD4BF]" />
                    Replay Stroke &amp; Sweep
                  </button>
                </div>

                {/* Custom Show Signature & Placement Controls */}
                <div className="space-y-3 text-xs">
                  <div className="space-y-1">
                    <label className="block text-[11px] font-medium text-[#94A3B8]">
                      Show Name or Creator Signature
                    </label>
                    <input
                      type="text"
                      maxLength={36}
                      value={sigText}
                      onChange={(e) => setSigText(e.target.value)}
                      onBlur={() => setSigReplayKey((k) => k + 1)}
                      placeholder="e.g., Milo & Friends Studio"
                      className="w-full bg-[rgba(17,22,33,0.9)] border border-white/10 focus:border-[#2DD4BF]/60 rounded-xl px-3 py-2 text-xs text-[#F8FAFC] placeholder-[#64748B] focus:outline-none"
                    />
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {['Kingssy', showBible.showTitle, activeProject.title]
                        .filter((v, idx, arr) => Boolean(v?.trim()) && arr.indexOf(v) === idx)
                        .slice(0, 3)
                        .map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => {
                              setSigText(preset);
                              setSigReplayKey((k) => k + 1);
                            }}
                            className="px-2.5 py-0.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 hover:border-[#2DD4BF]/45 text-[10px] text-[#94A3B8] hover:text-[#F8FAFC] transition-colors cursor-pointer"
                          >
                            {preset}
                          </button>
                        ))}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[11px] font-medium text-[#94A3B8]">
                      Subtitle Tagline (Optional)
                    </label>
                    <input
                      type="text"
                      maxLength={40}
                      value={sigSubtitle}
                      onChange={(e) => setSigSubtitle(e.target.value)}
                      onBlur={() => setSigReplayKey((k) => k + 1)}
                      placeholder="PRESENTS"
                      className="w-full bg-[rgba(17,22,33,0.9)] border border-white/10 focus:border-[#2DD4BF]/60 rounded-xl px-3 py-2 text-xs text-[#F8FAFC] placeholder-[#64748B] focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[11px] font-medium text-[#94A3B8]">
                      Placement in Exported MP4
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(
                        [
                          { id: 'intro', label: 'Intro' },
                          { id: 'outro', label: 'Outro' },
                          { id: 'both', label: 'Intro + Outro' },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setSigPlacement(opt.id)}
                          className={`py-2 px-2 rounded-xl border text-[11px] font-semibold transition-all cursor-pointer ${
                            sigPlacement === opt.id
                              ? 'bg-[#2DD4BF]/15 border-[#2DD4BF]/60 text-[#F8FAFC]'
                              : 'bg-[rgba(17,22,33,0.9)] border-white/10 text-[#94A3B8] hover:text-[#F8FAFC]'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {isExporting && (
            <div className="flex justify-center">
              <AhiGenerationLoader
                mode="export"
                progress={exportProgress}
                statusMessage={
                  exportPhase || 'Combining 1080p shots, Foley SFX & auto-ducked score...'
                }
              />
            </div>
          )}

          {finalMp4Url && (
            <div className="space-y-4">
              <video
                src={finalMp4Url}
                controls
                className="w-full aspect-video rounded-2xl bg-black border border-white/10"
              />
              <a
                href={finalMp4Url}
                download={`${activeProject.title.toLowerCase().replace(/\s+/g, '-')}-${exportResolution}.mp4`}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#2DD4BF] hover:bg-[#34D399] text-[#07090E] text-xs font-bold transition-colors"
              >
                <Download className="w-4 h-4" />
                Download {exportResolution} Episode MP4 (Free, No Watermark)
              </a>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs text-[#94A3B8] hover:text-[#F8FAFC] cursor-pointer transition-colors"
            >
              ← Back to Cinema Timeline
            </button>

            <button
              type="button"
              disabled={isExporting}
              onClick={() => void handleCombineAndExport()}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#2DD4BF] hover:bg-[#34D399] disabled:opacity-45 text-[#07090E] text-xs font-bold shadow-[0_0_22px_rgba(45,212,191,0.22)] cursor-pointer transition-colors"
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Assembling {exportResolution} Episode...
                </>
              ) : (
                <>
                  <Video className="w-4 h-4" />
                  Export YouTube Episode ({exportResolution} 16:9 MP4)
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
