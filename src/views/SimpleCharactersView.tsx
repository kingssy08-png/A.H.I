import { useRef, useState } from 'react';
import {
  Grid2x2,
  Loader2,
  Lock,
  Mic,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Unlock,
  Upload,
  User,
  Volume2,
  X,
} from 'lucide-react';
import {
  generateCharacterExpressionSheet,
  generateHfCharacterImage,
  synthesizeVoiceover,
} from '../services/studioApi';
import type {
  AnimationStyle,
  CharacterExpressionView,
  CharacterProfile,
  GeminiVoiceName,
  TalkingVoicePreset,
  VoiceArchetype,
} from '../types/studio';
import { speakWithBrowserTts } from '../utils/audioEngine';

interface SimpleCharactersViewProps {
  characters: CharacterProfile[];
  onAddCharacter: (character: CharacterProfile) => void;
  onUpdateCharacter: (character: CharacterProfile) => void;
  onDeleteCharacter: (characterId: string) => void;
  onUseInCreate: (character: CharacterProfile) => void;
}

const SIMPLE_STYLE_OPTIONS: Array<{ label: string; value: AnimationStyle }> = [
  { label: '3D Animation / Kids', value: '3D Pixar-Style Cartoon' },
  { label: 'Anime', value: 'Anime' },
  { label: 'Cinematic Film', value: 'Cinematic Film' },
  { label: '2D Illustration', value: '2D Illustration' },
  { label: 'Music Video', value: 'Music Video' },
  { label: 'Product Ad', value: 'Product Ad' },
  { label: 'Educational', value: 'Educational' },
];

const VOICE_ARCHETYPES: Array<{
  archetype: VoiceArchetype;
  voiceName: GeminiVoiceName;
  voicePreset: TalkingVoicePreset;
  defaultPitch: number;
  defaultSpeed: number;
  styleNote: string;
}> = [
  {
    archetype: 'Energetic Kid Hero',
    voiceName: 'Puck',
    voicePreset: 'cartoon',
    defaultPitch: 1.08,
    defaultSpeed: 1.05,
    styleNote: 'Bright, upbeat youthful hero bursting with curiosity and warmth',
  },
  {
    archetype: 'Wise Gentle Elder',
    voiceName: 'Fenrir',
    voicePreset: 'mentor',
    defaultPitch: 0.92,
    defaultSpeed: 0.94,
    styleNote: 'Deep, gentle, comforting elder speaking with storybook wisdom',
  },
  {
    archetype: 'Silly Sidekick',
    voiceName: 'Zephyr',
    voicePreset: 'bright',
    defaultPitch: 1.12,
    defaultSpeed: 1.08,
    styleNote: 'Playful comedic cartoon sidekick with lively timing',
  },
  {
    archetype: 'Warm Storyteller',
    voiceName: 'Kore',
    voicePreset: 'female',
    defaultPitch: 1.0,
    defaultSpeed: 1.0,
    styleNote: 'Expressive warm animated character voice with clear diction',
  },
  {
    archetype: 'Curious Explorer',
    voiceName: 'Charon',
    voicePreset: 'male',
    defaultPitch: 0.98,
    defaultSpeed: 1.02,
    styleNote: 'Natural friendly adventurer with confident wonder',
  },
];

const VOICE_OPTIONS: Array<{ id: GeminiVoiceName; label: string }> = [
  { id: 'Puck', label: 'Puck · Kid Hero / Playful' },
  { id: 'Kore', label: 'Kore · Warm Storyteller' },
  { id: 'Zephyr', label: 'Zephyr · Bright Sidekick' },
  { id: 'Charon', label: 'Charon · Explorer Male' },
  { id: 'Fenrir', label: 'Fenrir · Wise Gentle Elder' },
];

function displayStyleLabel(style: AnimationStyle): string {
  const match = SIMPLE_STYLE_OPTIONS.find((s) => s.value === style);
  return match ? match.label : style;
}

function resizeUploadedImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read selected image file.'));
    reader.onload = () => {
      const rawUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!rawUrl) {
        reject(new Error('Invalid image file.'));
        return;
      }
      const img = new Image();
      img.onload = () => {
        const maxSide = 768;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(rawUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/webp', 0.88));
      };
      img.onerror = () => resolve(rawUrl);
      img.src = rawUrl;
    };
    reader.readAsDataURL(file);
  });
}

export function SimpleCharactersView({
  characters,
  onAddCharacter,
  onUpdateCharacter,
  onDeleteCharacter,
  onUseInCreate,
}: SimpleCharactersViewProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingChar, setEditingChar] = useState<CharacterProfile | null>(null);
  const [createMode, setCreateMode] = useState<'generate' | 'upload'>('generate');
  const [name, setName] = useState('');
  const [style, setStyle] = useState<AnimationStyle>('3D Pixar-Style Cartoon');
  const [description, setDescription] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Locked Voice Profile controls
  const [voiceArchetype, setVoiceArchetype] = useState<VoiceArchetype>('Energetic Kid Hero');
  const [voiceName, setVoiceName] = useState<GeminiVoiceName>('Puck');
  const [voicePreset, setVoicePreset] = useState<TalkingVoicePreset>('cartoon');
  const [voicePitch, setVoicePitch] = useState(1.04);
  const [voiceSpeed, setVoiceSpeed] = useState(1.0);
  const [lockedVoice, setLockedVoice] = useState(true);
  const [autoGenerateSheet, setAutoGenerateSheet] = useState(true);
  const [isTestingVoice, setIsTestingVoice] = useState(false);

  const [isGenerating, setIsGenerating] = useState(false);
  const [sheetBusyIds, setSheetBusyIds] = useState<Record<string, boolean>>({});
  const [sheetModalCharId, setSheetModalCharId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const sheetModalChar = characters.find((c) => c.id === sheetModalCharId) ?? null;

  const resetModal = () => {
    setEditingChar(null);
    setCreateMode('generate');
    setName('');
    setStyle('3D Pixar-Style Cartoon');
    setDescription('');
    setPreviewUrl(null);
    setVoiceArchetype('Energetic Kid Hero');
    setVoiceName('Puck');
    setVoicePreset('cartoon');
    setVoicePitch(1.04);
    setVoiceSpeed(1.0);
    setLockedVoice(true);
    setAutoGenerateSheet(true);
    setErrorMsg(null);
    setIsGenerating(false);
  };

  const handleOpenNewModal = () => {
    resetModal();
    setModalOpen(true);
  };

  const handleOpenEditModal = (char: CharacterProfile) => {
    setEditingChar(char);
    setCreateMode(char.avatarSource === 'upload' ? 'upload' : 'generate');
    setName(char.name);
    setStyle(char.styleAffinity);
    setDescription(char.appearancePrompt);
    setPreviewUrl(char.avatarUrl ?? null);
    setVoiceArchetype(char.voiceArchetype ?? 'Warm Storyteller');
    setVoiceName(char.voiceName ?? 'Kore');
    setVoicePreset(char.voicePreset ?? 'female');
    setVoicePitch(char.voicePitch ?? 1.0);
    setVoiceSpeed(char.voiceSpeed ?? 1.0);
    setLockedVoice(char.lockedVoice ?? true);
    setAutoGenerateSheet(false);
    setErrorMsg(null);
    setModalOpen(true);
  };

  const handleSelectArchetype = (arch: VoiceArchetype) => {
    setVoiceArchetype(arch);
    const spec = VOICE_ARCHETYPES.find((a) => a.archetype === arch);
    if (spec) {
      setVoiceName(spec.voiceName);
      setVoicePreset(spec.voicePreset);
      setVoicePitch(spec.defaultPitch);
      setVoiceSpeed(spec.defaultSpeed);
    }
  };

  const handleTestVoice = async () => {
    const sample = `Hi! I'm ${name.trim() || 'your new character'}, ready for our next animated adventure!`;
    const archSpec = VOICE_ARCHETYPES.find((a) => a.archetype === voiceArchetype);
    setIsTestingVoice(true);
    try {
      const res = await synthesizeVoiceover({
        text: sample,
        voiceName,
        styleInstruction: archSpec?.styleNote || 'Expressive animated character voice',
      });
      const audio = new Audio(`data:audio/wav;base64,${res.audioBase64}`);
      void audio.play();
    } catch {
      speakWithBrowserTts(sample, { rate: voiceSpeed, pitch: voicePitch });
    } finally {
      setIsTestingVoice(false);
    }
  };

  const handleGenerate4ViewSheet = async (char: CharacterProfile) => {
    setErrorMsg(null);
    setSheetBusyIds((prev) => ({ ...prev, [char.id]: true }));
    try {
      const res = await generateCharacterExpressionSheet({
        name: char.name,
        appearancePrompt: char.appearancePrompt,
        styleAffinity: char.styleAffinity,
        avatarImageUrl: char.avatarUrl,
      });
      const views: CharacterExpressionView[] = res.expressions ?? [];
      onUpdateCharacter({
        ...char,
        appearancePrompt: res.visualDna?.trim() ? char.appearancePrompt || res.visualDna : char.appearancePrompt,
        expressionSheet: views,
      });
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : `Could not generate 4-view sheet for ${char.name}.`
      );
    } finally {
      setSheetBusyIds((prev) => {
        const next = { ...prev };
        delete next[char.id];
        return next;
      });
    }
  };

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErrorMsg(null);
    try {
      const resized = await resizeUploadedImage(file);
      setPreviewUrl(resized);
      if (!name.trim()) {
        setName(file.name.replace(/\.[^.]+$/, ''));
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not load uploaded photo.');
    }
  };

  const handleGeneratePortrait = async () => {
    const prompt = description.trim();
    if (!prompt) {
      setErrorMsg('Describe how your character looks first.');
      return;
    }
    setErrorMsg(null);
    setIsGenerating(true);
    try {
      const res = await generateHfCharacterImage({
        prompt: `${name.trim() ? `${name.trim()}, ` : ''}${prompt}, consistent character portrait, clean studio background`,
        style,
      });
      setPreviewUrl(res.imageDataUrl);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Could not generate portrait. Please try again.'
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveCharacter = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const charName = name.trim() || 'New Character';
    const charDesc = description.trim() || `${charName} character portrait`;
    const archSpec = VOICE_ARCHETYPES.find((a) => a.archetype === voiceArchetype);

    let finalAvatar = previewUrl;

    if (!finalAvatar) {
      if (createMode === 'upload') {
        setErrorMsg('Choose a photo to upload first.');
        return;
      }
      if (!description.trim()) {
        setErrorMsg('Describe your character or upload a photo.');
        return;
      }
      setIsGenerating(true);
      try {
        const res = await generateHfCharacterImage({
          prompt: `${charName}, ${charDesc}, consistent character portrait, clean studio background`,
          style,
        });
        finalAvatar = res.imageDataUrl;
      } catch (err) {
        setErrorMsg(
          err instanceof Error ? err.message : 'Could not create character right now.'
        );
        setIsGenerating(false);
        return;
      } finally {
        setIsGenerating(false);
      }
    }

    if (editingChar) {
      const updated: CharacterProfile = {
        ...editingChar,
        name: charName,
        styleAffinity: style,
        appearancePrompt: charDesc,
        voiceName,
        voiceStyle: archSpec?.styleNote || editingChar.voiceStyle || 'Natural storytelling voice',
        voiceArchetype,
        voicePreset,
        voicePitch,
        voiceSpeed,
        lockedVoice,
        avatarUrl: finalAvatar,
      };
      onUpdateCharacter(updated);
      setModalOpen(false);
      resetModal();
      return;
    }

    const created: CharacterProfile = {
      id: `char-${Date.now()}`,
      name: charName,
      role: 'Cast Hero',
      styleAffinity: style,
      appearancePrompt: charDesc,
      personalityTraits: ['Expressive'],
      voiceName,
      voiceStyle: archSpec?.styleNote || 'Natural storytelling voice',
      voiceArchetype,
      voicePreset,
      voicePitch,
      voiceSpeed,
      lockedVoice,
      signatureProps: '',
      colorPalette: ['#07090E', '#2DD4BF'],
      avatarUrl: finalAvatar,
      avatarSource: createMode === 'upload' ? 'upload' : 'flux',
    };

    onAddCharacter(created);
    const shouldRunSheet = autoGenerateSheet;
    setModalOpen(false);
    resetModal();

    if (shouldRunSheet) {
      void handleGenerate4ViewSheet(created);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-display font-bold text-[#F8FAFC]">
            Character Library &amp; Model Sheets
          </h1>
          <p className="text-xs text-[#94A3B8]">
            Lock consistent voices, generate 4-view expression sheets (Happy, Surprised,
            Determined, Turnaround), and cast characters across scenes and episodes.
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenNewModal}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#2DD4BF] hover:bg-[#34D399] text-[#07090E] text-xs font-bold shadow-[0_0_20px_rgba(45,212,191,0.22)] transition-all cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          New Character
        </button>
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

      {characters.length === 0 ? (
        <div className="bg-[rgba(17,22,33,0.72)] backdrop-blur-2xl border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] rounded-2xl p-12 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-[#94A3B8]">
            <User className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <div className="text-sm font-display font-semibold text-[#F8FAFC]">
              No characters yet
            </div>
            <p className="text-xs text-[#94A3B8]">
              Create your first character by describing them or uploading a photo.
            </p>
          </div>
          <button
            type="button"
            onClick={handleOpenNewModal}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#2DD4BF] hover:bg-[#34D399] text-[#07090E] text-xs font-bold cursor-pointer transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Character
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {characters.map((char) => {
            const isSheetBusy = Boolean(sheetBusyIds[char.id]);
            const sheetCount = char.expressionSheet?.length ?? 0;
            return (
              <div
                key={char.id}
                className="group bg-[rgba(17,22,33,0.72)] backdrop-blur-2xl border border-white/10 hover:border-[#2DD4BF]/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] hover:shadow-[0_0_24px_rgba(45,212,191,0.12)] rounded-2xl overflow-hidden flex flex-col justify-between transition-all"
              >
                <div>
                  <div className="aspect-square bg-[#07090E] relative overflow-hidden">
                    <img
                      src={char.avatarUrl || '/src/assets/images/char_luna_pilot_1795461026794.jpg'}
                      alt={char.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0B0F18] via-transparent to-transparent" />
                    <span className="absolute top-2.5 left-2.5 px-2.5 py-0.5 rounded-full bg-[#07090E]/75 backdrop-blur-md border border-white/10 text-[10px] font-medium text-[#F8FAFC]">
                      {displayStyleLabel(char.styleAffinity)}
                    </span>

                    <div className="absolute top-2.5 right-2.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(char)}
                        className="p-1.5 rounded-full bg-[#07090E]/80 hover:bg-[#2DD4BF] border border-white/10 text-[#94A3B8] hover:text-[#07090E] transition-colors cursor-pointer"
                        title="Edit character & voice lock"
                        aria-label={`Edit ${char.name}`}
                      >
                        <SlidersHorizontal className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteCharacter(char.id)}
                        className="p-1.5 rounded-full bg-[#07090E]/80 hover:bg-red-500/80 border border-white/10 text-[#94A3B8] hover:text-white transition-colors cursor-pointer"
                        aria-label={`Delete ${char.name}`}
                        title="Delete character"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Locked Voice & 4-View Sheet Mini Overlay */}
                    <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between gap-1.5">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#07090E]/80 backdrop-blur-md border border-[#2DD4BF]/35 text-[10px] font-medium text-[#2DD4BF] truncate">
                        {char.lockedVoice ? (
                          <Lock className="w-2.5 h-2.5 shrink-0" />
                        ) : (
                          <Mic className="w-2.5 h-2.5 shrink-0" />
                        )}
                        <span className="truncate">
                          {char.voiceArchetype || char.voiceName || 'Voice Set'}
                        </span>
                      </span>

                      {isSheetBusy ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#2DD4BF] text-[#07090E] text-[10px] font-bold shrink-0">
                          <Loader2 className="w-2.5 h-2.5 animate-spin" />
                          4-View...
                        </span>
                      ) : (
                        sheetCount > 0 && (
                          <span className="px-2 py-0.5 rounded-full bg-[#07090E]/85 border border-white/15 text-[10px] font-semibold text-[#F8FAFC] shrink-0">
                            {sheetCount} Views
                          </span>
                        )
                      )}
                    </div>
                  </div>

                  <div className="p-4 space-y-1.5">
                    <h2 className="text-sm font-display font-semibold text-[#F8FAFC] truncate">
                      {char.name}
                    </h2>
                    <p className="text-[11px] text-[#94A3B8] line-clamp-2 leading-relaxed">
                      {char.appearancePrompt}
                    </p>
                  </div>
                </div>

                <div className="px-4 pb-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSheetModalCharId(char.id)}
                    className="inline-flex items-center justify-center gap-1 py-2.5 px-2.5 rounded-xl bg-[#07090E]/75 hover:border-[#2DD4BF]/45 border border-white/10 text-[#F8FAFC] text-[11px] font-semibold transition-colors cursor-pointer"
                  >
                    <Grid2x2 className="w-3.5 h-3.5 text-[#2DD4BF]" />
                    4-View Sheet
                  </button>
                  <button
                    type="button"
                    onClick={() => onUseInCreate(char)}
                    className="py-2.5 px-2.5 rounded-xl bg-[#2DD4BF] hover:bg-[#34D399] text-[#07090E] text-[11px] font-bold transition-colors cursor-pointer"
                  >
                    Use in Create
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 4-View Expression & Turnaround Consistency Modal */}
      {sheetModalChar && (
        <div
          className="fixed inset-0 z-50 bg-[#07090E]/85 backdrop-blur-md flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSheetModalCharId(null);
          }}
        >
          <div className="w-full max-w-2xl bg-[rgba(17,22,33,0.92)] backdrop-blur-2xl border border-white/10 rounded-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_24px_64px_rgba(0,0,0,0.75)] overflow-hidden">
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={sheetModalChar.avatarUrl || '/src/assets/images/char_luna_pilot_1795461026794.jpg'}
                  alt={sheetModalChar.name}
                  className="w-10 h-10 rounded-xl object-cover border border-[#2DD4BF]/40 shrink-0"
                />
                <div className="min-w-0">
                  <h2 className="text-sm font-display font-bold text-[#F8FAFC] truncate">
                    {sheetModalChar.name} · 4-View Expression &amp; Turnaround Sheet
                  </h2>
                  <p className="text-[11px] text-[#94A3B8] truncate">
                    Locked Voice: {sheetModalChar.voiceArchetype || sheetModalChar.voiceName} · Pitch{' '}
                    {(sheetModalChar.voicePitch ?? 1).toFixed(2)}x
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSheetModalCharId(null)}
                className="p-1.5 rounded-lg text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-white/5 cursor-pointer"
                aria-label="Close model sheet"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
              {sheetBusyIds[sheetModalChar.id] ? (
                <div className="py-12 text-center space-y-3">
                  <Loader2 className="w-8 h-8 animate-spin text-[#2DD4BF] mx-auto" />
                  <div className="text-sm font-semibold text-[#F8FAFC]">
                    Extracting visual DNA &amp; rendering 4 consistent angles...
                  </div>
                  <p className="text-xs text-[#94A3B8]">
                    Generating Happy, Surprised, Determined, and Turnaround views for{' '}
                    {sheetModalChar.name}.
                  </p>
                </div>
              ) : (sheetModalChar.expressionSheet?.length ?? 0) > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {sheetModalChar.expressionSheet!.map((view) => (
                    <div
                      key={view.expression}
                      className="bg-[#07090E]/75 border border-white/10 rounded-xl overflow-hidden"
                    >
                      <div className="aspect-square bg-black">
                        <img
                          src={view.imageUrl}
                          alt={`${sheetModalChar.name} - ${view.expression}`}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="px-2.5 py-2 text-center text-[11px] font-semibold text-[#2DD4BF]">
                        {view.expression}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-[#07090E]/75 border border-dashed border-white/15 rounded-2xl p-8 text-center space-y-3">
                  <Grid2x2 className="w-7 h-7 text-[#2DD4BF] mx-auto" />
                  <div className="text-sm font-semibold text-[#F8FAFC]">
                    No 4-view expression sheet generated yet
                  </div>
                  <p className="text-xs text-[#94A3B8] max-w-md mx-auto">
                    Generate a matching 4-view consistency sheet (Happy, Surprised, Determined, and
                    Side/Back Turnaround) so every episode shot keeps {sheetModalChar.name}
                    &apos;s proportions and outfit identical.
                  </p>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => {
                    const target = sheetModalChar;
                    setSheetModalCharId(null);
                    handleOpenEditModal(target);
                  }}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-[#F8FAFC] cursor-pointer"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-[#2DD4BF]" />
                  Edit Voice Lock &amp; Bio
                </button>

                <button
                  type="button"
                  disabled={Boolean(sheetBusyIds[sheetModalChar.id])}
                  onClick={() => void handleGenerate4ViewSheet(sheetModalChar)}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#2DD4BF] hover:bg-[#34D399] disabled:opacity-45 text-[#07090E] text-xs font-bold cursor-pointer transition-colors"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${
                      sheetBusyIds[sheetModalChar.id] ? 'animate-spin' : ''
                    }`}
                  />
                  {(sheetModalChar.expressionSheet?.length ?? 0) > 0
                    ? 'Regenerate 4-View Sheet'
                    : 'Generate 4-View Sheet'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New / Edit Character & Locked Voice Profile Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 bg-[#07090E]/80 backdrop-blur-md flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-char-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !isGenerating) setModalOpen(false);
          }}
        >
          <div className="w-full max-w-xl bg-[rgba(17,22,33,0.92)] backdrop-blur-2xl border border-white/10 rounded-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_24px_64px_rgba(0,0,0,0.75)] overflow-hidden">
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
              <h2
                id="new-char-modal-title"
                className="text-sm font-display font-semibold text-[#F8FAFC]"
              >
                {editingChar ? `Edit ${editingChar.name}` : 'New Character & Voice Profile'}
              </h2>
              <button
                type="button"
                disabled={isGenerating}
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-white/5 cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => void handleSaveCharacter(e)}
              className="p-6 space-y-4 max-h-[84vh] overflow-y-auto text-xs"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => void handleUploadFile(e)}
                className="hidden"
              />

              {/* Mode Switch: Describe vs Upload */}
              <div className="grid grid-cols-2 p-1 bg-[#07090E]/75 border border-white/10 rounded-xl">
                <button
                  type="button"
                  onClick={() => setCreateMode('generate')}
                  className={`inline-flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    createMode === 'generate'
                      ? 'bg-[#2DD4BF] text-[#07090E]'
                      : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Describe &amp; Generate
                </button>
                <button
                  type="button"
                  onClick={() => setCreateMode('upload')}
                  className={`inline-flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    createMode === 'upload'
                      ? 'bg-[#2DD4BF] text-[#07090E]'
                      : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" />
                  Upload Photo
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-[#F8FAFC] font-medium">Character Name</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., Captain Kai"
                    className="w-full bg-[#07090E]/75 border border-white/10 focus:border-[#2DD4BF]/60 rounded-xl px-3.5 py-2.5 text-sm text-[#F8FAFC] placeholder-[#64748B] focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[#F8FAFC] font-medium">Visual Style</label>
                  <select
                    value={style}
                    onChange={(e) => setStyle(e.target.value as AnimationStyle)}
                    className="w-full bg-[#07090E]/75 border border-white/10 focus:border-[#2DD4BF]/60 rounded-xl px-3.5 py-2.5 text-xs text-[#F8FAFC] focus:outline-none"
                  >
                    {SIMPLE_STYLE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value} className="bg-[#0B0F18]">
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {createMode === 'generate' ? (
                <div className="space-y-2">
                  <label className="block text-[#F8FAFC] font-medium">
                    Describe Appearance
                  </label>
                  <textarea
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="e.g., Cheerful red fox wearing brass pilot goggles and a warm emerald scarf..."
                    className="w-full bg-[#07090E]/75 border border-white/10 focus:border-[#2DD4BF]/60 rounded-xl p-3 text-xs text-[#F8FAFC] placeholder-[#64748B] focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={isGenerating || !description.trim()}
                    onClick={() => void handleGeneratePortrait()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 hover:border-[#2DD4BF]/40 disabled:opacity-45 text-[#F8FAFC] font-medium cursor-pointer transition-colors"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[#2DD4BF]" />
                        Creating Portrait...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-[#2DD4BF]" />
                        {previewUrl ? 'Regenerate Preview' : 'Generate Preview'}
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-5 px-4 rounded-2xl border border-dashed border-white/15 hover:border-[#2DD4BF]/60 bg-[#07090E]/75 text-center space-y-2 transition-colors cursor-pointer"
                  >
                    <Upload className="w-5 h-5 text-[#2DD4BF] mx-auto" />
                    <div className="text-xs font-medium text-[#F8FAFC]">
                      Click to choose a PNG, JPG, or WebP photo
                    </div>
                  </button>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Optional appearance notes (e.g., silver jacket, curly hair)"
                    className="w-full bg-[#07090E]/75 border border-white/10 focus:border-[#2DD4BF]/60 rounded-xl px-3.5 py-2 text-xs text-[#F8FAFC] placeholder-[#64748B] focus:outline-none"
                  />
                </div>
              )}

              {previewUrl && (
                <div className="flex items-center gap-3 p-3 rounded-2xl bg-[#07090E]/75 border border-white/10">
                  <img
                    src={previewUrl}
                    alt={name || 'Character preview'}
                    className="w-16 h-16 rounded-xl object-cover shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-[#F8FAFC] truncate">
                      {name.trim() || 'Character Ready'}
                    </div>
                    <div className="text-[11px] text-[#94A3B8]">
                      Portrait ready · 4-view sheet matches this visual identity
                    </div>
                  </div>
                </div>
              )}

              {/* Locked Voice Profile Section */}
              <div className="bg-[#07090E]/75 border border-white/10 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-[#F8FAFC] flex items-center gap-1.5">
                    <Mic className="w-3.5 h-3.5 text-[#2DD4BF]" />
                    Locked Voice Profile
                  </span>
                  <button
                    type="button"
                    onClick={() => setLockedVoice((v) => !v)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer transition-colors ${
                      lockedVoice
                        ? 'bg-[#2DD4BF]/15 border-[#2DD4BF]/50 text-[#2DD4BF]'
                        : 'bg-white/5 border-white/10 text-[#94A3B8]'
                    }`}
                  >
                    {lockedVoice ? (
                      <>
                        <Lock className="w-3 h-3" />
                        Locked Across Episodes
                      </>
                    ) : (
                      <>
                        <Unlock className="w-3 h-3" />
                        Unlocked
                      </>
                    )}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] text-[#94A3B8] mb-1">
                      Character Archetype
                    </label>
                    <select
                      value={voiceArchetype}
                      onChange={(e) => handleSelectArchetype(e.target.value as VoiceArchetype)}
                      className="w-full bg-[rgba(17,22,33,0.85)] border border-white/10 rounded-xl px-3 py-2 text-xs text-[#F8FAFC] focus:outline-none focus:border-[#2DD4BF]/50"
                    >
                      {VOICE_ARCHETYPES.map((a) => (
                        <option key={a.archetype} value={a.archetype} className="bg-[#0B0F18]">
                          {a.archetype}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] text-[#94A3B8] mb-1">
                      Voice Talent
                    </label>
                    <select
                      value={voiceName}
                      onChange={(e) => setVoiceName(e.target.value as GeminiVoiceName)}
                      className="w-full bg-[rgba(17,22,33,0.85)] border border-white/10 rounded-xl px-3 py-2 text-xs text-[#F8FAFC] focus:outline-none focus:border-[#2DD4BF]/50"
                    >
                      {VOICE_OPTIONS.map((v) => (
                        <option key={v.id} value={v.id} className="bg-[#0B0F18]">
                          {v.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 items-center">
                  <div>
                    <div className="flex justify-between text-[11px] text-[#94A3B8] mb-1">
                      <span>Pitch</span>
                      <span className="text-[#F8FAFC] tabular-nums">{voicePitch.toFixed(2)}x</span>
                    </div>
                    <input
                      type="range"
                      min={0.8}
                      max={1.2}
                      step={0.02}
                      value={voicePitch}
                      onChange={(e) => setVoicePitch(Number(e.target.value))}
                      className="w-full accent-[#2DD4BF]"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-[11px] text-[#94A3B8] mb-1">
                      <span>Speed</span>
                      <span className="text-[#F8FAFC] tabular-nums">{voiceSpeed.toFixed(2)}x</span>
                    </div>
                    <input
                      type="range"
                      min={0.85}
                      max={1.15}
                      step={0.02}
                      value={voiceSpeed}
                      onChange={(e) => setVoiceSpeed(Number(e.target.value))}
                      className="w-full accent-[#2DD4BF]"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  {!editingChar ? (
                    <label className="inline-flex items-center gap-2 text-[11px] text-[#F8FAFC] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoGenerateSheet}
                        onChange={(e) => setAutoGenerateSheet(e.target.checked)}
                        className="accent-[#2DD4BF] rounded"
                      />
                      Auto-generate 4-View Expression Sheet on save
                    </label>
                  ) : (
                    <span className="text-[11px] text-[#94A3B8]">
                      Voice changes apply to future Talking &amp; Episode lines
                    </span>
                  )}

                  <button
                    type="button"
                    disabled={isTestingVoice}
                    onClick={() => void handleTestVoice()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 text-[11px] font-medium text-[#F8FAFC] cursor-pointer"
                  >
                    <Volume2 className="w-3.5 h-3.5 text-[#2DD4BF]" />
                    {isTestingVoice ? 'Playing...' : 'Test Voice'}
                  </button>
                </div>
              </div>

              {errorMsg && (
                <div className="rounded-xl bg-red-950/50 border border-red-500/40 px-3.5 py-2.5 text-red-200">
                  {errorMsg}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={isGenerating}
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-[#94A3B8] hover:text-[#F8FAFC] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isGenerating}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[#2DD4BF] hover:bg-[#34D399] disabled:opacity-45 text-[#07090E] font-bold cursor-pointer transition-colors"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Saving...
                    </>
                  ) : editingChar ? (
                    'Update Character'
                  ) : (
                    'Save Character'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
