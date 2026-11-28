import { useMemo, useRef, useState } from 'react';
import {
  Check,
  Cpu,
  Image as ImageIcon,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Upload,
  UserCheck,
  Volume2,
} from 'lucide-react';
import { FreeGpuStatusCard } from '../components/FreeGpuStatusCard';
import { STYLE_PRESETS, VOICE_PRESETS } from '../data/seedData';
import {
  generateCharacterSheet,
  generateHfCharacterImage,
  synthesizeVoiceover,
} from '../services/studioApi';
import type { AnimationStyle, CharacterProfile, GeminiVoiceName } from '../types/studio';
import { speakWithBrowserTts } from '../utils/audioEngine';

interface CharacterLibraryViewProps {
  characters: CharacterProfile[];
  activeProjectCharacterIds: string[];
  onAddCharacter: (character: CharacterProfile) => void;
  onUpdateCharacter: (character: CharacterProfile) => void;
  onToggleCharacterInProject: (characterId: string) => void;
}

function resizeImageFileToDataUrl(file: File, maxSize = 1200): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const rawUrl = String(reader.result);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        if (scale === 1 && rawUrl.length <= 2_500_000) {
          resolve(rawUrl);
          return;
        }
        const w = Math.max(64, Math.round(img.width * scale));
        const h = Math.max(64, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context unavailable'));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const outputMime =
          file.type === 'image/png' || file.type === 'image/webp' ? 'image/png' : 'image/jpeg';
        resolve(canvas.toDataURL(outputMime, 0.95));
      };
      img.onerror = () => reject(new Error('Could not decode uploaded image.'));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error('Could not read uploaded file.'));
    reader.readAsDataURL(file);
  });
}

export function CharacterLibraryView({
  characters,
  activeProjectCharacterIds,
  onAddCharacter,
  onUpdateCharacter,
  onToggleCharacterInProject,
}: CharacterLibraryViewProps) {
  const [search, setSearch] = useState('');
  const [styleFilter, setStyleFilter] = useState<'All' | AnimationStyle>('All');
  const [showCreator, setShowCreator] = useState(false);

  const [concept, setConcept] = useState('');
  const [creatorStyle, setCreatorStyle] = useState<AnimationStyle>('3D Pixar-Style Cartoon');
  const [fluxSpaceId, setFluxSpaceId] = useState('black-forest-labs/FLUX.1-schnell');
  const [generateFluxPortrait, setGenerateFluxPortrait] = useState(true);
  const [uploadedCreatorAvatar, setUploadedCreatorAvatar] = useState<string | undefined>(undefined);

  const [isGenerating, setIsGenerating] = useState(false);
  const [fluxLoadingId, setFluxLoadingId] = useState<string | null>(null);
  const [auditioningId, setAuditioningId] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [gpuProgress, setGpuProgress] = useState(0);
  const [activeGpuSpace, setActiveGpuSpace] = useState<string | undefined>(undefined);
  const [gpuAttempt, setGpuAttempt] = useState<{ attempt?: number; total?: number }>({});
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const cardUploadRef = useRef<HTMLInputElement | null>(null);
  const [uploadTargetCharId, setUploadTargetCharId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return characters.filter((c) => {
      if (styleFilter !== 'All' && c.styleAffinity !== styleFilter) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.role.toLowerCase().includes(q) ||
        c.appearancePrompt.toLowerCase().includes(q)
      );
    });
  }, [characters, search, styleFilter]);

  const handleGenerateCharacter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!concept.trim()) return;
    setErrorMsg(null);
    setStatusNotice(null);
    setIsGenerating(true);

    try {
      const sheet = await generateCharacterSheet({
        concept: concept.trim(),
        styleAffinity: creatorStyle,
      });

      let avatarUrl = uploadedCreatorAvatar;
      let avatarSource: CharacterProfile['avatarSource'] = uploadedCreatorAvatar ? 'upload' : undefined;

      if (!avatarUrl && generateFluxPortrait) {
        setGpuProgress(10);
        setActiveGpuSpace(fluxSpaceId);
        setGpuAttempt({ attempt: 1, total: 3 });
        setStatusNotice(`Instant portrait render via Cloudflare Workers AI Flux.1 (fallback: ${fluxSpaceId})...`);
        try {
          const fluxRes = await generateHfCharacterImage(
            {
              prompt: sheet.appearancePrompt,
              style: creatorStyle,
              spaceId: fluxSpaceId,
            },
            (evt) => {
              if (evt.message) setStatusNotice(evt.message);
              if (typeof evt.progress === 'number') setGpuProgress(evt.progress);
              if (evt.space) setActiveGpuSpace(evt.space);
              if (evt.attempt && evt.totalAttempts) {
                setGpuAttempt({ attempt: evt.attempt, total: evt.totalAttempts });
              }
            }
          );
          avatarUrl = fluxRes.imageDataUrl;
          avatarSource = 'flux';
          setGpuProgress(100);
          setActiveGpuSpace(fluxRes.spaceUsed);
          const secs = fluxRes.elapsedMs ? ` in ${(fluxRes.elapsedMs / 1000).toFixed(1)}s` : '';
          setStatusNotice(`Portrait rendered cleanly${secs} via ${fluxRes.nodeLabel}`);
        } catch (fluxErr) {
          setGpuProgress(0);
          setErrorMsg(
            fluxErr instanceof Error
              ? `${fluxErr.message} Character sheet saved without portrait — click Generate Flux.1 or Upload Portrait anytime.`
              : 'Flux.1 Space busy; character sheet saved.'
          );
        }
      }

      const newChar: CharacterProfile = {
        id: `char-${Date.now()}`,
        ...sheet,
        avatarUrl,
        avatarSource,
      };
      onAddCharacter(newChar);
      setConcept('');
      setUploadedCreatorAvatar(undefined);
      setShowCreator(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Character generation failed.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateFluxForCard = async (char: CharacterProfile) => {
    setErrorMsg(null);
    setFluxLoadingId(char.id);
    setGpuProgress(10);
    setActiveGpuSpace(fluxSpaceId);
    setGpuAttempt({ attempt: 1, total: 3 });
    setStatusNotice(`Instant portrait render for ${char.name} via Cloudflare Workers AI Flux.1...`);
    try {
      const res = await generateHfCharacterImage(
        {
          prompt: char.appearancePrompt,
          style: char.styleAffinity,
          spaceId: fluxSpaceId,
        },
        (evt) => {
          if (evt.message) setStatusNotice(evt.message);
          if (typeof evt.progress === 'number') setGpuProgress(evt.progress);
          if (evt.space) setActiveGpuSpace(evt.space);
          if (evt.attempt && evt.totalAttempts) {
            setGpuAttempt({ attempt: evt.attempt, total: evt.totalAttempts });
          }
        }
      );
      onUpdateCharacter({
        ...char,
        avatarUrl: res.imageDataUrl,
        avatarSource: 'flux',
      });
      setGpuProgress(100);
      setActiveGpuSpace(res.spaceUsed);
      const secs = res.elapsedMs ? ` in ${(res.elapsedMs / 1000).toFixed(1)}s` : '';
      setStatusNotice(`Generated watermark-free portrait for ${char.name}${secs} via ${res.nodeLabel}`);
    } catch (err) {
      setGpuProgress(0);
      setErrorMsg(err instanceof Error ? err.message : 'Flux.1 image generation failed.');
    } finally {
      setFluxLoadingId(null);
    }
  };

  const handleCreatorFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);
    try {
      const resized = await resizeImageFileToDataUrl(file);
      setUploadedCreatorAvatar(resized);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to process image upload.');
    }
    e.target.value = '';
  };

  const handleCardFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const targetId = uploadTargetCharId;
    e.target.value = '';
    if (!file || !targetId) return;
    setErrorMsg(null);
    try {
      const resized = await resizeImageFileToDataUrl(file);
      const target = characters.find((c) => c.id === targetId);
      if (target) {
        onUpdateCharacter({
          ...target,
          avatarUrl: resized,
          avatarSource: 'upload',
        });
        setStatusNotice(`Saved custom portrait for ${target.name} to reuse across scenes.`);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to upload image.');
    } finally {
      setUploadTargetCharId(null);
    }
  };

  const handleAuditionVoice = async (char: CharacterProfile) => {
    setErrorMsg(null);
    setAuditioningId(char.id);
    const line = `Hello, I am ${char.name}, ${char.role}. Let's get this scene rolling.`;
    try {
      const res = await synthesizeVoiceover({
        text: line,
        voiceName: char.voiceName as GeminiVoiceName,
        styleInstruction: char.voiceStyle,
      });
      const audio = new Audio(`data:audio/wav;base64,${res.audioBase64}`);
      void audio.play();
    } catch {
      speakWithBrowserTts(line, { voiceName: char.browserVoiceName, rate: 1, pitch: 1 });
    } finally {
      setAuditioningId(null);
    }
  };

  return (
    <div className="space-y-6 pb-4">
      <input
        ref={cardUploadRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => void handleCardFileChange(e)}
        className="hidden"
      />

      {/* Honest Free Open-Source GPU Notice */}
      <div className="bg-[#111116]/90 backdrop-blur-xl border border-white/10 rounded-2xl px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2.5 text-zinc-200">
          <Cpu className="w-4 h-4 text-cyan-400 shrink-0" />
          <div>
            <span className="font-semibold text-zinc-100">
              A.H.I Instant Character Portraits (1–3s) &amp; Custom Uploads
            </span>
            <span className="text-zinc-500 mx-2" aria-hidden="true">
              ·
            </span>
            <span className="text-zinc-400">
              Primary Cloudflare Workers AI Flux.1 with automatic failover to HF Spaces or Colab Turbo GPU.
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <label className="text-zinc-400 whitespace-nowrap">HF Backup Node:</label>
          <input
            type="text"
            value={fluxSpaceId}
            onChange={(e) => setFluxSpaceId(e.target.value)}
            className="w-56 bg-zinc-950 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs font-mono text-zinc-100 focus:outline-none focus:border-cyan-400/60"
          />
        </div>
      </div>

      <FreeGpuStatusCard
        isRunning={isGenerating || Boolean(fluxLoadingId)}
        message={statusNotice}
        progress={gpuProgress}
        activeSpace={activeGpuSpace}
        attempt={gpuAttempt.attempt}
        totalAttempts={gpuAttempt.total}
      />

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

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search characters by name, role, or traits..."
              className="w-full bg-[#111116] border border-white/10 rounded-xl pl-9 pr-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-cyan-400/60"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1 p-1 bg-[#111116] border border-white/10 rounded-xl">
            {(
              [
                'All',
                'Warm Storybook 3D',
                'Enchanted Storybook',
                '3D Pixar-Style Cartoon',
                'Anime',
                'Cinematic Film',
                'Educational',
              ] as const
            ).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setStyleFilter(tab)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                  styleFilter === tab
                    ? 'bg-indigo-500/20 text-cyan-300 border border-indigo-400/40'
                    : 'text-zinc-400 hover:text-zinc-100 border border-transparent'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowCreator((v) => !v)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-500 to-cyan-500 hover:from-indigo-400 hover:to-cyan-400 text-zinc-950 text-xs font-semibold rounded-xl transition-all whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Design / Upload Character
        </button>
      </div>

      {/* Gemini + Flux.1 Character Generator & Upload Panel */}
      {showCreator && (
        <form
          onSubmit={handleGenerateCharacter}
          className="bg-[#111116]/90 backdrop-blur-xl border border-white/10 rounded-2xl p-6 space-y-4"
        >
          <div>
            <h3 className="text-base font-display font-semibold text-zinc-100">
              Character Sheet Designer &amp; Portrait Studio
            </h3>
            <p className="text-xs text-zinc-400 mt-0.5">
              Describe a character to build their sheet with Gemini, then render with free Hugging
              Face Flux.1 or upload your own portrait.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-3">
              <label className="block text-xs text-zinc-400 mb-1.5">Character Concept</label>
              <input
                type="text"
                value={concept}
                onChange={(e) => setConcept(e.target.value)}
                placeholder="e.g. A clumsy origami dragon apprentice who breathes tiny sparks and collects brass keys..."
                className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-cyan-400/60"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Style Affinity</label>
              <select
                value={creatorStyle}
                onChange={(e) => setCreatorStyle(e.target.value as AnimationStyle)}
                className="w-full bg-zinc-950 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-cyan-400/60"
              >
                {STYLE_PRESETS.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2 border-t border-white/10">
            <div className="flex flex-wrap items-center gap-4">
              <label className="inline-flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={generateFluxPortrait}
                  disabled={Boolean(uploadedCreatorAvatar)}
                  onChange={(e) => setGenerateFluxPortrait(e.target.checked)}
                  className="rounded border-white/20 bg-zinc-950 text-indigo-500"
                />
                Generate free portrait with Flux.1 Space
              </label>

              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white/5 hover:bg-white/10 text-zinc-100 border border-white/10 rounded-lg cursor-pointer">
                <Upload className="w-3.5 h-3.5 text-cyan-400" />
                {uploadedCreatorAvatar ? 'Custom Image Ready' : 'Upload Portrait Image'}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => void handleCreatorFileChange(e)}
                  className="hidden"
                />
              </label>

              {uploadedCreatorAvatar && (
                <button
                  type="button"
                  onClick={() => setUploadedCreatorAvatar(undefined)}
                  className="text-xs text-zinc-400 hover:text-white cursor-pointer"
                >
                  Clear Upload
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowCreator(false)}
                className="px-4 py-2 text-xs font-medium text-zinc-400 hover:text-zinc-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isGenerating || !concept.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-500 to-cyan-500 hover:from-indigo-400 hover:to-cyan-400 disabled:opacity-45 text-zinc-950 text-xs font-semibold rounded-xl transition-all cursor-pointer"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Creating Character...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    Save Character
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Character Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {filtered.map((char) => {
          const inActiveCast = activeProjectCharacterIds.includes(char.id);
          const voiceMeta = VOICE_PRESETS.find((v) => v.name === char.voiceName);
          const isFluxBusy = fluxLoadingId === char.id;

          return (
            <div
              key={char.id}
              className="bg-[#111116]/85 border border-white/10 hover:border-indigo-400/35 rounded-2xl p-5 flex flex-col justify-between gap-4 transition-all"
            >
              <div className="flex items-start gap-4">
                <div className="w-24 h-24 rounded-xl overflow-hidden bg-zinc-950 border border-white/10 shrink-0 flex items-center justify-center relative">
                  {char.avatarUrl ? (
                    <img
                      src={char.avatarUrl}
                      alt={char.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center text-xl font-display font-bold text-zinc-100"
                      style={{
                        background: `linear-gradient(135deg, ${char.colorPalette[0] ?? '#1E293B'}, ${
                          char.colorPalette[1] ?? '#09090B'
                        })`,
                      }}
                    >
                      {char.name
                        .split(' ')
                        .map((part) => part[0])
                        .join('')
                        .slice(0, 2)}
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-display font-semibold text-zinc-100 truncate">
                      {char.name}
                    </h3>
                    <div className="flex items-center gap-1 shrink-0">
                      {char.colorPalette.slice(0, 4).map((hex, i) => (
                        <span
                          key={`${hex}-${i}`}
                          title={hex}
                          className="w-3.5 h-3.5 rounded-sm border border-white/15"
                          style={{ backgroundColor: hex }}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="text-xs text-zinc-400 mt-0.5">
                    {char.role} · {char.styleAffinity}
                    {char.avatarSource === 'flux'
                      ? ' · Flux.1 Portrait'
                      : char.avatarSource === 'upload'
                      ? ' · Custom Upload'
                      : ''}
                  </div>
                  <p className="text-xs text-zinc-300 leading-relaxed mt-2 line-clamp-3">
                    {char.appearancePrompt}
                  </p>
                </div>
              </div>

              <div className="pt-3 border-t border-white/10 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
                  <span>
                    Traits:{' '}
                    <span className="text-zinc-200">{char.personalityTraits.join(', ')}</span>
                  </span>
                  <span>
                    Voice: <span className="text-cyan-300">{char.voiceName}</span>{' '}
                    {voiceMeta ? `(${voiceMeta.archetype})` : ''}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={isFluxBusy}
                    onClick={() => void handleGenerateFluxForCard(char)}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-100 rounded-xl transition-colors whitespace-nowrap cursor-pointer disabled:opacity-45"
                  >
                    {isFluxBusy ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                    ) : (
                      <ImageIcon className="w-3.5 h-3.5 text-cyan-400" />
                    )}
                    {isFluxBusy ? 'Rendering Flux.1...' : 'Generate Flux.1'}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setUploadTargetCharId(char.id);
                      cardUploadRef.current?.click();
                    }}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-100 rounded-xl transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5 text-indigo-400" />
                    Upload Portrait
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onToggleCharacterInProject(char.id)}
                    className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl border transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                      inActiveCast
                        ? 'bg-indigo-500/20 border-cyan-400/50 text-cyan-200'
                        : 'bg-zinc-950 hover:bg-white/5 border-white/10 text-zinc-200'
                    }`}
                  >
                    {inActiveCast ? (
                      <>
                        <UserCheck className="w-3.5 h-3.5" />
                        In Active Project Cast
                      </>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        Cast in Active Project
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    disabled={auditioningId === char.id}
                    onClick={() => void handleAuditionVoice(char)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-zinc-950 hover:bg-white/5 border border-white/10 text-zinc-100 rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-45"
                  >
                    {auditioningId === char.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                    ) : (
                      <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
                    )}
                    Audition
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
