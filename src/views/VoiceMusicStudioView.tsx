import { useEffect, useRef, useState } from 'react';
import {
  Check,
  Cpu,
  Download,
  Film,
  Loader2,
  Mic,
  Music,
  Pause,
  Play,
  Sliders,
  Sparkles,
  Square,
  Volume2,
} from 'lucide-react';
import { MUSIC_PRESETS, VOICE_PRESETS } from '../data/seedData';
import { STOCK_ASSETS } from '../data/stockAssets';
import { generateHfLipSyncClip, synthesizeVoiceover } from '../services/studioApi';
import type {
  CharacterProfile,
  GeminiVoiceName,
  VideoProject,
  VoiceClip,
} from '../types/studio';
import {
  getBrowserSpeechVoices,
  speakWithBrowserTts,
  stopBrowserTts,
  studioAudio,
} from '../utils/audioEngine';

interface VoiceMusicStudioViewProps {
  activeProject: VideoProject;
  characters: CharacterProfile[];
  voiceClips: VoiceClip[];
  onAddVoiceClip: (clip: VoiceClip) => void;
  onAttachVoiceToScene: (sceneId: string, audioBase64: string, voiceName: GeminiVoiceName) => void;
  onUpdateProject: (updated: VideoProject) => void;
}

const DELIVERY_STYLES = [
  'Warm, expressive animated film narrator',
  'Upbeat, energetic adventure protagonist',
  'Calm, lucid science documentary educator',
  'Dramatic theatrical anime trailer voice',
  'Hushed, atmospheric noir storyteller',
];

export function VoiceMusicStudioView({
  activeProject,
  characters,
  voiceClips,
  onAddVoiceClip,
  onAttachVoiceToScene,
  onUpdateProject,
}: VoiceMusicStudioViewProps) {
  const [selectedSceneId, setSelectedSceneId] = useState<string>(
    activeProject.scenes[0]?.id ?? ''
  );
  const [voiceEngine, setVoiceEngine] = useState<'browser' | 'gemini' | 'mic'>('browser');

  // Browser Web Speech API state
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>(() =>
    getBrowserSpeechVoices()
  );
  const [selectedBrowserVoice, setSelectedBrowserVoice] = useState<string>('');
  const [speechRate, setSpeechRate] = useState(1.0);
  const [speechPitch, setSpeechPitch] = useState(1.0);
  const [isBrowserSpeaking, setIsBrowserSpeaking] = useState(false);

  // Gemini TTS state
  const [voiceName, setVoiceName] = useState<GeminiVoiceName>('Kore');
  const [deliveryStyle, setDeliveryStyle] = useState(DELIVERY_STYLES[0]);
  const [scriptText, setScriptText] = useState(
    activeProject.scenes[0]?.narration ||
      'High above the harbor roofs, every gear in the tower had only twelve minutes left.'
  );
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Free Microphone Recorder
  const [isRecordingMic, setIsRecordingMic] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const micChunksRef = useRef<BlobPart[]>([]);

  // SadTalker Lip-Sync Engine
  const [lipSyncAvatar, setLipSyncAvatar] = useState<string>(
    characters.find((c) => Boolean(c.avatarUrl))?.avatarUrl ||
      '/src/assets/images/char_luna_pilot_1795461026794.jpg'
  );
  const [lipSyncSpaceId, setLipSyncSpaceId] = useState('vinthony/SadTalker');
  const [isLipSyncing, setIsLipSyncing] = useState(false);
  const [lipSyncStatus, setLipSyncStatus] = useState<string | null>(null);
  const [lipSyncResultUrl, setLipSyncResultUrl] = useState<string | null>(null);

  const [playingTrackId, setPlayingTrackId] = useState<string | null>(() =>
    studioAudio.getPlayingTrackId()
  );
  const [musicVolume, setMusicVolume] = useState(0.55);
  const [musicSearch, setMusicSearch] = useState('');

  useEffect(() => {
    const loadVoices = () => {
      const list = getBrowserSpeechVoices();
      setBrowserVoices(list);
      if (!selectedBrowserVoice && list.length > 0) {
        const english = list.find((v) => v.lang.startsWith('en')) ?? list[0];
        setSelectedBrowserVoice(english.name);
      }
    };
    loadVoices();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
      return () => window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
    }
    return undefined;
  }, [selectedBrowserVoice]);

  const stockMusic = STOCK_ASSETS.filter((a) => a.type === 'music');
  const allTracks = [
    ...MUSIC_PRESETS.map((m) => ({
      id: m.id,
      title: m.title,
      mood: m.mood,
      bpm: m.bpm,
      description: m.description,
      baseFreq: m.baseFreq,
      scaleIntervals: m.scaleIntervals,
      waveform: m.waveform,
    })),
    ...stockMusic
      .filter((s) => !MUSIC_PRESETS.some((m) => m.id === s.id))
      .map((s) => ({
        id: s.id,
        title: s.title,
        mood: s.category,
        bpm: s.musicConfig?.bpm ?? 100,
        description: s.resolutionOrBpm,
        baseFreq: s.musicConfig?.baseFreq ?? 220,
        scaleIntervals: s.musicConfig?.scaleIntervals ?? [0, 2, 4, 7, 9],
        waveform: s.musicConfig?.waveform ?? ('triangle' as OscillatorType),
      })),
  ].filter(
    (t) =>
      !musicSearch.trim() ||
      t.title.toLowerCase().includes(musicSearch.toLowerCase()) ||
      t.mood.toLowerCase().includes(musicSearch.toLowerCase())
  );

  const handleLoadSceneText = (sceneId: string) => {
    setSelectedSceneId(sceneId);
    const sc = activeProject.scenes.find((s) => s.id === sceneId);
    if (!sc) return;
    const lines = [sc.narration, ...sc.dialogueLines.map((d) => d.line)]
      .filter(Boolean)
      .join(' ');
    if (lines) setScriptText(lines);
  };

  const handleSpeakBrowser = () => {
    if (!scriptText.trim()) return;
    if (isBrowserSpeaking) {
      stopBrowserTts();
      setIsBrowserSpeaking(false);
      return;
    }

    setIsBrowserSpeaking(true);
    const targetScene = activeProject.scenes.find((s) => s.id === selectedSceneId);
    if (targetScene) {
      onUpdateProject({
        ...activeProject,
        updatedAt: new Date().toISOString(),
        scenes: activeProject.scenes.map((sc) =>
          sc.id === targetScene.id
            ? {
                ...sc,
                browserVoiceName: selectedBrowserVoice,
                browserVoiceRate: speechRate,
                browserVoicePitch: speechPitch,
              }
            : sc
        ),
      });
    }

    speakWithBrowserTts(scriptText, {
      voiceName: selectedBrowserVoice,
      rate: speechRate,
      pitch: speechPitch,
      onEnd: () => setIsBrowserSpeaking(false),
    });
  };

  const handleSynthesizeGemini = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scriptText.trim()) return;
    setErrorMsg(null);
    setIsSynthesizing(true);
    try {
      const res = await synthesizeVoiceover({
        text: scriptText.trim(),
        voiceName,
        styleInstruction: deliveryStyle,
      });
      const targetScene = activeProject.scenes.find((s) => s.id === selectedSceneId);
      const clip: VoiceClip = {
        id: `vclip-${Date.now()}`,
        label: targetScene
          ? `Scene ${targetScene.sceneNumber}: ${targetScene.title}`
          : 'Custom Studio Take',
        text: scriptText.trim(),
        voiceName: res.voiceName,
        styleInstruction: deliveryStyle,
        audioBase64: res.audioBase64,
        createdAt: new Date().toISOString(),
        sceneId: targetScene?.id,
      };
      onAddVoiceClip(clip);
      if (targetScene) {
        onAttachVoiceToScene(targetScene.id, res.audioBase64, res.voiceName);
      }
      const audio = new Audio(`data:audio/wav;base64,${res.audioBase64}`);
      void audio.play();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Voice synthesis failed.');
    } finally {
      setIsSynthesizing(false);
    }
  };

  const handleToggleMicRecording = async () => {
    if (isRecordingMic && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecordingMic(false);
      return;
    }

    setErrorMsg(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      micChunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) micChunksRef.current.push(ev.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(micChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = String(reader.result || '');
          const base64 = dataUrl.split(',')[1] || '';
          const targetScene = activeProject.scenes.find((s) => s.id === selectedSceneId);
          if (base64) {
            onAddVoiceClip({
              id: `mic-${Date.now()}`,
              label: targetScene
                ? `Mic Take · Scene ${targetScene.sceneNumber}`
                : 'Mic Voiceover Take',
              text: scriptText.trim() || 'Recorded microphone narration',
              voiceName: 'Kore',
              styleInstruction: 'Microphone Recording',
              audioBase64: base64,
              createdAt: new Date().toISOString(),
              sceneId: targetScene?.id,
            });
            if (targetScene) {
              onAttachVoiceToScene(targetScene.id, base64, 'Kore');
            }
          }
        };
        reader.readAsDataURL(blob);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecordingMic(true);
    } catch {
      setErrorMsg('Microphone permission was denied or no microphone was detected.');
    }
  };

  const handleGenerateLipSync = async () => {
    const targetScene = activeProject.scenes.find((s) => s.id === selectedSceneId);
    const audioSource =
      targetScene?.voiceAudioBase64 || voiceClips[0]?.audioBase64 || '';

    if (!lipSyncAvatar) {
      setErrorMsg('Choose a character portrait for SadTalker lip-sync.');
      return;
    }
    if (!audioSource) {
      setErrorMsg(
        'Record a quick mic take or generate a Gemini WAV take above first so SadTalker has audio to drive lip motion.'
      );
      return;
    }

    setErrorMsg(null);
    setIsLipSyncing(true);
    setLipSyncStatus(`Connecting to free SadTalker Space (${lipSyncSpaceId})...`);
    try {
      const res = await generateHfLipSyncClip(
        {
          imageDataUrl: lipSyncAvatar,
          audioBase64: audioSource,
          spaceId: lipSyncSpaceId,
        },
        (evt) => {
          if (evt.message) setLipSyncStatus(evt.message);
        }
      );

      setLipSyncResultUrl(res.videoUrl);
      if (targetScene) {
        onUpdateProject({
          ...activeProject,
          updatedAt: new Date().toISOString(),
          scenes: activeProject.scenes.map((sc) =>
            sc.id === targetScene.id
              ? {
                  ...sc,
                  lipSyncVideoUrl: res.videoUrl,
                  generatedVideoUrl: res.videoUrl,
                  generatedVideoSpace: res.spaceUsed,
                }
              : sc
          ),
        });
      }
      setLipSyncStatus(`Lip-sync performance rendered cleanly via ${res.spaceUsed}`);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'SadTalker public GPU queue is currently unavailable.'
      );
      setLipSyncStatus(null);
    } finally {
      setIsLipSyncing(false);
    }
  };

  const toggleTrack = (track: (typeof allTracks)[number]) => {
    if (playingTrackId === track.id) {
      studioAudio.stop();
      setPlayingTrackId(null);
    } else {
      studioAudio.playPreset(track, musicVolume);
      setPlayingTrackId(track.id);
    }
  };

  const handleAssignScore = (track: (typeof allTracks)[number]) => {
    onUpdateProject({
      ...activeProject,
      selectedMusicId: track.id,
      suggestedMusicMood: `${track.title} · ${track.bpm} BPM`,
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <div className="space-y-6 pb-4">
      {/* Honest Free Audio/Lip-Sync Engine Banner */}
      <div className="bg-[rgba(17,22,33,0.72)] backdrop-blur-2xl border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] rounded-2xl px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5 text-[#F8FAFC]">
          <Cpu className="w-4 h-4 text-[#2DD4BF] shrink-0" />
          <div>
            <span className="font-semibold text-[#F8FAFC]">
              Free Voice, Mic &amp; SadTalker Lip-Sync Studio
            </span>
            <span className="text-[#64748B] mx-2" aria-hidden="true">
              ·
            </span>
            <span className="text-[#94A3B8]">
              Offline Web Speech API + Free Mic Recorder + Public SadTalker Hugging Face GPUs.
            </span>
          </div>
        </div>
        <span className="font-mono text-[#34D399] shrink-0">Zero Watermarks</span>
      </div>

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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Voiceover Booth + SadTalker Lip-Sync */}
        <div className="lg:col-span-7 space-y-6">
          <section className="bg-[rgba(17,22,33,0.72)] backdrop-blur-2xl border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] rounded-2xl p-6 space-y-5 transition-all hover:border-[#2DD4BF]/30">
            <div>
              <h2 className="text-base font-display font-semibold text-[#F8FAFC] flex items-center gap-2">
                <Mic className="w-4 h-4 text-[#2DD4BF]" />
                Voiceover &amp; Narration Studio
              </h2>
              <p className="text-xs text-[#94A3B8] mt-0.5">
                Instant Browser Speech, Gemini TTS (.wav), or live microphone recording for{' '}
                {activeProject.title}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-1 p-1 bg-[#07090E]/80 border border-white/10 rounded-xl w-fit">
              {(
                [
                  { id: 'browser', label: 'Browser Speech (100% Free)' },
                  { id: 'gemini', label: 'Gemini TTS (.wav)' },
                  { id: 'mic', label: 'Mic Recorder (Free)' },
                ] as const
              ).map((eng) => (
                <button
                  key={eng.id}
                  type="button"
                  onClick={() => setVoiceEngine(eng.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                    voiceEngine === eng.id
                      ? 'bg-[#2DD4BF]/15 text-[#2DD4BF] border border-[#2DD4BF]/45 shadow-[0_0_16px_rgba(45,212,191,0.12)]'
                      : 'text-[#94A3B8] hover:text-[#F8FAFC] border border-transparent'
                  }`}
                >
                  {eng.label}
                </button>
              ))}
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs text-[#94A3B8] mb-1.5">Target Project Scene</label>
                <select
                  value={selectedSceneId}
                  onChange={(e) => handleLoadSceneText(e.target.value)}
                  className="w-full bg-[#07090E]/75 border border-white/10 rounded-xl px-3 py-2 text-sm text-[#F8FAFC] focus:outline-none focus:border-[#2DD4BF]/60"
                >
                  {activeProject.scenes.map((sc) => (
                    <option key={sc.id} value={sc.id}>
                      Scene {sc.sceneNumber}: {sc.title}
                    </option>
                  ))}
                </select>
              </div>

              {voiceEngine === 'browser' && (
                <div className="bg-[#07090E]/75 border border-white/10 rounded-xl p-4 space-y-4">
                  <div>
                    <label className="block text-xs text-[#94A3B8] mb-1.5">
                      Browser Voice ({browserVoices.length} available offline)
                    </label>
                    <select
                      value={selectedBrowserVoice}
                      onChange={(e) => setSelectedBrowserVoice(e.target.value)}
                      className="w-full bg-[rgba(17,22,33,0.9)] border border-white/10 rounded-xl px-3 py-2 text-sm text-[#F8FAFC] focus:outline-none focus:border-[#2DD4BF]/60"
                    >
                      {browserVoices.length === 0 ? (
                        <option value="">Default System Voice</option>
                      ) : (
                        browserVoices.map((v) => (
                          <option key={`${v.name}-${v.lang}`} value={v.name}>
                            {v.name} ({v.lang})
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <div className="flex justify-between text-xs text-[#94A3B8] mb-1">
                        <span>Speaking Rate</span>
                        <span className="font-mono tabular-nums text-[#F8FAFC]">
                          {speechRate.toFixed(2)}×
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0.6}
                        max={1.6}
                        step={0.05}
                        value={speechRate}
                        onChange={(e) => setSpeechRate(Number(e.target.value))}
                        className="w-full accent-[#2DD4BF]"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs text-[#94A3B8] mb-1">
                        <span>Voice Pitch</span>
                        <span className="font-mono tabular-nums text-[#F8FAFC]">
                          {speechPitch.toFixed(2)}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0.5}
                        max={1.8}
                        step={0.05}
                        value={speechPitch}
                        onChange={(e) => setSpeechPitch(Number(e.target.value))}
                        className="w-full accent-[#34D399]"
                      />
                    </div>
                  </div>
                </div>
              )}

              {voiceEngine === 'gemini' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs text-[#94A3B8] mb-1.5">Delivery Style</label>
                    <select
                      value={deliveryStyle}
                      onChange={(e) => setDeliveryStyle(e.target.value)}
                      className="w-full bg-[#07090E]/75 border border-white/10 rounded-xl px-3 py-2 text-sm text-[#F8FAFC] focus:outline-none focus:border-[#2DD4BF]/60"
                    >
                      {DELIVERY_STYLES.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-[#94A3B8] mb-1.5">Voice Cast Preset</label>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      {VOICE_PRESETS.map((vp) => (
                        <button
                          key={vp.name}
                          type="button"
                          onClick={() => setVoiceName(vp.name)}
                          className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                            voiceName === vp.name
                              ? 'bg-[#2DD4BF]/15 border-[#2DD4BF]/55 text-[#F8FAFC] shadow-[0_0_18px_rgba(45,212,191,0.14)]'
                              : 'bg-[#07090E]/75 border-white/10 text-[#94A3B8] hover:text-[#F8FAFC] hover:border-[#2DD4BF]/35'
                          }`}
                        >
                          <div className="text-xs font-semibold text-[#F8FAFC]">{vp.name}</div>
                          <div className="text-[11px] text-[#94A3B8] truncate mt-0.5">
                            {vp.archetype}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs text-[#94A3B8] mb-1.5">Spoken Script Text</label>
                <textarea
                  rows={3}
                  value={scriptText}
                  onChange={(e) => setScriptText(e.target.value)}
                  placeholder="Enter narration or dialogue line..."
                  className="w-full bg-[#07090E]/75 border border-white/10 rounded-xl p-3.5 text-sm text-[#F8FAFC] placeholder-[#64748B] focus:outline-none focus:border-[#2DD4BF]/60"
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-[#64748B] font-mono tabular-nums">
                  {scriptText.length} / 1500 chars
                </span>

                {voiceEngine === 'browser' && (
                  <button
                    type="button"
                    disabled={!scriptText.trim()}
                    onClick={handleSpeakBrowser}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#2DD4BF] hover:bg-[#34D399] disabled:opacity-45 text-[#07090E] text-xs font-bold rounded-xl shadow-[0_0_20px_rgba(45,212,191,0.22)] transition-all whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {isBrowserSpeaking ? (
                      <>
                        <Square className="w-3.5 h-3.5" />
                        Stop Browser Speech
                      </>
                    ) : (
                      <>
                        <Volume2 className="w-4 h-4" />
                        Speak Scene (Web Speech)
                      </>
                    )}
                  </button>
                )}

                {voiceEngine === 'gemini' && (
                  <button
                    type="button"
                    disabled={isSynthesizing || !scriptText.trim()}
                    onClick={(e) => void handleSynthesizeGemini(e)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#2DD4BF] hover:bg-[#34D399] disabled:opacity-45 text-[#07090E] text-xs font-bold rounded-xl shadow-[0_0_20px_rgba(45,212,191,0.22)] transition-all whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {isSynthesizing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Recording Voiceover...
                      </>
                    ) : (
                      <>
                        <Volume2 className="w-4 h-4" />
                        Synthesize &amp; Attach to Scene
                      </>
                    )}
                  </button>
                )}

                {voiceEngine === 'mic' && (
                  <button
                    type="button"
                    onClick={() => void handleToggleMicRecording()}
                    className={`inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold rounded-xl transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                      isRecordingMic
                        ? 'bg-red-500 hover:bg-red-400 text-white'
                        : 'bg-[#2DD4BF] hover:bg-[#34D399] text-[#07090E] shadow-[0_0_20px_rgba(45,212,191,0.22)]'
                    }`}
                  >
                    {isRecordingMic ? (
                      <>
                        <Square className="w-3.5 h-3.5" />
                        Stop &amp; Save Take to Scene
                      </>
                    ) : (
                      <>
                        <Mic className="w-4 h-4" />
                        Record Free Mic Voiceover
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Saved Takes */}
            <div className="pt-4 border-t border-white/10 space-y-3">
              <h3 className="text-xs font-semibold text-[#F8FAFC]">
                Saved Audio Takes Included in MP4 Export ({voiceClips.length})
              </h3>
              {voiceClips.length === 0 ? (
                <div className="bg-[#07090E]/75 border border-white/10 rounded-xl p-4 text-xs text-[#64748B]">
                  No recorded audio takes yet. Record with your mic or synthesize Gemini TTS to
                  drive SadTalker lip-sync and FFmpeg MP4 audio tracks.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {voiceClips.map((clip) => (
                    <div
                      key={clip.id}
                      className="bg-[#07090E]/75 border border-white/10 hover:border-[#2DD4BF]/35 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-[#F8FAFC] truncate">
                          {clip.label} · {clip.styleInstruction}
                        </div>
                        <p className="text-xs text-[#94A3B8] truncate mt-0.5">{clip.text}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <audio
                          controls
                          src={`data:audio/wav;base64,${clip.audioBase64}`}
                          className="h-8 w-44"
                        />
                        <a
                          href={`data:audio/wav;base64,${clip.audioBase64}`}
                          download={`${clip.id}.wav`}
                          className="p-2 rounded-lg bg-white/5 hover:bg-[#2DD4BF]/15 text-[#94A3B8] hover:text-[#2DD4BF] border border-white/10 hover:border-[#2DD4BF]/40 transition-colors"
                          title="Download audio"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* SadTalker Character Lip-Sync Animator */}
          <section className="bg-[rgba(17,22,33,0.72)] backdrop-blur-2xl border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] rounded-2xl p-6 space-y-4 transition-all hover:border-[#2DD4BF]/30">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-display font-semibold text-[#F8FAFC] flex items-center gap-2">
                  <Film className="w-4 h-4 text-[#2DD4BF]" />
                  SadTalker AI Lip-Sync Generator
                </h2>
                <p className="text-xs text-[#94A3B8] mt-0.5">
                  Animate any character portrait to speak your scene audio via free public SadTalker
                  Spaces
                </p>
              </div>
              <input
                type="text"
                value={lipSyncSpaceId}
                onChange={(e) => setLipSyncSpaceId(e.target.value)}
                aria-label="SadTalker Space ID"
                className="w-44 bg-[#07090E]/75 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs font-mono text-[#F8FAFC] placeholder-[#64748B] focus:outline-none focus:border-[#2DD4BF]/60"
              />
            </div>

            <div className="grid grid-cols-4 gap-2">
              {characters
                .filter((c) => Boolean(c.avatarUrl))
                .slice(0, 4)
                .map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setLipSyncAvatar(c.avatarUrl || '')}
                    className={`rounded-xl overflow-hidden border p-1 text-left transition-all cursor-pointer ${
                      lipSyncAvatar === c.avatarUrl
                        ? 'border-[#2DD4BF] bg-[#2DD4BF]/15 shadow-[0_0_18px_rgba(45,212,191,0.16)]'
                        : 'border-white/10 bg-[#07090E]/75 hover:border-[#2DD4BF]/40'
                    }`}
                  >
                    <img
                      src={c.avatarUrl}
                      alt={c.name}
                      referrerPolicy="no-referrer"
                      className="w-full aspect-square object-cover rounded-lg"
                    />
                    <div className="text-[11px] text-[#F8FAFC] truncate mt-1 px-0.5">{c.name}</div>
                  </button>
                ))}
            </div>

            {lipSyncStatus && (
              <div className="bg-[#07090E]/75 border border-[#2DD4BF]/35 rounded-xl px-3.5 py-2.5 text-xs text-[#F8FAFC] flex items-center gap-2">
                {isLipSyncing && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#2DD4BF]" />}
                <span>{lipSyncStatus}</span>
              </div>
            )}

            {lipSyncResultUrl && (
              <div className="bg-[#07090E]/80 border border-white/10 rounded-xl overflow-hidden">
                <video src={lipSyncResultUrl} controls className="w-full aspect-video bg-black" />
              </div>
            )}

            <button
              type="button"
              disabled={isLipSyncing}
              onClick={() => void handleGenerateLipSync()}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#2DD4BF] hover:bg-[#34D399] disabled:opacity-45 text-xs font-bold text-[#07090E] shadow-[0_0_20px_rgba(45,212,191,0.22)] transition-all cursor-pointer"
            >
              {isLipSyncing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Rendering SadTalker Lip-Sync...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Animate Character Lip-Sync (Free Shared GPU)
                </>
              )}
            </button>
          </section>
        </div>

        {/* Right Column: Background Score & Stock Music Mixer */}
        <section className="lg:col-span-5 bg-[rgba(17,22,33,0.72)] backdrop-blur-2xl border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] rounded-2xl p-6 space-y-5 h-fit transition-all hover:border-[#2DD4BF]/30">
          <div>
            <h2 className="text-base font-display font-semibold text-[#F8FAFC] flex items-center gap-2">
              <Music className="w-4 h-4 text-[#2DD4BF]" />
              Free Background Music Library
            </h2>
            <p className="text-xs text-[#94A3B8] mt-0.5">
              Royalty-free procedural scores rendered directly into your FFmpeg MP4 export
            </p>
          </div>

          <div className="bg-[#07090E]/75 border border-white/10 rounded-xl p-3.5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-xs text-[#F8FAFC]">
              <Sliders className="w-3.5 h-3.5 text-[#2DD4BF]" />
              <span>Monitor Gain</span>
            </div>
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={musicVolume}
              onChange={(e) => {
                const v = Number(e.target.value);
                setMusicVolume(v);
                studioAudio.setVolume(v);
              }}
              className="w-36 accent-[#2DD4BF]"
            />
            <span className="text-xs font-mono tabular-nums text-[#94A3B8] w-10 text-right">
              {Math.round(musicVolume * 100)}%
            </span>
          </div>

          <input
            type="text"
            value={musicSearch}
            onChange={(e) => setMusicSearch(e.target.value)}
            placeholder="Filter tracks by mood or title..."
            className="w-full bg-[#07090E]/75 border border-white/10 rounded-xl px-3 py-2 text-sm text-[#F8FAFC] placeholder-[#64748B] focus:outline-none focus:border-[#2DD4BF]/60"
          />

          <div className="space-y-3">
            {allTracks.map((track) => {
              const isPlaying = playingTrackId === track.id;
              const isSelected = activeProject.selectedMusicId === track.id;

              return (
                <div
                  key={track.id}
                  className={`p-4 rounded-xl border transition-all ${
                    isSelected
                      ? 'bg-[#2DD4BF]/12 border-[#2DD4BF]/50 shadow-[0_0_20px_rgba(45,212,191,0.12)]'
                      : 'bg-[#07090E]/75 border-white/10 hover:border-[#2DD4BF]/35'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="text-sm font-semibold text-[#F8FAFC] truncate">
                        {track.title}
                      </h4>
                      <div className="text-xs text-[#94A3B8] font-mono tabular-nums mt-0.5">
                        {track.mood} · {track.bpm} BPM
                      </div>
                      <p className="text-xs text-[#64748B] mt-1.5">{track.description}</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleTrack(track)}
                      className="p-2.5 rounded-lg bg-white/5 hover:bg-[#2DD4BF]/15 border border-white/10 hover:border-[#2DD4BF]/40 text-[#2DD4BF] shrink-0 cursor-pointer transition-colors"
                      title={isPlaying ? 'Stop track' : 'Audition track'}
                    >
                      {isPlaying ? (
                        <Pause className="w-4 h-4 text-[#2DD4BF]" />
                      ) : (
                        <Play className="w-4 h-4 text-[#2DD4BF]" />
                      )}
                    </button>
                  </div>

                  <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => handleAssignScore(track)}
                      className={`inline-flex items-center gap-1.5 text-xs font-medium cursor-pointer transition-colors ${
                        isSelected ? 'text-[#2DD4BF]' : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                      }`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5" />}
                      {isSelected ? 'Active Project Score' : 'Set as Project Score'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
