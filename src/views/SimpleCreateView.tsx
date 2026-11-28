import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Film,
  Image as ImageIcon,
  Layers,
  Loader2,
  MessageSquareQuote,
  Mic,
  Monitor,
  Palette,
  Plus,
  RotateCcw,
  Scissors,
  SlidersHorizontal,
  Sparkles,
  Square,
  Trash2,
  Upload,
  Users,
  Video,
  Volume2,
  X,
} from 'lucide-react';
import { AhiGenerationLoader } from '../components/AhiLoaders';
import {
  generateHfImage,
  generateHfVideoClip,
  generateTalkingSceneClip,
  removeImageBackground,
  synthesizeVoiceover,
  type TalkingShotAngle,
  type TalkingVoicePreset,
} from '../services/studioApi';
import type {
  AnimationStyle,
  AspectRatio,
  CameraMotion,
  CharacterProfile,
  GeminiVoiceName,
  ImageQualityTier,
  ReferenceRole,
  StudioCreation,
  VideoReferenceItem,
} from '../types/studio';
import { speakWithBrowserTts } from '../utils/audioEngine';
import { stitchConversationClipsWithFfmpeg } from '../utils/projectExporter';

export interface CreatePresetPayload {
  prompt?: string;
  mode?: 'image' | 'video' | 'talking';
  style?: AnimationStyle | string;
  aspectRatio?: AspectRatio;
  cameraMotion?: CameraMotion;
  resultUrl?: string;
  openAttachPicker?: boolean;
  referenceItem?: VideoReferenceItem;
}

interface SimpleCreateViewProps {
  characters: CharacterProfile[];
  creations?: StudioCreation[];
  preselectedCharacter?: CharacterProfile | null;
  onClearPreselectedCharacter?: () => void;
  pendingPreset?: CreatePresetPayload | null;
  onClearPendingPreset?: () => void;
  onSaveCreation?: (creation: StudioCreation) => void;
  onAddClipToEpisode?: (clip: { videoUrl: string; prompt: string; dialogue?: string }) => void;
  sidebarExpanded?: boolean;
  defaultAspectRatio?: AspectRatio;
}

type SimpleStyleLabel =
  | 'Warm Storybook 3D'
  | 'Enchanted Storybook'
  | '3D Animation / Kids'
  | 'Anime'
  | 'Cinematic Film'
  | '2D Illustration'
  | 'Music Video'
  | 'Product Ad'
  | 'Educational';
type SimpleCameraLabel = 'Auto' | 'Zoom In' | 'Pan' | 'Orbit';
type SimpleSizeLabel = '16:9 YouTube' | '9:16 TikTok/Reels' | '1:1 Square';

const MAX_REFERENCES = 8;

const REFERENCE_ROLES: ReferenceRole[] = [
  'Character',
  'Outfit / Prop',
  'Background / Scene',
  'Style',
];

const STYLE_MAP: Record<SimpleStyleLabel, AnimationStyle> = {
  'Warm Storybook 3D': 'Warm Storybook 3D',
  'Enchanted Storybook': 'Enchanted Storybook',
  '3D Animation / Kids': '3D Pixar-Style Cartoon',
  Anime: 'Anime',
  'Cinematic Film': 'Cinematic Film',
  '2D Illustration': '2D Illustration',
  'Music Video': 'Music Video',
  'Product Ad': 'Product Ad',
  Educational: 'Educational',
};

const QUALITY_OPTIONS: Array<{ value: ImageQualityTier; label: string }> = [
  { value: 'standard', label: 'Standard' },
  { value: 'high', label: 'High' },
  { value: 'ultra', label: 'Ultra' },
];

const CAMERA_MAP: Record<SimpleCameraLabel, CameraMotion> = {
  Auto: 'Auto',
  'Zoom In': 'Zoom In',
  Pan: 'Pan Right',
  Orbit: 'Orbit',
};

const SIZE_MAP: Record<SimpleSizeLabel, AspectRatio> = {
  '16:9 YouTube': '16:9',
  '9:16 TikTok/Reels': '9:16',
  '1:1 Square': '1:1',
};

function aspectRatioToSizeLabel(ratio?: AspectRatio): SimpleSizeLabel {
  if (ratio === '9:16') return '9:16 TikTok/Reels';
  if (ratio === '1:1') return '1:1 Square';
  return '16:9 YouTube';
}

const STARTER_EXAMPLES: Array<{
  id: string;
  title: string;
  mode: 'image' | 'video';
  style: SimpleStyleLabel;
  size: SimpleSizeLabel;
  camera: SimpleCameraLabel;
  prompt: string;
  previewUrl: string;
}> = [
  {
    id: 'ex-1',
    title: 'Clockwork Rooftop Workshop',
    mode: 'image',
    style: '3D Animation / Kids',
    size: '16:9 YouTube',
    camera: 'Zoom In',
    prompt:
      'A cozy rooftop workshop filled with glowing glass lanterns and brass gears overlooking a coastal town at twilight',
    previewUrl: '/src/assets/images/style_3d_cartoon_1795461025240.jpg',
  },
  {
    id: 'ex-2',
    title: 'Sunset Ocean Train Station',
    mode: 'video',
    style: 'Anime',
    size: '16:9 YouTube',
    camera: 'Pan',
    prompt:
      'A silver passenger train arriving at a seaside platform under towering sunset clouds with warm harbor reflections',
    previewUrl: '/src/assets/images/style_anime_1795461026386.jpg',
  },
  {
    id: 'ex-3',
    title: 'Luxury Obsidian Watch Ad',
    mode: 'image',
    style: 'Product Ad',
    size: '9:16 TikTok/Reels',
    camera: 'Orbit',
    prompt:
      'A sleek matte-black mechanical watch floating above wet dark stone with crisp studio rim lighting',
    previewUrl: '/src/assets/images/showcase_product_ad_1795462965806.jpg',
  },
  {
    id: 'ex-4',
    title: 'Neon Rain Overpass Film',
    mode: 'video',
    style: 'Cinematic Film',
    size: '16:9 YouTube',
    camera: 'Orbit',
    prompt:
      'Moody anamorphic twilight shot of a rain-slicked city overpass glowing with electric cyan reflections and drifting mist',
    previewUrl: '/src/assets/images/showcase_cinematic_film_1795462965824.jpg',
  },
];

const SCENE_LIBRARY_REFS: Array<{
  id: string;
  label: string;
  imageUrl: string;
  defaultRole: ReferenceRole;
  description: string;
}> = [
  {
    id: 'scene-ref-enchanted-glade',
    label: 'Enchanted Forest Glade',
    imageUrl: '/src/assets/images/style_enchanted_storybook_1795855536212.jpg',
    defaultRole: 'Background / Scene',
    description:
      'Enchanted fairy-tale woodland glade with golden volumetric sunbeams through mossy ancient trees, fireflies, wildflowers, ferns, and mushrooms',
  },
  {
    id: 'scene-ref-workshop',
    label: 'Clockwork Workshop',
    imageUrl: '/src/assets/images/style_3d_cartoon_1795461025240.jpg',
    defaultRole: 'Background / Scene',
    description: 'Warm timber rooftop workshop with glowing Edison lanterns and brass gears at twilight',
  },
  {
    id: 'scene-ref-overpass',
    label: 'Neon Rain Overpass',
    imageUrl: '/src/assets/images/showcase_cinematic_film_1795462965824.jpg',
    defaultRole: 'Background / Scene',
    description: 'Rain-slicked midnight highway overpass with electric cyan and indigo reflections',
  },
  {
    id: 'scene-ref-station',
    label: 'Coastal Train Platform',
    imageUrl: '/src/assets/images/style_anime_1795461026386.jpg',
    defaultRole: 'Background / Scene',
    description: 'Elevated seaside anime train platform beneath towering sunset clouds',
  },
  {
    id: 'scene-ref-conservatory',
    label: 'Moonlit Conservatory',
    imageUrl: '/src/assets/images/showcase_2d_illustration_1795462965789.jpg',
    defaultRole: 'Style',
    description: 'Painterly 2D gouache glass greenhouse glowing in an indigo twilight forest',
  },
  {
    id: 'scene-ref-watch',
    label: 'Obsidian Studio Stage',
    imageUrl: '/src/assets/images/showcase_product_ad_1795462965806.jpg',
    defaultRole: 'Style',
    description: 'Sleek dark basalt commercial studio stage with crisp cyan rim lighting',
  },
  {
    id: 'scene-ref-orbital',
    label: 'Orbital Lab Stage',
    imageUrl: '/src/assets/images/style_educational_1795461025982.jpg',
    defaultRole: 'Background / Scene',
    description: 'Clean glowing 3D orbital rings and brass planets inside a dark educational void',
  },
];

const SIMPLE_VOICES: Array<{ id: GeminiVoiceName; label: string }> = [
  { id: 'Kore', label: 'Warm Narrator' },
  { id: 'Puck', label: 'Upbeat Hero' },
  { id: 'Charon', label: 'Deep Mentor' },
  { id: 'Zephyr', label: 'Bright Host' },
];

function readAndResizeImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.onload = () => {
      const rawUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!rawUrl) {
        reject(new Error(`Invalid image file: ${file.name}`));
        return;
      }
      const img = new Image();
      img.onload = () => {
        const maxSide = 1600;
        if (Math.max(img.width, img.height) <= maxSide) {
          resolve(rawUrl);
          return;
        }
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
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);
        const outputMime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        resolve(canvas.toDataURL(outputMime, 0.96));
      };
      img.onerror = () => resolve(rawUrl);
      img.src = rawUrl;
    };
    reader.readAsDataURL(file);
  });
}

const TALKING_VOICE_OPTIONS: Array<{ id: TalkingVoicePreset; label: string }> = [
  { id: 'female', label: 'Female (Warm)' },
  { id: 'male', label: 'Male (Natural)' },
  { id: 'cartoon', label: 'Child / Cartoon' },
  { id: 'mentor', label: 'Deep Mentor' },
  { id: 'bright', label: 'Bright Host' },
];

const SHOT_ANGLE_OPTIONS: Array<{ id: TalkingShotAngle; label: string }> = [
  { id: 'close-up', label: 'Close-Up on Speaker' },
  { id: 'two-shot', label: 'Two-Shot Together' },
  { id: 'over-shoulder', label: 'Over-the-Shoulder' },
];

function resolveCharVoicePreset(char?: CharacterProfile): TalkingVoicePreset {
  if (!char) return 'female';
  if (char.voicePreset) return char.voicePreset;
  if (char.voiceName === 'Charon') return 'male';
  if (char.voiceName === 'Puck') return 'cartoon';
  if (char.voiceName === 'Fenrir') return 'mentor';
  if (char.voiceName === 'Zephyr') return 'bright';
  return 'female';
}

interface TalkingCastSlot {
  id: string;
  characterId?: string;
  label: string;
  imageUrl: string;
  voicePreset: TalkingVoicePreset;
  voiceName?: GeminiVoiceName;
  voiceStyle?: string;
  voicePitch?: number;
  voiceSpeed?: number;
  lockedVoice?: boolean;
}

interface TalkingScriptLine {
  id: string;
  speakerId: string;
  text: string;
  shotAngle: TalkingShotAngle;
  voiceOverride?: TalkingVoicePreset;
  customAudioBase64?: string;
  customAudioLabel?: string;
}

export function SimpleCreateView({
  characters,
  creations = [],
  preselectedCharacter,
  onClearPreselectedCharacter,
  pendingPreset,
  onClearPendingPreset,
  onSaveCreation,
  onAddClipToEpisode,
  sidebarExpanded = false,
  defaultAspectRatio = '16:9',
}: SimpleCreateViewProps) {
  const [mode, setMode] = useState<'image' | 'video' | 'talking'>('image');
  const [prompt, setPrompt] = useState('');
  const [styleLabel, setStyleLabel] = useState<SimpleStyleLabel>('3D Animation / Kids');
  const [cameraLabel, setCameraLabel] = useState<SimpleCameraLabel>('Auto');
  const [sizeLabel, setSizeLabel] = useState<SimpleSizeLabel>(() =>
    aspectRatioToSizeLabel(defaultAspectRatio)
  );
  const [qualityTier, setQualityTier] = useState<ImageQualityTier>('high');

  useEffect(() => {
    setSizeLabel(aspectRatioToSizeLabel(defaultAspectRatio));
  }, [defaultAspectRatio]);

  const [attachedRefs, setAttachedRefs] = useState<VideoReferenceItem[]>([]);
  const [removeRefBackground, setRemoveRefBackground] = useState(true);
  const [removingBgIds, setRemovingBgIds] = useState<Record<string, boolean>>({});
  const [showAttachPicker, setShowAttachPicker] = useState(false);
  const [pickerTab, setPickerTab] = useState<'characters' | 'scenes'>('characters');
  const [pickerTarget, setPickerTarget] = useState<
    'refs' | { type: 'talking-cast'; castId: string } | 'talking-bg'
  >('refs');
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [dragRefIndex, setDragRefIndex] = useState<number | null>(null);

  // Talking Scene & Multi-Character Conversation State
  const defaultCastChar = characters[0];
  const [talkingCast, setTalkingCast] = useState<TalkingCastSlot[]>(() => [
    {
      id: 'cast-1',
      characterId: defaultCastChar?.id,
      label: defaultCastChar?.name || 'Character 1',
      imageUrl:
        defaultCastChar?.avatarUrl || '/src/assets/images/char_luna_pilot_1795461026794.jpg',
      voicePreset: resolveCharVoicePreset(defaultCastChar),
      voiceName: defaultCastChar?.voiceName,
      voiceStyle: defaultCastChar?.voiceStyle,
      voicePitch: defaultCastChar?.voicePitch,
      voiceSpeed: defaultCastChar?.voiceSpeed,
      lockedVoice: defaultCastChar?.lockedVoice,
    },
  ]);
  const [talkingBgImageUrl, setTalkingBgImageUrl] = useState<string | null>(
    '/src/assets/images/style_3d_cartoon_1795461025240.jpg'
  );
  const [talkingBgLabel, setTalkingBgLabel] = useState('Clockwork Workshop');
  const [talkingBgPrompt, setTalkingBgPrompt] = useState('');
  const [isGeneratingBg, setIsGeneratingBg] = useState(false);
  const [dialogueLines, setDialogueLines] = useState<TalkingScriptLine[]>([
    {
      id: 'line-1',
      speakerId: 'cast-1',
      text: '',
      shotAngle: 'close-up',
    },
  ]);
  const [recordingLineId, setRecordingLineId] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [result, setResult] = useState<{
    type: 'image' | 'video';
    url: string;
    prompt: string;
    aspectRatio: AspectRatio;
    width?: number;
    height?: number;
    qualityLabel?: string;
    modelLabel?: string;
    isTalking?: boolean;
    dialogueSummary?: string;
    compositedPreviewUrl?: string;
  } | null>(null);

  // Lightweight inline Add Voice drawer
  const [voiceDrawerOpen, setVoiceDrawerOpen] = useState(false);
  const [voiceLine, setVoiceLine] = useState('');
  const [selectedVoice, setSelectedVoice] = useState<GeminiVoiceName>('Kore');
  const [isGeneratingVoice, setIsGeneratingVoice] = useState(false);
  const [voiceAudioUrl, setVoiceAudioUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const talkingCastUploadRef = useRef<HTMLInputElement | null>(null);
  const talkingBgUploadRef = useRef<HTMLInputElement | null>(null);
  const talkingAudioUploadRef = useRef<HTMLInputElement | null>(null);
  const uploadTargetCastIdRef = useRef<string | null>(null);
  const uploadTargetLineIdRef = useRef<string | null>(null);
  const dragDepthRef = useRef(0);

  const appendReferences = useCallback((incoming: VideoReferenceItem[]) => {
    setAttachedRefs((prev) => {
      const next = [...prev];
      for (const item of incoming) {
        if (next.length >= MAX_REFERENCES) break;
        if (!next.some((existing) => existing.id === item.id)) {
          next.push(item);
        }
      }
      return next;
    });
  }, []);

  const buildCharacterRefDescription = (char: CharacterProfile): string => {
    const parts = [char.appearancePrompt?.trim()].filter(Boolean);
    if (char.signatureProps?.trim()) {
      parts.push(`Signature accessories/props: ${char.signatureProps.trim()}`);
    }
    if (char.colorPalette && char.colorPalette.length > 0) {
      parts.push(`Color palette: ${char.colorPalette.join(', ')}`);
    }
    return parts.join('. ');
  };

  useEffect(() => {
    if (preselectedCharacter) {
      const fullDesc = buildCharacterRefDescription(preselectedCharacter);
      const charItem: VideoReferenceItem = {
        id: `char-ref-${preselectedCharacter.id}`,
        imageUrl:
          preselectedCharacter.avatarUrl || '/src/assets/images/char_luna_pilot_1795461026794.jpg',
        label: preselectedCharacter.name,
        role: 'Character',
        description: fullDesc,
      };
      appendReferences([charItem]);
      if (!prompt.trim()) {
        setPrompt(
          `${preselectedCharacter.name} (${preselectedCharacter.appearancePrompt}) in a cinematic scene`
        );
      }
      onClearPreselectedCharacter?.();
    }
  }, [preselectedCharacter, onClearPreselectedCharacter, prompt, appendReferences]);

  useEffect(() => {
    if (!pendingPreset) return;
    if (pendingPreset.prompt !== undefined) {
      setPrompt(pendingPreset.prompt);
    }
    if (pendingPreset.mode) {
      setMode(pendingPreset.mode);
    }
    if (pendingPreset.openAttachPicker !== undefined) {
      setShowAttachPicker(pendingPreset.openAttachPicker);
    }
    if (pendingPreset.style) {
      const matchedStyle = (Object.entries(STYLE_MAP) as Array<[SimpleStyleLabel, AnimationStyle]>).find(
        ([label, val]) => label === pendingPreset.style || val === pendingPreset.style
      );
      if (matchedStyle) {
        setStyleLabel(matchedStyle[0]);
      } else if (pendingPreset.style === '3D Cartoon') {
        setStyleLabel('3D Animation / Kids');
      } else if (pendingPreset.style === 'Realistic') {
        setStyleLabel('Cinematic Film');
      } else if (pendingPreset.style === '2D') {
        setStyleLabel('2D Illustration');
      }
    }
    if (pendingPreset.cameraMotion) {
      const matchedCam = (Object.entries(CAMERA_MAP) as Array<[SimpleCameraLabel, CameraMotion]>).find(
        ([, val]) => val === pendingPreset.cameraMotion
      );
      if (matchedCam) {
        setCameraLabel(matchedCam[0]);
      } else if (pendingPreset.cameraMotion === 'Pan Left') {
        setCameraLabel('Pan');
      }
    }
    if (pendingPreset.aspectRatio) {
      const matchedSize = (Object.entries(SIZE_MAP) as Array<[SimpleSizeLabel, AspectRatio]>).find(
        ([, val]) => val === pendingPreset.aspectRatio
      );
      if (matchedSize) {
        setSizeLabel(matchedSize[0]);
      }
    }
    if (pendingPreset.referenceItem) {
      appendReferences([pendingPreset.referenceItem]);
    }
    if (pendingPreset.resultUrl) {
      setResult({
        type:
          pendingPreset.mode === 'video' || pendingPreset.mode === 'talking'
            ? 'video'
            : 'image',
        url: pendingPreset.resultUrl,
        prompt: pendingPreset.prompt ?? '',
        aspectRatio: pendingPreset.aspectRatio ?? '16:9',
        isTalking: pendingPreset.mode === 'talking',
      });
    } else if (pendingPreset.prompt !== undefined) {
      setResult(null);
    }
    onClearPendingPreset?.();
  }, [pendingPreset, onClearPendingPreset, appendReferences]);

  const handleFilesSelected = async (files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (imageFiles.length === 0) return;

    const availableSlots = MAX_REFERENCES - attachedRefs.length;
    if (availableSlots <= 0) {
      setErrorMessage(`You can attach up to ${MAX_REFERENCES} reference images at once.`);
      return;
    }

    const slice = imageFiles.slice(0, availableSlots);
    try {
      const resized = await Promise.all(
        slice.map(async (file, idx) => {
          const dataUrl = await readAndResizeImageFile(file);
          const nextIdx = attachedRefs.length + idx;
          const inferredRole: ReferenceRole =
            nextIdx === 0 ? 'Character' : nextIdx === 1 ? 'Outfit / Prop' : 'Background / Scene';
          return {
            id: `upload-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
            imageUrl: dataUrl,
            label: file.name.replace(/\.[^.]+$/, '').slice(0, 28) || `Image ${nextIdx + 1}`,
            role: inferredRole,
          } satisfies VideoReferenceItem;
        })
      );
      appendReferences(resized);
      if (imageFiles.length > availableSlots) {
        setErrorMessage(`Added ${availableSlots} images (limit is ${MAX_REFERENCES} references).`);
      } else {
        setErrorMessage(null);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not load selected images.');
    }
  };

  const handleUploadPhotosInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      void handleFilesSelected(files);
    }
    e.target.value = '';
  };

  const handleCanvasDragEnter = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    setIsDraggingFiles(true);
  };

  const handleCanvasDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
  };

  const handleCanvasDragLeave = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDraggingFiles(false);
    }
  };

  const handleCanvasDrop = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    dragDepthRef.current = 0;
    setIsDraggingFiles(false);
    if (e.dataTransfer.files?.length > 0) {
      void handleFilesSelected(e.dataTransfer.files);
    }
  };

  const removeReference = (id: string) => {
    setAttachedRefs((prev) => prev.filter((item) => item.id !== id));
  };

  const updateReferenceRole = (id: string, role: ReferenceRole) => {
    setAttachedRefs((prev) => prev.map((item) => (item.id === id ? { ...item, role } : item)));
  };

  const moveReference = (fromIdx: number, toIdx: number) => {
    setAttachedRefs((prev) => {
      if (toIdx < 0 || toIdx >= prev.length || fromIdx === toIdx) return prev;
      const copy = [...prev];
      const [moved] = copy.splice(fromIdx, 1);
      copy.splice(toIdx, 0, moved);
      return copy;
    });
  };

  const handleToggleRefCardBgRemoval = async (refItem: VideoReferenceItem) => {
    if (refItem.backgroundRemoved && refItem.originalImageUrl) {
      setAttachedRefs((prev) =>
        prev.map((item) =>
          item.id === refItem.id
            ? {
                ...item,
                imageUrl: item.originalImageUrl!,
                backgroundRemoved: false,
              }
            : item
        )
      );
      return;
    }

    setRemovingBgIds((prev) => ({ ...prev, [refItem.id]: true }));
    setErrorMessage(null);
    try {
      const res = await removeImageBackground(refItem.imageUrl);
      setAttachedRefs((prev) =>
        prev.map((item) =>
          item.id === refItem.id
            ? {
                ...item,
                originalImageUrl: item.originalImageUrl ?? item.imageUrl,
                imageUrl: res.imageDataUrl,
                backgroundRemoved: true,
              }
            : item
        )
      );
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Could not remove background from reference image.'
      );
    } finally {
      setRemovingBgIds((prev) => {
        const copy = { ...prev };
        delete copy[refItem.id];
        return copy;
      });
    }
  };

  const toggleCharacterReference = (char: CharacterProfile) => {
    const refId = `char-ref-${char.id}`;
    const alreadyExists = attachedRefs.some((r) => r.id === refId);
    if (alreadyExists) {
      removeReference(refId);
      return;
    }
    appendReferences([
      {
        id: refId,
        imageUrl: char.avatarUrl || '/src/assets/images/char_luna_pilot_1795461026794.jpg',
        label: char.name,
        role: 'Character',
        description: buildCharacterRefDescription(char),
      },
    ]);
  };

  const toggleSceneReference = (scene: (typeof SCENE_LIBRARY_REFS)[number]) => {
    const alreadyExists = attachedRefs.some((r) => r.id === scene.id);
    if (alreadyExists) {
      removeReference(scene.id);
      return;
    }
    appendReferences([
      {
        id: scene.id,
        imageUrl: scene.imageUrl,
        label: scene.label,
        role: scene.defaultRole,
        description: scene.description,
      },
    ]);
  };

  const handleToggleTalkingLineRecording = async (lineId: string) => {
    if (recordingLineId === lineId) {
      mediaRecorderRef.current?.stop();
      setRecordingLineId(null);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMessage('Microphone recording is unavailable in this browser. You can upload an audio file instead.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recordedChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(recordedChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = typeof reader.result === 'string' ? reader.result : '';
          if (dataUrl) {
            setDialogueLines((prev) =>
              prev.map((ln) =>
                ln.id === lineId
                  ? { ...ln, customAudioBase64: dataUrl, customAudioLabel: 'Mic Recording' }
                  : ln
              )
            );
          }
        };
        reader.readAsDataURL(blob);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecordingLineId(lineId);
      setErrorMessage(null);
    } catch {
      setErrorMessage('Microphone permission denied. Type dialogue text for free AI voice or upload an audio clip.');
    }
  };

  const handleGenerateTalkingBg = async () => {
    const desc =
      talkingBgPrompt.trim() ||
      prompt.trim() ||
      'Cozy sunlit 3D animated workshop studio background, soft depth of field';
    setErrorMessage(null);
    setIsGeneratingBg(true);
    try {
      const res = await generateHfImage({
        prompt: desc,
        style: STYLE_MAP[styleLabel],
        aspectRatio: SIZE_MAP[sizeLabel],
        engine: 'flux-schnell',
      });
      setTalkingBgImageUrl(res.imageDataUrl);
      setTalkingBgLabel('AI Background');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not generate background image.');
    } finally {
      setIsGeneratingBg(false);
    }
  };

  const handleAddCastMember = () => {
    if (talkingCast.length >= 4) return;
    const nextIdx = talkingCast.length;
    const fallbackChar = characters[nextIdx % Math.max(1, characters.length)];
    const defaultVoices: TalkingVoicePreset[] = ['female', 'male', 'cartoon', 'mentor'];
    const newId = `cast-${Date.now()}`;
    setTalkingCast((prev) => [
      ...prev,
      {
        id: newId,
        characterId: fallbackChar?.id,
        label: fallbackChar?.name || `Character ${nextIdx + 1}`,
        imageUrl:
          fallbackChar?.avatarUrl || '/src/assets/images/char_luna_pilot_1795461026794.jpg',
        voicePreset: fallbackChar
          ? resolveCharVoicePreset(fallbackChar)
          : defaultVoices[nextIdx % defaultVoices.length],
        voiceName: fallbackChar?.voiceName,
        voiceStyle: fallbackChar?.voiceStyle,
        voicePitch: fallbackChar?.voicePitch,
        voiceSpeed: fallbackChar?.voiceSpeed,
        lockedVoice: fallbackChar?.lockedVoice,
      },
    ]);
  };

  const handleRemoveCastMember = (castId: string) => {
    if (talkingCast.length <= 1) return;
    const remaining = talkingCast.filter((c) => c.id !== castId);
    setTalkingCast(remaining);
    const fallbackSpeakerId = remaining[0]?.id ?? 'cast-1';
    setDialogueLines((prev) =>
      prev.map((ln) => (ln.speakerId === castId ? { ...ln, speakerId: fallbackSpeakerId } : ln))
    );
  };

  const handleAddDialogueLine = () => {
    const lastLine = dialogueLines[dialogueLines.length - 1];
    let nextSpeaker = talkingCast[0]?.id ?? 'cast-1';
    if (talkingCast.length >= 2) {
      const currIdx = talkingCast.findIndex((c) => c.id === lastLine?.speakerId);
      nextSpeaker = talkingCast[(currIdx + 1) % talkingCast.length].id;
    }
    const nextAngle: TalkingShotAngle =
      talkingCast.length >= 2
        ? dialogueLines.length % 2 === 1
          ? 'over-shoulder'
          : 'close-up'
        : 'close-up';
    setDialogueLines((prev) => [
      ...prev,
      {
        id: `line-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        speakerId: nextSpeaker,
        text: '',
        shotAngle: nextAngle,
      },
    ]);
  };

  const runGeneration = async (overrides?: {
    mode?: 'image' | 'video' | 'talking';
    prompt?: string;
    styleLabel?: SimpleStyleLabel;
    cameraLabel?: SimpleCameraLabel;
    sizeLabel?: SimpleSizeLabel;
    qualityTier?: ImageQualityTier;
    refs?: VideoReferenceItem[];
    animateExactFrame?: boolean;
  }) => {
    if (isGenerating) return;
    const activeMode = overrides?.mode ?? mode;
    const activeStyle = overrides?.styleLabel ?? styleLabel;
    const activeCamera = overrides?.cameraLabel ?? cameraLabel;
    const activeSize = overrides?.sizeLabel ?? sizeLabel;
    const activeQuality = overrides?.qualityTier ?? qualityTier;
    const mappedStyle = STYLE_MAP[activeStyle];
    const mappedCamera = CAMERA_MAP[activeCamera];
    const mappedRatio = SIZE_MAP[activeSize];

    if (activeMode === 'talking') {
      const validLines = dialogueLines.filter(
        (ln) => ln.text.trim().length >= 2 || Boolean(ln.customAudioBase64)
      );
      if (validLines.length === 0) {
        setErrorMessage('Type what the character says (or record/upload audio) before generating.');
        return;
      }

      const actionDirection =
        (overrides?.prompt ?? prompt).trim() ||
        'smiles warmly and gestures naturally while speaking, slow zoom in';

      setErrorMessage(null);
      setShowAttachPicker(false);
      setVoiceDrawerOpen(false);
      setVoiceAudioUrl(null);
      setIsGenerating(true);
      setProgress(8);
      setStatusMessage(
        validLines.length > 1
          ? `Turn 1/${validLines.length} · Compositing scene & preparing multi-speaker pipeline...`
          : 'Step 1 · Compositing character & background...'
      );

      try {
        const turnClips: string[] = [];
        let firstPreviewImg: string | undefined;

        for (let idx = 0; idx < validLines.length; idx++) {
          const line = validLines[idx];
          const speaker =
            talkingCast.find((c) => c.id === line.speakerId) ?? talkingCast[0];
          const coStars = talkingCast
            .filter((c) => c.id !== speaker.id)
            .map((c) => ({ imageUrl: c.imageUrl, label: c.label }));
          const turnPrefix =
            validLines.length > 1 ? `Turn ${idx + 1}/${validLines.length} (${speaker.label}) · ` : '';

          const turnRes = await generateTalkingSceneClip(
            {
              characterImageUrl: speaker.imageUrl,
              characterLabel: speaker.label,
              coStarCharacters: coStars,
              shotAngle: line.shotAngle,
              backgroundImageUrl: talkingBgImageUrl || undefined,
              backgroundPrompt: talkingBgPrompt.trim() || undefined,
              dialogue: line.text.trim(),
              voicePreset: line.voiceOverride ?? speaker.voicePreset,
              voiceName: speaker.lockedVoice ? speaker.voiceName : undefined,
              voiceStyleInstruction: speaker.lockedVoice ? speaker.voiceStyle : undefined,
              voicePitch: speaker.lockedVoice ? speaker.voicePitch : undefined,
              voiceSpeed: speaker.lockedVoice ? speaker.voiceSpeed : undefined,
              customAudioBase64: line.customAudioBase64,
              actionPrompt: actionDirection,
              style: mappedStyle,
              aspectRatio: mappedRatio,
            },
            (evt) => {
              const rawPct = typeof evt.progress === 'number' ? evt.progress : 25;
              const scaledPct =
                validLines.length > 1
                  ? Math.round(((idx + rawPct / 100) / validLines.length) * 88)
                  : rawPct;
              setProgress(Math.max(8, scaledPct));
              if (evt.message) {
                setStatusMessage(`${turnPrefix}${evt.message}`);
              }
            }
          );

          turnClips.push(turnRes.videoUrl);
          if (!firstPreviewImg && turnRes.compositedImageDataUrl) {
            firstPreviewImg = turnRes.compositedImageDataUrl;
          }
        }

        let finalVideoUrl = turnClips[0];
        if (turnClips.length > 1) {
          setStatusMessage(
            `Step 4 · Stitching ${turnClips.length} back-and-forth dialogue turns with FFmpeg.wasm...`
          );
          setProgress(91);
          finalVideoUrl = await stitchConversationClipsWithFfmpeg(
            turnClips,
            mappedRatio,
            (pct, phase) => {
              setProgress(pct);
              setStatusMessage(`Step 4 · ${phase}`);
            }
          );
        }

        const dialogueSummary = validLines
          .map((ln) => {
            const sp = talkingCast.find((c) => c.id === ln.speakerId)?.label || 'Speaker';
            return `${sp}: "${ln.text.trim() || 'Voice Audio'}"`;
          })
          .join(' / ');

        setResult({
          type: 'video',
          url: finalVideoUrl,
          prompt: actionDirection,
          aspectRatio: mappedRatio,
          isTalking: true,
          dialogueSummary,
          compositedPreviewUrl: firstPreviewImg,
        });
        onSaveCreation?.({
          id: `cre-${Date.now()}`,
          mode: 'video',
          prompt: `Talking Scene · ${dialogueSummary.slice(0, 120)}`,
          style: activeStyle,
          aspectRatio: mappedRatio,
          mediaUrl: finalVideoUrl,
          createdAt: new Date().toISOString(),
        });
        setProgress(100);
        setStatusMessage(null);
      } catch (err) {
        setErrorMessage(
          err instanceof Error
            ? err.message
            : 'Talking scene generation is temporarily busy. Please try again.'
        );
        setStatusMessage(null);
        setProgress(0);
      } finally {
        setIsGenerating(false);
      }
      return;
    }

    const activeRefs = overrides?.refs !== undefined ? overrides.refs : attachedRefs;
    const rawPrompt =
      (overrides?.prompt ?? prompt).trim() ||
      (activeRefs.length > 0
        ? `Cinematic ${activeMode === 'image' ? 'scene' : 'video'} featuring ${activeRefs
            .map((r) => `${r.label} (${r.role})`)
            .join(', ')} with consistent character identity and lighting`
        : '');

    if (!rawPrompt) return;

    setErrorMessage(null);
    setShowAttachPicker(false);
    setVoiceDrawerOpen(false);
    setVoiceAudioUrl(null);
    setIsGenerating(true);
    setProgress(12);
    setStatusMessage(
      activeMode === 'image'
        ? 'Refining visual prompt...'
        : activeRefs.length > 0
        ? `Enhancing camera prompt & ${activeRefs.length} reference${
            activeRefs.length > 1 ? 's' : ''
          }...`
        : 'Enhancing camera prompt...'
    );

    try {
      if (activeMode === 'image') {
        const res = await generateHfImage(
          {
            prompt: rawPrompt,
            style: mappedStyle,
            aspectRatio: mappedRatio,
            engine: 'flux-schnell',
            quality: activeQuality,
            imageDataUrl: activeRefs[0]?.imageUrl,
            removeBackground: activeRefs.length > 0 ? removeRefBackground : false,
            referenceImages:
              activeRefs.length > 0
                ? activeRefs.map((r) => ({
                    imageUrl: r.imageUrl,
                    role: r.role,
                    label: r.label,
                    description: r.description,
                    backgroundRemoved: r.backgroundRemoved,
                  }))
                : undefined,
          },
          (evt) => {
            if (typeof evt.progress === 'number') setProgress(evt.progress);
            if (evt.type === 'status') {
              setStatusMessage('Creating your image...');
            }
          }
        );
        const qLabel =
          QUALITY_OPTIONS.find((q) => q.value === (res.quality ?? activeQuality))?.label ?? 'High';
        setResult({
          type: 'image',
          url: res.imageDataUrl,
          prompt: rawPrompt,
          aspectRatio: mappedRatio,
          width: res.width,
          height: res.height,
          qualityLabel: qLabel,
          modelLabel: res.modelLabel,
        });
        onSaveCreation?.({
          id: `cre-${Date.now()}`,
          mode: 'image',
          prompt: rawPrompt,
          style: activeStyle,
          aspectRatio: mappedRatio,
          mediaUrl: res.imageDataUrl,
          createdAt: new Date().toISOString(),
        });
      } else {
        const res = await generateHfVideoClip(
          {
            prompt: rawPrompt,
            mode: activeRefs.length > 0 ? 'image-to-video' : 'text-to-video',
            animateExactFrame: overrides?.animateExactFrame ?? false,
            imageDataUrl: activeRefs[0]?.imageUrl,
            referenceImages:
              activeRefs.length > 0
                ? activeRefs.map((r) => ({
                    imageUrl: r.imageUrl,
                    role: r.role,
                    label: r.label,
                    description: r.description,
                  }))
                : undefined,
            style: mappedStyle,
            aspectRatio: mappedRatio,
            cameraMotion: mappedCamera,
          },
          (evt) => {
            if (typeof evt.progress === 'number') setProgress(evt.progress);
            if (evt.type === 'status') {
              setStatusMessage('Creating your video...');
            }
          }
        );
        setResult({
          type: 'video',
          url: res.videoUrl,
          prompt: rawPrompt,
          aspectRatio: mappedRatio,
        });
        onSaveCreation?.({
          id: `cre-${Date.now()}`,
          mode: 'video',
          prompt: rawPrompt,
          style: activeStyle,
          aspectRatio: mappedRatio,
          mediaUrl: res.videoUrl,
          createdAt: new Date().toISOString(),
        });
      }

      setProgress(100);
      setStatusMessage(null);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Generation is temporarily busy. Please try again.'
      );
      setStatusMessage(null);
      setProgress(0);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleStarterClick = (item: (typeof STARTER_EXAMPLES)[number]) => {
    setMode(item.mode);
    setPrompt(item.prompt);
    setStyleLabel(item.style);
    setCameraLabel(item.camera);
    setSizeLabel(item.size);
    void runGeneration({
      mode: item.mode,
      prompt: item.prompt,
      styleLabel: item.style,
      cameraLabel: item.camera,
      sizeLabel: item.size,
      refs: [],
    });
  };

  const handleAnimateThis = () => {
    if (!result) return;
    if (result.type === 'image') {
      const sceneRef: VideoReferenceItem = {
        id: `generated-${Date.now()}`,
        imageUrl: result.url,
        label: 'Generated Scene',
        role: 'Background / Scene',
      };
      const nextRefs =
        attachedRefs.length > 0
          ? [sceneRef, ...attachedRefs].slice(0, MAX_REFERENCES)
          : [sceneRef];
      const targetSize = aspectRatioToSizeLabel(result.aspectRatio);
      setMode('video');
      setSizeLabel(targetSize);
      setAttachedRefs(nextRefs);
      const nextPrompt = prompt.trim() || result.prompt;
      setPrompt(nextPrompt);
      void runGeneration({
        mode: 'video',
        prompt: nextPrompt,
        sizeLabel: targetSize,
        refs: nextRefs,
        animateExactFrame: true,
      });
    } else {
      setMode('video');
      void runGeneration({
        mode: 'video',
        prompt: prompt.trim() || result.prompt,
      });
    }
  };

  const handleGenerateVoice = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = (voiceLine || result?.prompt || '').trim();
    if (!text) return;
    setIsGeneratingVoice(true);
    try {
      const res = await synthesizeVoiceover({
        text,
        voiceName: selectedVoice,
        styleInstruction: 'Clear, natural narrator voiceover',
      });
      const url = `data:audio/wav;base64,${res.audioBase64}`;
      setVoiceAudioUrl(url);
      const audio = new Audio(url);
      void audio.play();
    } catch {
      speakWithBrowserTts(text, { rate: 1, pitch: 1 });
    } finally {
      setIsGeneratingVoice(false);
    }
  };

  const handleDownloadResult = () => {
    if (!result) return;
    if (result.type === 'video') {
      const a = document.createElement('a');
      a.href = result.url;
      a.download = `ahi-video-${Date.now()}.mp4`;
      a.click();
      return;
    }

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
        a.download = `ahi-image-${Date.now()}.png`;
        a.click();
        URL.revokeObjectURL(url);
      }, 'image/png');
    };
    img.src = result.url;
  };

  const hasValidTalkingInput = dialogueLines.some(
    (ln) => ln.text.trim().length >= 2 || Boolean(ln.customAudioBase64)
  );
  const canSubmit =
    mode === 'talking'
      ? hasValidTalkingInput && talkingCast.length > 0
      : Boolean(prompt.trim() || attachedRefs.length > 0);
  const bottomSpacerClass =
    mode === 'talking' ? 'pb-[28rem]' : attachedRefs.length > 0 ? 'pb-80' : 'pb-48';

  return (
    <div
      onDragEnter={handleCanvasDragEnter}
      onDragOver={handleCanvasDragOver}
      onDragLeave={handleCanvasDragLeave}
      onDrop={handleCanvasDrop}
      className={`min-h-[calc(100vh-4rem)] flex flex-col justify-between relative ${bottomSpacerClass}`}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp"
        onChange={handleUploadPhotosInput}
        className="hidden"
      />
      <input
        ref={talkingCastUploadRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => {
          const file = e.target.files?.[0];
          const targetId = uploadTargetCastIdRef.current;
          e.target.value = '';
          if (!file || !targetId) return;
          void readAndResizeImageFile(file).then((dataUrl) => {
            setTalkingCast((prev) =>
              prev.map((c) =>
                c.id === targetId
                  ? { ...c, imageUrl: dataUrl, label: file.name.replace(/\.[^.]+$/, '').slice(0, 22) || c.label }
                  : c
              )
            );
          });
        }}
        className="hidden"
      />
      <input
        ref={talkingBgUploadRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          void readAndResizeImageFile(file).then((dataUrl) => {
            setTalkingBgImageUrl(dataUrl);
            setTalkingBgLabel(file.name.replace(/\.[^.]+$/, '').slice(0, 24) || 'Uploaded Scene');
          });
        }}
        className="hidden"
      />
      <input
        ref={talkingAudioUploadRef}
        type="file"
        accept="audio/wav,audio/mpeg,audio/mp3,audio/webm,audio/ogg"
        onChange={(e) => {
          const file = e.target.files?.[0];
          const targetLineId = uploadTargetLineIdRef.current;
          e.target.value = '';
          if (!file || !targetLineId) return;
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = typeof reader.result === 'string' ? reader.result : '';
            if (dataUrl) {
              setDialogueLines((prev) =>
                prev.map((ln) =>
                  ln.id === targetLineId
                    ? { ...ln, customAudioBase64: dataUrl, customAudioLabel: file.name.slice(0, 20) }
                    : ln
                )
              );
            }
          };
          reader.readAsDataURL(file);
        }}
        className="hidden"
      />

      {/* Full Canvas Drag-and-Drop Overlay */}
      {isDraggingFiles && (
        <div className="fixed inset-0 z-50 bg-[#07090E]/85 backdrop-blur-md flex items-center justify-center p-6 pointer-events-none">
          <div className="w-full max-w-xl rounded-2xl border-2 border-dashed border-[#2DD4BF] bg-[rgba(17,22,33,0.85)] backdrop-blur-2xl p-10 text-center space-y-3 shadow-[0_0_60px_rgba(45,212,191,0.18)]">
            <div className="w-14 h-14 rounded-2xl bg-[#2DD4BF] text-[#07090E] flex items-center justify-center mx-auto">
              <Upload className="w-6 h-6" />
            </div>
            <div className="text-lg font-display font-bold text-[#F8FAFC]">
              Drop up to {MAX_REFERENCES} reference images
            </div>
            <p className="text-xs text-[#94A3B8]">
              Use photos for character, outfit, background, or style — your prompt drives all camera motion.
            </p>
          </div>
        </div>
      )}

      {/* Center Canvas Stage */}
      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-4xl mx-auto py-4">
        {errorMessage && (
          <div className="w-full max-w-2xl mb-5 bg-red-950/50 border border-red-500/40 text-red-200 rounded-2xl px-4 py-3 text-xs flex items-center justify-between gap-3 backdrop-blur-xl">
            <span>{errorMessage}</span>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="text-red-300 hover:text-white cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {isGenerating ? (
          <AhiGenerationLoader
            mode={mode}
            progress={progress}
            statusMessage={statusMessage}
          />
        ) : result ? (
          <div className="w-full max-w-3xl space-y-5">
            <div className="relative bg-[rgba(17,22,33,0.72)] backdrop-blur-2xl border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_24px_60px_rgba(0,0,0,0.6)] rounded-2xl overflow-hidden">
              <button
                type="button"
                onClick={() => setResult(null)}
                className="absolute top-3 right-3 z-10 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#07090E]/80 hover:bg-[#07090E] border border-white/10 hover:border-[#2DD4BF]/45 text-xs text-[#F8FAFC] backdrop-blur-md cursor-pointer transition-colors"
              >
                <RotateCcw className="w-3 h-3 text-[#2DD4BF]" />
                Start Fresh
              </button>

              {result.isTalking && (
                <span className="absolute top-3 left-3 z-10 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#07090E]/85 border border-[#2DD4BF]/45 text-[11px] font-semibold text-[#2DD4BF] backdrop-blur-md">
                  <MessageSquareQuote className="w-3 h-3" />
                  Talking Scene · Lip-Synced
                </span>
              )}

              {result.type === 'video' ? (
                <video
                  key={result.url}
                  src={result.url}
                  controls
                  autoPlay
                  loop={!result.isTalking}
                  className="w-full max-h-[540px] bg-black object-contain"
                />
              ) : (
                <img
                  src={result.url}
                  alt={result.prompt}
                  className="w-full max-h-[540px] bg-black object-contain mx-auto"
                />
              )}
            </div>

            {result.dialogueSummary && (
              <div className="bg-[rgba(17,22,33,0.72)] backdrop-blur-2xl border border-white/10 rounded-xl px-4 py-2.5 text-xs text-[#94A3B8] text-center">
                {result.dialogueSummary}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-[#94A3B8] tabular-nums">
              <span>{result.aspectRatio}</span>
              {result.width && result.height && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>
                    {result.width}×{result.height}
                  </span>
                </>
              )}
              {result.qualityLabel && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{result.qualityLabel} Quality</span>
                </>
              )}
              {result.modelLabel && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{result.modelLabel}</span>
                </>
              )}
            </div>

            {/* Clean Action Buttons Underneath */}
            <div className="flex flex-wrap items-center justify-center gap-3">
              {result.type === 'video' && onAddClipToEpisode ? (
                <button
                  type="button"
                  disabled={isGenerating}
                  onClick={() =>
                    onAddClipToEpisode({
                      videoUrl: result.url,
                      prompt: result.prompt,
                      dialogue: result.dialogueSummary,
                    })
                  }
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#2DD4BF] hover:bg-[#34D399] disabled:opacity-45 text-[#07090E] text-xs font-bold shadow-[0_0_22px_rgba(45,212,191,0.22)] transition-all cursor-pointer whitespace-nowrap"
                >
                  <Film className="w-4 h-4" />
                  Add to Episode
                </button>
              ) : (
                <button
                  type="button"
                  disabled={isGenerating}
                  onClick={handleAnimateThis}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#2DD4BF] hover:bg-[#34D399] disabled:opacity-45 text-[#07090E] text-xs font-bold shadow-[0_0_22px_rgba(45,212,191,0.22)] transition-all cursor-pointer whitespace-nowrap"
                >
                  <Film className="w-4 h-4" />
                  Animate This
                </button>
              )}

              {!result.isTalking && (
                <button
                  type="button"
                  onClick={() => {
                    setVoiceLine((prev) => prev || result.prompt);
                    setVoiceDrawerOpen((o) => !o);
                  }}
                  className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border text-xs font-medium backdrop-blur-2xl transition-all cursor-pointer ${
                    voiceDrawerOpen
                      ? 'bg-[#2DD4BF]/15 border-[#2DD4BF]/50 text-[#F8FAFC]'
                      : 'bg-[rgba(17,22,33,0.72)] hover:border-[#2DD4BF]/45 border-white/10 text-[#F8FAFC]'
                  }`}
                >
                  <Mic className="w-4 h-4 text-[#2DD4BF]" />
                  Add Voice
                </button>
              )}

              <button
                type="button"
                onClick={handleDownloadResult}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[rgba(17,22,33,0.72)] hover:border-[#2DD4BF]/45 border border-white/10 text-[#F8FAFC] text-xs font-medium backdrop-blur-2xl transition-all cursor-pointer"
              >
                <Download className="w-4 h-4 text-[#2DD4BF]" />
                Download (Free, No Watermark)
              </button>
            </div>

            {/* Lightweight Inline Add Voice Drawer */}
            {voiceDrawerOpen && (
              <form
                onSubmit={(e) => void handleGenerateVoice(e)}
                className="bg-[rgba(17,22,33,0.72)] backdrop-blur-2xl border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] rounded-2xl p-4 space-y-3 max-w-2xl mx-auto"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-[#F8FAFC] flex items-center gap-1.5">
                    <Volume2 className="w-4 h-4 text-[#2DD4BF]" />
                    Add Free Voiceover
                  </span>
                  <select
                    value={selectedVoice}
                    onChange={(e) => setSelectedVoice(e.target.value as GeminiVoiceName)}
                    className="bg-[#07090E]/80 border border-white/10 rounded-lg px-2.5 py-1 text-xs text-[#F8FAFC] focus:outline-none focus:border-[#2DD4BF]/60"
                  >
                    {SIMPLE_VOICES.map((v) => (
                      <option key={v.id} value={v.id} className="bg-[#0B0F18]">
                        {v.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={voiceLine}
                    onChange={(e) => setVoiceLine(e.target.value)}
                    placeholder="Type what you want the voice to say..."
                    className="flex-1 bg-[#07090E]/80 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-[#F8FAFC] placeholder-[#64748B] focus:outline-none focus:border-[#2DD4BF]/60"
                  />
                  <button
                    type="submit"
                    disabled={isGeneratingVoice || !voiceLine.trim()}
                    className="px-4 py-2 rounded-xl bg-[#2DD4BF] hover:bg-[#34D399] disabled:opacity-45 text-[#07090E] text-xs font-bold cursor-pointer shrink-0 transition-colors"
                  >
                    {isGeneratingVoice ? 'Generating...' : 'Play & Attach'}
                  </button>
                </div>

                {voiceAudioUrl && (
                  <div className="flex items-center justify-between gap-3 pt-1">
                    <audio controls src={voiceAudioUrl} className="h-8 flex-1" />
                    <a
                      href={voiceAudioUrl}
                      download={`ahi-voice-${Date.now()}.wav`}
                      className="text-xs text-[#2DD4BF] hover:text-[#34D399] hover:underline shrink-0"
                    >
                      Save Audio
                    </a>
                  </div>
                )}
              </form>
            )}
          </div>
        ) : (
          <div className="w-full space-y-8">
            <div className="text-center space-y-2 max-w-xl mx-auto">
              <h1 className="text-2xl sm:text-3xl font-display font-bold tracking-tight text-[#F8FAFC]">
                What do you want to create today?
              </h1>
              <p className="text-sm text-[#94A3B8]">
                Click an example, drop up to {MAX_REFERENCES} reference photos, or type your idea below.
              </p>
            </div>

            {/* 4 Inspiring Starter Examples */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {STARTER_EXAMPLES.map((ex) => (
                <button
                  key={ex.id}
                  type="button"
                  disabled={isGenerating}
                  onClick={() => handleStarterClick(ex)}
                  className="group text-left bg-[rgba(17,22,33,0.72)] backdrop-blur-2xl border border-white/10 hover:border-[#2DD4BF]/45 disabled:opacity-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_24px_rgba(45,212,191,0.14)] rounded-2xl overflow-hidden transition-all cursor-pointer flex flex-col"
                >
                  <div className="aspect-[4/3] bg-[#07090E] relative overflow-hidden">
                    <img
                      src={ex.previewUrl}
                      alt={ex.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0B0F18] via-transparent to-transparent" />
                    <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-full bg-[#07090E]/75 backdrop-blur-md border border-white/10 text-[10px] font-medium text-[#F8FAFC]">
                      {ex.style}
                    </span>
                    <span className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full bg-[#2DD4BF] text-[#07090E] text-[10px] font-bold">
                      {ex.mode === 'video' ? 'Video' : 'Image'}
                    </span>
                  </div>
                  <div className="p-3.5 space-y-1">
                    <div className="text-xs font-display font-semibold text-[#F8FAFC] group-hover:text-[#2DD4BF] transition-colors">
                      {ex.title}
                    </div>
                    <p className="text-[11px] text-[#94A3B8] line-clamp-2 leading-relaxed">
                      {ex.prompt}
                    </p>
                  </div>
                </button>
              ))}
            </div>

            {creations.filter((c) => Boolean(c.mediaUrl)).length > 0 && (
              <div className="space-y-2.5 pt-2">
                <div className="text-xs font-medium text-[#94A3B8]">Your Recent Creations</div>
                <div className="flex items-stretch gap-3 overflow-x-auto pb-1">
                  {creations
                    .filter((c) => Boolean(c.mediaUrl))
                    .slice(0, 8)
                    .map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setPrompt(item.prompt);
                          setMode(item.mode);
                          setResult({
                            type: item.mode,
                            url: item.mediaUrl,
                            prompt: item.prompt,
                            aspectRatio: item.aspectRatio,
                          });
                        }}
                        className="w-40 shrink-0 text-left bg-[rgba(17,22,33,0.72)] backdrop-blur-2xl border border-white/10 hover:border-[#2DD4BF]/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] hover:shadow-[0_0_20px_rgba(45,212,191,0.12)] rounded-2xl overflow-hidden transition-all cursor-pointer"
                      >
                        <div className="aspect-video bg-black relative">
                          {item.mode === 'video' ? (
                            <video
                              src={item.mediaUrl}
                              muted
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <img
                              src={item.mediaUrl}
                              alt={item.prompt}
                              className="w-full h-full object-cover"
                            />
                          )}
                          <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-[#07090E]/80 text-[#2DD4BF] border border-[#2DD4BF]/30 text-[9px] font-semibold uppercase">
                            {item.mode}
                          </span>
                        </div>
                        <div className="p-2">
                          <div className="text-[11px] text-[#F8FAFC] line-clamp-1">{item.prompt}</div>
                        </div>
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Floating Prompt Dock positioned cleanly to the right of the curved sidebar */}
      <div
        className={`fixed bottom-5 sm:bottom-6 right-3 sm:right-6 z-30 pointer-events-none transition-[left] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          sidebarExpanded
            ? 'left-[88px] sm:left-[100px] md:left-[288px]'
            : 'left-[88px] sm:left-[100px]'
        }`}
      >
        <div className="max-w-4xl mx-auto pointer-events-auto relative space-y-2.5">
          {/* Multi-Character / Multi-Scene / Multi-Photo Picker Popover */}
          {showAttachPicker && (
            <div className="bg-[rgba(17,22,33,0.86)] backdrop-blur-2xl border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_20px_50px_rgba(0,0,0,0.65)] rounded-2xl p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPickerTab('characters')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                      pickerTab === 'characters'
                        ? 'bg-[#2DD4BF] text-[#07090E]'
                        : 'bg-[#07090E]/75 text-[#94A3B8] hover:text-[#F8FAFC] border border-white/10'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" />
                    Characters
                  </button>
                  <button
                    type="button"
                    onClick={() => setPickerTab('scenes')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                      pickerTab === 'scenes'
                        ? 'bg-[#2DD4BF] text-[#07090E]'
                        : 'bg-[#07090E]/75 text-[#94A3B8] hover:text-[#F8FAFC] border border-white/10'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    Scenes
                  </button>
                  <span className="text-[11px] text-[#64748B] hidden sm:inline">
                    {pickerTarget === 'refs'
                      ? `Pick multiple (${attachedRefs.length}/${MAX_REFERENCES})`
                      : pickerTarget === 'talking-bg'
                      ? 'Select shared scene background'
                      : 'Select character portrait'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (pickerTarget === 'talking-bg') {
                        talkingBgUploadRef.current?.click();
                      } else if (typeof pickerTarget === 'object') {
                        uploadTargetCastIdRef.current = pickerTarget.castId;
                        talkingCastUploadRef.current?.click();
                      } else {
                        fileInputRef.current?.click();
                      }
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#2DD4BF] hover:bg-[#34D399] text-[#07090E] text-xs font-bold cursor-pointer transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Upload Photo
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAttachPicker(false)}
                    className="p-1.5 rounded-lg text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-white/5 cursor-pointer"
                    aria-label="Close picker"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {pickerTab === 'characters' ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-52 overflow-y-auto pr-1">
                  {characters.map((char) => {
                    const charImg =
                      char.avatarUrl || '/src/assets/images/char_luna_pilot_1795461026794.jpg';
                    const refIdx = attachedRefs.findIndex(
                      (r) => r.id === `char-ref-${char.id}`
                    );
                    const isTargetedCast =
                      typeof pickerTarget === 'object' &&
                      talkingCast.some(
                        (c) => c.id === pickerTarget.castId && c.imageUrl === charImg
                      );
                    const isSelected = pickerTarget === 'refs' ? refIdx !== -1 : isTargetedCast;
                    return (
                      <button
                        key={char.id}
                        type="button"
                        onClick={() => {
                          if (typeof pickerTarget === 'object') {
                            const voiceGuess = resolveCharVoicePreset(char);
                            setTalkingCast((prev) =>
                              prev.map((c) =>
                                c.id === pickerTarget.castId
                                  ? {
                                      ...c,
                                      characterId: char.id,
                                      label: char.name,
                                      imageUrl: charImg,
                                      voicePreset: voiceGuess,
                                      voiceName: char.voiceName,
                                      voiceStyle: char.voiceStyle,
                                      voicePitch: char.voicePitch,
                                      voiceSpeed: char.voiceSpeed,
                                      lockedVoice: char.lockedVoice,
                                    }
                                  : c
                              )
                            );
                            setShowAttachPicker(false);
                          } else if (pickerTarget === 'talking-bg') {
                            setTalkingBgImageUrl(charImg);
                            setTalkingBgLabel(char.name);
                            setShowAttachPicker(false);
                          } else {
                            toggleCharacterReference(char);
                          }
                        }}
                        className={`relative flex items-center gap-2 p-1.5 rounded-xl border text-left cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-[#2DD4BF]/15 border-[#2DD4BF]/60 shadow-[0_0_16px_rgba(45,212,191,0.15)]'
                            : 'bg-[#07090E]/75 hover:border-[#2DD4BF]/40 border-white/10'
                        }`}
                      >
                        <img
                          src={charImg}
                          alt={char.name}
                          className="w-9 h-9 rounded-lg object-cover shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium text-[#F8FAFC] truncate">
                            {char.name}
                          </div>
                          <div className="text-[10px] text-[#64748B] truncate">{char.role}</div>
                        </div>
                        {isSelected && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[#2DD4BF] text-[#07090E] text-[10px] font-bold shrink-0">
                            <Check className="w-2.5 h-2.5" />
                            {pickerTarget === 'refs' ? refIdx + 1 : ''}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-52 overflow-y-auto pr-1">
                  {SCENE_LIBRARY_REFS.map((sc) => {
                    const refIdx = attachedRefs.findIndex((r) => r.id === sc.id);
                    const isSelected =
                      pickerTarget === 'talking-bg'
                        ? talkingBgImageUrl === sc.imageUrl
                        : refIdx !== -1;
                    return (
                      <button
                        key={sc.id}
                        type="button"
                        onClick={() => {
                          if (pickerTarget === 'talking-bg') {
                            setTalkingBgImageUrl(sc.imageUrl);
                            setTalkingBgLabel(sc.label);
                            setShowAttachPicker(false);
                          } else if (typeof pickerTarget === 'object') {
                            setTalkingCast((prev) =>
                              prev.map((c) =>
                                c.id === pickerTarget.castId
                                  ? { ...c, label: sc.label, imageUrl: sc.imageUrl }
                                  : c
                              )
                            );
                            setShowAttachPicker(false);
                          } else {
                            toggleSceneReference(sc);
                          }
                        }}
                        className={`relative flex items-center gap-2 p-1.5 rounded-xl border text-left cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-[#2DD4BF]/15 border-[#2DD4BF]/60 shadow-[0_0_16px_rgba(45,212,191,0.15)]'
                            : 'bg-[#07090E]/75 hover:border-[#2DD4BF]/40 border-white/10'
                        }`}
                      >
                        <img
                          src={sc.imageUrl}
                          alt={sc.label}
                          className="w-11 h-9 rounded-lg object-cover shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium text-[#F8FAFC] truncate">
                            {sc.label}
                          </div>
                          <div className="text-[10px] text-[#64748B] truncate">
                            {sc.defaultRole}
                          </div>
                        </div>
                        {isSelected && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-[#2DD4BF] text-[#07090E] text-[10px] font-bold shrink-0">
                            <Check className="w-2.5 h-2.5" />
                            {pickerTarget === 'refs' ? refIdx + 1 : ''}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Talking Scene & Multi-Character Conversation 3-Slot Panel */}
          {mode === 'talking' && (
            <div className="bg-[rgba(17,22,33,0.82)] backdrop-blur-2xl border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_20px_50px_rgba(0,0,0,0.65)] rounded-2xl p-3.5 space-y-3 max-h-[46vh] overflow-y-auto">
              {/* Top Row: Character Cast Slots + Shared Background Image */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5">
                {/* Slot 1: Character(s) Cast */}
                <div className="lg:col-span-7 bg-[#07090E]/75 border border-white/10 rounded-xl p-2.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-[#F8FAFC] flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-[#2DD4BF]" />
                      Characters ({talkingCast.length})
                    </span>
                    {talkingCast.length < 4 && (
                      <button
                        type="button"
                        onClick={handleAddCastMember}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#2DD4BF]/12 hover:bg-[#2DD4BF]/20 border border-[#2DD4BF]/35 text-[10px] font-semibold text-[#2DD4BF] cursor-pointer transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                        Add Character
                      </button>
                    )}
                  </div>

                  <div className="flex items-stretch gap-2 overflow-x-auto pb-0.5">
                    {talkingCast.map((member, cIdx) => (
                      <div
                        key={member.id}
                        className="w-44 shrink-0 bg-[rgba(17,22,33,0.75)] border border-white/10 hover:border-[#2DD4BF]/40 rounded-xl p-2 space-y-1.5 transition-all"
                      >
                        <div className="flex items-center gap-2">
                          <img
                            src={member.imageUrl}
                            alt={member.label}
                            className="w-10 h-10 rounded-lg object-cover border border-white/10 shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-[10px] font-bold text-[#2DD4BF] flex items-center gap-1">
                              <span>Char {cIdx + 1}</span>
                              {member.lockedVoice && (
                                <span className="px-1 py-0.2 rounded bg-[#2DD4BF]/15 border border-[#2DD4BF]/35 text-[9px]">
                                  Voice Locked
                                </span>
                              )}
                            </div>
                            <div className="text-xs font-semibold text-[#F8FAFC] truncate">
                              {member.label}
                            </div>
                          </div>
                          {talkingCast.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveCastMember(member.id)}
                              className="p-1 rounded-md text-[#64748B] hover:text-red-400 cursor-pointer"
                              title="Remove character"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              uploadTargetCastIdRef.current = member.id;
                              talkingCastUploadRef.current?.click();
                            }}
                            className="flex-1 py-1 rounded-lg bg-[#07090E]/80 hover:border-[#2DD4BF]/40 border border-white/10 text-[10px] text-[#F8FAFC] cursor-pointer transition-colors"
                          >
                            Upload
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setPickerTarget({ type: 'talking-cast', castId: member.id });
                              setPickerTab('characters');
                              setShowAttachPicker(true);
                            }}
                            className="flex-1 py-1 rounded-lg bg-[#07090E]/80 hover:border-[#2DD4BF]/40 border border-white/10 text-[10px] text-[#2DD4BF] cursor-pointer transition-colors"
                          >
                            Library
                          </button>
                        </div>

                        <select
                          value={member.voicePreset}
                          onChange={(e) =>
                            setTalkingCast((prev) =>
                              prev.map((c) =>
                                c.id === member.id
                                  ? { ...c, voicePreset: e.target.value as TalkingVoicePreset }
                                  : c
                              )
                            )
                          }
                          aria-label={`Voice for ${member.label}`}
                          className="w-full bg-[#07090E]/80 border border-white/10 rounded-lg px-2 py-1 text-[10px] text-[#F8FAFC] focus:outline-none focus:border-[#2DD4BF]/50 cursor-pointer"
                        >
                          {TALKING_VOICE_OPTIONS.map((v) => (
                            <option key={v.id} value={v.id} className="bg-[#0B0F18]">
                              Voice: {v.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Slot 2: Shared Background Image */}
                <div className="lg:col-span-5 bg-[#07090E]/75 border border-white/10 rounded-xl p-2.5 flex flex-col justify-between space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-[#F8FAFC] flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-[#2DD4BF]" />
                      Background Scene
                    </span>
                    {talkingBgImageUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          setTalkingBgImageUrl(null);
                          setTalkingBgLabel('Portrait Only');
                        }}
                        className="text-[10px] text-[#64748B] hover:text-[#F8FAFC] cursor-pointer"
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2.5">
                    {talkingBgImageUrl ? (
                      <img
                        src={talkingBgImageUrl}
                        alt={talkingBgLabel}
                        className="w-16 h-12 rounded-lg object-cover border border-white/10 shrink-0"
                      />
                    ) : (
                      <div className="w-16 h-12 rounded-lg border border-dashed border-white/15 flex items-center justify-center text-[10px] text-[#64748B] shrink-0">
                        None
                      </div>
                    )}
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <input
                        type="text"
                        value={talkingBgPrompt}
                        onChange={(e) => setTalkingBgPrompt(e.target.value)}
                        placeholder={talkingBgLabel || 'Describe background to generate...'}
                        className="w-full bg-[rgba(17,22,33,0.72)] border border-white/10 rounded-lg px-2.5 py-1 text-[11px] text-[#F8FAFC] placeholder-[#64748B] focus:outline-none focus:border-[#2DD4BF]/50"
                      />
                      <div className="flex flex-wrap items-center gap-1">
                        <button
                          type="button"
                          onClick={() => talkingBgUploadRef.current?.click()}
                          className="px-2 py-1 rounded-lg bg-[rgba(17,22,33,0.85)] hover:border-[#2DD4BF]/40 border border-white/10 text-[10px] text-[#F8FAFC] cursor-pointer"
                        >
                          Upload
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPickerTarget('talking-bg');
                            setPickerTab('scenes');
                            setShowAttachPicker(true);
                          }}
                          className="px-2 py-1 rounded-lg bg-[rgba(17,22,33,0.85)] hover:border-[#2DD4BF]/40 border border-white/10 text-[10px] text-[#94A3B8] hover:text-[#F8FAFC] cursor-pointer"
                        >
                          Scenes
                        </button>
                        <button
                          type="button"
                          disabled={isGeneratingBg}
                          onClick={() => void handleGenerateTalkingBg()}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#2DD4BF]/15 hover:bg-[#2DD4BF]/25 border border-[#2DD4BF]/40 text-[10px] font-semibold text-[#2DD4BF] cursor-pointer"
                        >
                          {isGeneratingBg ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Sparkles className="w-3 h-3" />
                          )}
                          Generate BG
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Slot 3: Spoken Dialogue Script List (+ Add Line & Shot-Reverse-Shot Controls) */}
              <div className="bg-[#07090E]/75 border border-white/10 rounded-xl p-2.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-[#F8FAFC] flex items-center gap-1.5">
                    <MessageSquareQuote className="w-3.5 h-3.5 text-[#2DD4BF]" />
                    Dialogue Script ({dialogueLines.length}{' '}
                    {dialogueLines.length === 1 ? 'Line' : 'Turns'})
                  </span>
                  <button
                    type="button"
                    onClick={handleAddDialogueLine}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#2DD4BF] hover:bg-[#34D399] text-[#07090E] text-[10px] font-bold cursor-pointer transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    Add Line
                  </button>
                </div>

                <div className="space-y-2">
                  {dialogueLines.map((line, lIdx) => {
                    const isRec = recordingLineId === line.id;
                    return (
                      <div
                        key={line.id}
                        className="bg-[rgba(17,22,33,0.72)] border border-white/10 rounded-xl p-2 flex flex-col gap-1.5"
                      >
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="px-1.5 py-0.5 rounded bg-[#2DD4BF]/15 text-[#2DD4BF] text-[10px] font-bold tabular-nums">
                            #{lIdx + 1}
                          </span>

                          {/* Who is speaking */}
                          <select
                            value={line.speakerId}
                            onChange={(e) =>
                              setDialogueLines((prev) =>
                                prev.map((ln) =>
                                  ln.id === line.id ? { ...ln, speakerId: e.target.value } : ln
                                )
                              )
                            }
                            aria-label={`Speaker for line ${lIdx + 1}`}
                            className="bg-[#07090E]/85 border border-white/10 rounded-lg px-2 py-1 text-[11px] font-medium text-[#F8FAFC] focus:outline-none focus:border-[#2DD4BF]/50 cursor-pointer"
                          >
                            {talkingCast.map((c, ci) => (
                              <option key={c.id} value={c.id} className="bg-[#0B0F18]">
                                Char {ci + 1}: {c.label}
                              </option>
                            ))}
                          </select>

                          {/* Shot angle */}
                          <select
                            value={line.shotAngle}
                            onChange={(e) =>
                              setDialogueLines((prev) =>
                                prev.map((ln) =>
                                  ln.id === line.id
                                    ? { ...ln, shotAngle: e.target.value as TalkingShotAngle }
                                    : ln
                                )
                              )
                            }
                            aria-label={`Shot angle for line ${lIdx + 1}`}
                            className="bg-[#07090E]/85 border border-white/10 rounded-lg px-2 py-1 text-[11px] text-[#94A3B8] focus:outline-none focus:border-[#2DD4BF]/50 cursor-pointer"
                          >
                            {SHOT_ANGLE_OPTIONS.map((ang) => (
                              <option key={ang.id} value={ang.id} className="bg-[#0B0F18]">
                                {ang.label}
                              </option>
                            ))}
                          </select>

                          {/* Optional Record Voice or Upload Audio */}
                          <button
                            type="button"
                            onClick={() => void handleToggleTalkingLineRecording(line.id)}
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-medium cursor-pointer transition-colors ${
                              isRec
                                ? 'bg-red-500/20 border-red-400/50 text-red-200'
                                : 'bg-[#07090E]/80 hover:border-[#2DD4BF]/40 border-white/10 text-[#94A3B8] hover:text-[#F8FAFC]'
                            }`}
                          >
                            {isRec ? (
                              <>
                                <Square className="w-2.5 h-2.5" />
                                Stop Rec
                              </>
                            ) : (
                              <>
                                <Mic className="w-3 h-3 text-[#2DD4BF]" />
                                Record Voice
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              uploadTargetLineIdRef.current = line.id;
                              talkingAudioUploadRef.current?.click();
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#07090E]/80 hover:border-[#2DD4BF]/40 border border-white/10 text-[10px] text-[#94A3B8] hover:text-[#F8FAFC] cursor-pointer"
                          >
                            <Upload className="w-3 h-3 text-[#2DD4BF]" />
                            Audio
                          </button>

                          {line.customAudioLabel && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#2DD4BF]/15 border border-[#2DD4BF]/35 text-[10px] text-[#2DD4BF]">
                              {line.customAudioLabel}
                              <button
                                type="button"
                                onClick={() =>
                                  setDialogueLines((prev) =>
                                    prev.map((ln) =>
                                      ln.id === line.id
                                        ? {
                                            ...ln,
                                            customAudioBase64: undefined,
                                            customAudioLabel: undefined,
                                          }
                                        : ln
                                    )
                                  )
                                }
                                className="hover:text-white cursor-pointer"
                              >
                                <X className="w-2.5 h-2.5" />
                              </button>
                            </span>
                          )}

                          {dialogueLines.length > 1 && (
                            <button
                              type="button"
                              onClick={() =>
                                setDialogueLines((prev) => prev.filter((ln) => ln.id !== line.id))
                              }
                              className="ml-auto p-1 text-[#64748B] hover:text-red-400 cursor-pointer"
                              title="Remove line"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        <input
                          type="text"
                          value={line.text}
                          onChange={(e) =>
                            setDialogueLines((prev) =>
                              prev.map((ln) =>
                                ln.id === line.id ? { ...ln, text: e.target.value } : ln
                              )
                            )
                          }
                          placeholder={
                            dialogueLines.length > 1
                              ? `Type what ${
                                  talkingCast.find((c) => c.id === line.speakerId)?.label ||
                                  'character'
                                } says...`
                              : 'Type what the character says...'
                          }
                          className="w-full bg-[#07090E]/85 border border-white/10 focus:border-[#2DD4BF]/55 rounded-lg px-3 py-1.5 text-xs text-[#F8FAFC] placeholder-[#64748B] focus:outline-none"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Sleek Multi-Image Reference Tray Above Prompt Bar (Video / Image Mode) */}
          {mode !== 'talking' && attachedRefs.length > 0 && (
            <div className="bg-[rgba(17,22,33,0.78)] backdrop-blur-2xl border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_20px_50px_rgba(0,0,0,0.65)] rounded-2xl p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
                <div className="text-[11px] font-medium text-[#F8FAFC] flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-full bg-[#2DD4BF]/15 border border-[#2DD4BF]/35 text-[#2DD4BF] font-semibold tabular-nums">
                    {attachedRefs.length} Reference{attachedRefs.length > 1 ? 's' : ''}
                  </span>
                  <span className="text-[#94A3B8] hidden sm:inline">
                    Character identity preserved · prompt controls scene, action &amp; framing
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setRemoveRefBackground((v) => !v)}
                    aria-pressed={removeRefBackground}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-colors cursor-pointer ${
                      removeRefBackground
                        ? 'bg-[#2DD4BF]/15 border-[#2DD4BF]/45 text-[#2DD4BF]'
                        : 'bg-[#07090E]/75 border-white/10 text-[#94A3B8] hover:text-[#F8FAFC]'
                    }`}
                    title="Strip original background and replace with your prompted scene"
                  >
                    <Scissors className="w-3 h-3" />
                    Remove BG: {removeRefBackground ? 'On' : 'Off'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAttachedRefs([])}
                    className="text-[11px] text-[#94A3B8] hover:text-[#F8FAFC] cursor-pointer"
                  >
                    Clear all
                  </button>
                </div>
              </div>

              <div className="flex items-stretch gap-2.5 overflow-x-auto pb-1">
                {attachedRefs.map((ref, idx) => {
                  const isStrippingBg = Boolean(removingBgIds[ref.id]);
                  return (
                    <div
                      key={ref.id}
                      draggable
                      onDragStart={() => setDragRefIndex(idx)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (dragRefIndex !== null && dragRefIndex !== idx) {
                          moveReference(dragRefIndex, idx);
                        }
                        setDragRefIndex(null);
                      }}
                      onDragEnd={() => setDragRefIndex(null)}
                      className="w-34 shrink-0 rounded-2xl bg-[rgba(17,22,33,0.72)] border border-white/10 hover:border-[#2DD4BF]/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] overflow-hidden flex flex-col transition-all"
                    >
                      <div className="relative h-20 bg-[#0B0F18]">
                        <img
                          src={ref.imageUrl}
                          alt={ref.label}
                          className="w-full h-full object-contain"
                        />
                        <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-[#07090E]/85 text-[#2DD4BF] border border-[#2DD4BF]/40 text-[10px] font-bold tabular-nums">
                          Ref {idx + 1}
                        </span>
                        {ref.backgroundRemoved && (
                          <span className="absolute bottom-1 left-1.5 px-1.5 py-0.5 rounded bg-[#2DD4BF]/90 text-[#07090E] text-[9px] font-bold">
                            BG Removed
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => removeReference(ref.id)}
                          className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-[#07090E]/85 hover:bg-red-500 text-[#F8FAFC] flex items-center justify-center border border-white/10 cursor-pointer"
                          aria-label={`Remove ${ref.label}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>

                      <div className="p-1.5 space-y-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[10px] text-[#F8FAFC] font-medium truncate">
                            {ref.label}
                          </span>
                          <div className="flex items-center shrink-0">
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => moveReference(idx, idx - 1)}
                              className="p-0.5 text-[#64748B] hover:text-[#F8FAFC] disabled:opacity-25 cursor-pointer"
                              aria-label="Move left"
                              title="Move left"
                            >
                              <ChevronLeft className="w-3 h-3" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === attachedRefs.length - 1}
                              onClick={() => moveReference(idx, idx + 1)}
                              className="p-0.5 text-[#64748B] hover:text-[#F8FAFC] disabled:opacity-25 cursor-pointer"
                              aria-label="Move right"
                              title="Move right"
                            >
                              <ChevronRight className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        <select
                          value={ref.role}
                          onChange={(e) =>
                            updateReferenceRole(ref.id, e.target.value as ReferenceRole)
                          }
                          aria-label={`Role for Ref ${idx + 1}`}
                          className="w-full bg-[#07090E]/80 border border-white/10 rounded-lg px-1.5 py-1 text-[10px] font-medium text-[#2DD4BF] focus:outline-none focus:border-[#2DD4BF]/50 cursor-pointer"
                        >
                          {REFERENCE_ROLES.map((role) => (
                            <option key={role} value={role} className="bg-[#0B0F18] text-[#F8FAFC]">
                              {role}
                            </option>
                          ))}
                        </select>

                        <button
                          type="button"
                          disabled={isStrippingBg}
                          onClick={() => void handleToggleRefCardBgRemoval(ref)}
                          className={`w-full inline-flex items-center justify-center gap-1 rounded-lg px-1.5 py-1 text-[10px] font-medium border transition-colors cursor-pointer ${
                            ref.backgroundRemoved
                              ? 'bg-white/[0.05] hover:bg-white/[0.1] border-white/10 text-[#94A3B8]'
                              : 'bg-[#2DD4BF]/10 hover:bg-[#2DD4BF]/20 border-[#2DD4BF]/30 text-[#2DD4BF]'
                          }`}
                        >
                          {isStrippingBg ? (
                            <>
                              <Loader2 className="w-2.5 h-2.5 animate-spin" />
                              Removing...
                            </>
                          ) : ref.backgroundRemoved ? (
                            <>
                              <RotateCcw className="w-2.5 h-2.5" />
                              Restore BG
                            </>
                          ) : (
                            <>
                              <Scissors className="w-2.5 h-2.5" />
                              Remove BG Now
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}

                {/* + Add More Slot */}
                {attachedRefs.length < MAX_REFERENCES && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-24 shrink-0 rounded-2xl border border-dashed border-white/15 hover:border-[#2DD4BF]/60 bg-[#07090E]/65 hover:bg-white/[0.04] flex flex-col items-center justify-center gap-1.5 p-2 text-center transition-colors cursor-pointer"
                  >
                    <Plus className="w-5 h-5 text-[#2DD4BF]" />
                    <span className="text-[11px] font-medium text-[#F8FAFC] leading-tight">
                      Add More
                    </span>
                    <span className="text-[10px] text-[#64748B] tabular-nums">
                      {attachedRefs.length}/{MAX_REFERENCES}
                    </span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Main Floating Prompt Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void runGeneration();
            }}
            className="bg-[rgba(17,22,33,0.72)] backdrop-blur-2xl border border-white/10 hover:border-[#2DD4BF]/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_20px_55px_rgba(0,0,0,0.7)] rounded-2xl p-3 space-y-2.5 transition-colors"
          >
            <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
              {/* Clear Image / Video / Talking Scene Mode Toggle */}
              <div className="inline-flex items-center p-1 bg-[#07090E]/80 border border-white/10 rounded-xl shrink-0 w-fit">
                <button
                  type="button"
                  onClick={() => setMode('image')}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    mode === 'image'
                      ? 'bg-[#2DD4BF] text-[#07090E] shadow-[0_0_14px_rgba(45,212,191,0.28)]'
                      : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                  }`}
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  Image
                </button>
                <button
                  type="button"
                  onClick={() => setMode('video')}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    mode === 'video'
                      ? 'bg-[#2DD4BF] text-[#07090E] shadow-[0_0_14px_rgba(45,212,191,0.28)]'
                      : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                  }`}
                >
                  <Video className="w-3.5 h-3.5" />
                  Video
                </button>
                <button
                  type="button"
                  onClick={() => setMode('talking')}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                    mode === 'talking'
                      ? 'bg-[#2DD4BF] text-[#07090E] shadow-[0_0_14px_rgba(45,212,191,0.28)]'
                      : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                  }`}
                >
                  <MessageSquareQuote className="w-3.5 h-3.5" />
                  Talking Scene
                </button>
              </div>

              {/* Clean Text Box */}
              <div className="flex-1 flex items-center gap-2 bg-[#07090E]/75 border border-white/10 focus-within:border-[#2DD4BF]/60 focus-within:ring-2 focus-within:ring-[#2DD4BF]/25 rounded-xl px-3.5 py-2 transition-all">
                <input
                  type="text"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={
                    mode === 'talking'
                      ? 'Action & camera prompt (e.g., smiles warmly and gestures while speaking, slow zoom in)...'
                      : attachedRefs.length > 0
                      ? 'Describe camera moves & actions (e.g., camera moves from the back to the front)...'
                      : 'Describe what you want to create...'
                  }
                  className="w-full bg-transparent text-sm text-[#F8FAFC] placeholder-[#64748B] focus:outline-none"
                />
              </div>

              {/* Electric Mint-Cyan Generate Button */}
              <button
                type="submit"
                disabled={isGenerating || !canSubmit}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#2DD4BF] hover:bg-[#34D399] disabled:opacity-45 text-[#07090E] text-xs font-bold shadow-[0_0_24px_rgba(45,212,191,0.26)] transition-all cursor-pointer shrink-0 whitespace-nowrap"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating...
                  </>
                ) : mode === 'talking' ? (
                  <>
                    <Sparkles className="w-4 h-4" />
                    {dialogueLines.length > 1 || talkingCast.length > 1
                      ? 'Generate Conversation Scene'
                      : 'Generate Talking Scene'}
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Generate
                  </>
                )}
              </button>
            </div>

            {/* Bottom Row: + Add Image / Character & 3 Simple Dropdown Pills */}
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              {mode !== 'talking' && (
                <button
                  type="button"
                  onClick={() => {
                    setPickerTarget('refs');
                    setShowAttachPicker((s) => !s);
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors cursor-pointer ${
                    showAttachPicker || attachedRefs.length > 0
                      ? 'bg-[#2DD4BF]/12 border-[#2DD4BF]/45 text-[#F8FAFC]'
                      : 'bg-[#07090E]/75 hover:border-[#2DD4BF]/40 border-white/10 text-[#F8FAFC]'
                  }`}
                >
                  <Plus className="w-3.5 h-3.5 text-[#2DD4BF]" />
                  Add Image / Character
                  {attachedRefs.length > 0 && (
                    <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-[#2DD4BF] text-[#07090E] text-[10px] font-bold tabular-nums">
                      {attachedRefs.length}
                    </span>
                  )}
                </button>
              )}

              {/* Style Pill */}
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#07090E]/75 hover:border-[#2DD4BF]/35 border border-white/10 text-xs text-[#94A3B8] cursor-pointer transition-colors">
                <Palette className="w-3.5 h-3.5 text-[#2DD4BF] shrink-0" />
                <span className="text-[#64748B]">Style:</span>
                <select
                  value={styleLabel}
                  onChange={(e) => setStyleLabel(e.target.value as SimpleStyleLabel)}
                  className="bg-transparent text-[#F8FAFC] font-medium focus:outline-none cursor-pointer"
                >
                  {(Object.keys(STYLE_MAP) as SimpleStyleLabel[]).map((s) => (
                    <option key={s} value={s} className="bg-[#0B0F18] text-[#F8FAFC]">
                      {s}
                    </option>
                  ))}
                </select>
              </label>

              {/* Camera Pill */}
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#07090E]/75 hover:border-[#2DD4BF]/35 border border-white/10 text-xs text-[#94A3B8] cursor-pointer transition-colors">
                <Camera className="w-3.5 h-3.5 text-[#2DD4BF] shrink-0" />
                <span className="text-[#64748B]">Camera:</span>
                <select
                  value={cameraLabel}
                  onChange={(e) => setCameraLabel(e.target.value as SimpleCameraLabel)}
                  className="bg-transparent text-[#F8FAFC] font-medium focus:outline-none cursor-pointer"
                >
                  {(Object.keys(CAMERA_MAP) as SimpleCameraLabel[]).map((c) => (
                    <option key={c} value={c} className="bg-[#0B0F18] text-[#F8FAFC]">
                      {c}
                    </option>
                  ))}
                </select>
              </label>

              {/* Size Selector */}
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#07090E]/75 hover:border-[#2DD4BF]/35 border border-white/10 text-xs text-[#94A3B8] cursor-pointer transition-colors whitespace-nowrap">
                <Monitor className="w-3.5 h-3.5 text-[#2DD4BF] shrink-0" />
                <span className="text-[#64748B]">Size:</span>
                <select
                  value={sizeLabel}
                  onChange={(e) => setSizeLabel(e.target.value as SimpleSizeLabel)}
                  className="bg-transparent text-[#F8FAFC] font-medium focus:outline-none cursor-pointer"
                >
                  {(Object.keys(SIZE_MAP) as SimpleSizeLabel[]).map((sz) => (
                    <option key={sz} value={sz} className="bg-[#0B0F18] text-[#F8FAFC]">
                      {sz}
                    </option>
                  ))}
                </select>
              </label>

              {/* Quality Selector */}
              {mode === 'image' && (
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#07090E]/75 hover:border-[#2DD4BF]/35 border border-white/10 text-xs text-[#94A3B8] cursor-pointer transition-colors whitespace-nowrap">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-[#2DD4BF] shrink-0" />
                  <span className="text-[#64748B]">Quality:</span>
                  <select
                    value={qualityTier}
                    onChange={(e) => setQualityTier(e.target.value as ImageQualityTier)}
                    aria-label="Output quality"
                    className="bg-transparent text-[#F8FAFC] font-medium focus:outline-none cursor-pointer"
                  >
                    {QUALITY_OPTIONS.map((q) => (
                      <option key={q.value} value={q.value} className="bg-[#0B0F18] text-[#F8FAFC]">
                        {q.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
