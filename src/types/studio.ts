export type StudioView =
  | 'home'
  | 'text-to-image'
  | 'text-to-video'
  | 'image-to-video'
  | 'motion'
  | 'characters'
  | 'voice'
  | 'projects'
  | 'export';

export type AnimationStyle =
  | '3D Pixar-Style Cartoon'
  | 'Anime'
  | 'Cinematic Film'
  | '2D Illustration'
  | 'Music Video'
  | 'Product Ad'
  | 'Realistic'
  | '3D Cartoon'
  | 'Educational';

export type AspectRatio = '16:9' | '9:16' | '1:1' | '21:9';

export type CameraMotion =
  | 'Auto'
  | 'Zoom In'
  | 'Zoom Out'
  | 'Pan Left'
  | 'Pan Right'
  | 'Orbit'
  | 'Drone Flyover'
  | 'Static';

export type ImageEngine = 'flux-schnell' | 'sdxl';

export type GeminiVoiceName = 'Kore' | 'Puck' | 'Charon' | 'Fenrir' | 'Zephyr';

export type TalkingVoicePreset = 'male' | 'female' | 'cartoon' | 'mentor' | 'bright';

export type TalkingShotAngle = 'two-shot' | 'close-up' | 'over-shoulder';

export type VoiceArchetype =
  | 'Energetic Kid Hero'
  | 'Wise Gentle Elder'
  | 'Silly Sidekick'
  | 'Warm Storyteller'
  | 'Curious Explorer';

export type ShowTargetAge =
  | 'Ages 3-5 (Preschool)'
  | 'Ages 6-8 (Early Kids)'
  | 'Ages 9-12 (Tween Adventure)'
  | 'All-Ages Family';

export type StoryBeatTag =
  | 'Hook'
  | 'Adventure'
  | 'Funny Moment'
  | 'Heartwarming Lesson'
  | 'Outro';

export type FoleySfxId =
  | 'none'
  | 'sparkle'
  | 'boing'
  | 'footsteps'
  | 'whoosh'
  | 'nature'
  | 'fanfare';

export interface ShowBible {
  id: string;
  showTitle: string;
  visualStyle: AnimationStyle;
  lockVisualStyle: boolean;
  worldSetting: string;
  targetAgeGroup: ShowTargetAge;
  updatedAt: string;
}

export interface CharacterExpressionView {
  expression: 'Happy' | 'Surprised' | 'Determined' | 'Turnaround';
  imageUrl: string;
}

export type ReferenceRole =
  | 'Character'
  | 'Outfit / Prop'
  | 'Background / Scene'
  | 'Style';

export interface VideoReferenceItem {
  id: string;
  imageUrl: string;
  label: string;
  role: ReferenceRole;
  description?: string;
}

export interface GeneratedImageItem {
  id: string;
  prompt: string;
  style: AnimationStyle;
  aspectRatio: AspectRatio;
  engine: ImageEngine;
  spaceUsed: string;
  imageDataUrl: string;
  createdAt: string;
}

export interface ShowcaseItem {
  id: string;
  title: string;
  creator: string;
  category: '3D Cartoons' | 'Anime' | 'Cinematic Shots' | 'Product Ads';
  style: AnimationStyle;
  aspectRatio: AspectRatio;
  cameraMotion: CameraMotion;
  prompt: string;
  imageUrl: string;
  engineLabel: string;
}

export interface DialogueLine {
  id: string;
  speaker: string;
  emotion: string;
  line: string;
}

export interface StoryboardKeyframe {
  id: string;
  beatLabel: string;
  caption: string;
  cameraMotion: string;
  svgMarkup: string;
}

export interface StoryboardData {
  sketchNotes: string;
  paletteHexes: string[];
  keyframes: StoryboardKeyframe[];
  generatedAt: string;
}

export type StockAssetType = 'image' | 'video' | 'music';

export interface StockAsset {
  id: string;
  type: StockAssetType;
  title: string;
  category: string;
  tags: string[];
  durationLabel: string;
  durationSeconds?: number;
  resolutionOrBpm: string;
  previewImageUrl?: string;
  motionPreset?: 'harbor-mist' | 'clockwork-gears' | 'starfield-warp' | 'orbital-rings' | 'rain-streaks' | 'sunbeam-dust';
  accentColor: string;
  musicConfig?: {
    bpm: number;
    baseFreq: number;
    scaleIntervals: number[];
    waveform: OscillatorType;
  };
}

export interface Scene {
  id: string;
  sceneNumber: number;
  title: string;
  storyBeat?: StoryBeatTag;
  durationSeconds: number;
  cameraAngle: string;
  cameraMotion?: CameraMotion;
  lightingMood: string;
  actionDescription: string;
  visualPrompt: string;
  narration: string;
  dialogueLines: DialogueLine[];
  assignedCharacterIds?: string[];
  sfxCue: string;
  sfxPresetId?: FoleySfxId;
  transition: string;
  storyboard?: StoryboardData;
  attachedAssets?: StockAsset[];
  generatedVideoUrl?: string;
  generatedVideoSpace?: string;
  generatedVideoMode?: 'text-to-video' | 'image-to-video' | 'lipsync';
  lipSyncVideoUrl?: string;
  voiceAudioBase64?: string;
  voiceName?: GeminiVoiceName;
  browserVoiceName?: string;
  browserVoiceRate?: number;
  browserVoicePitch?: number;
}

export interface VideoProject {
  id: string;
  title: string;
  seriesTitle?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  targetAgeGroup?: ShowTargetAge;
  logline: string;
  storyIdea: string;
  style: AnimationStyle;
  aspectRatio: AspectRatio;
  styleNotes: string;
  suggestedMusicMood: string;
  selectedMusicId: string;
  characterIds: string[];
  scenes: Scene[];
  thumbnailUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CharacterProfile {
  id: string;
  name: string;
  role: string;
  styleAffinity: AnimationStyle;
  appearancePrompt: string;
  personalityTraits: string[];
  voiceName: GeminiVoiceName;
  voiceStyle: string;
  voiceArchetype?: VoiceArchetype;
  voicePreset?: TalkingVoicePreset;
  voicePitch?: number;
  voiceSpeed?: number;
  lockedVoice?: boolean;
  signatureProps: string;
  colorPalette: string[];
  avatarUrl?: string;
  avatarSource?: 'studio' | 'flux' | 'upload';
  expressionSheet?: CharacterExpressionView[];
  browserVoiceName?: string;
}

export interface VoiceClip {
  id: string;
  label: string;
  text: string;
  voiceName: GeminiVoiceName;
  styleInstruction: string;
  audioBase64: string;
  createdAt: string;
  sceneId?: string;
}

export interface MusicTrackPreset {
  id: string;
  title: string;
  mood: string;
  bpm: number;
  baseFreq: number;
  scaleIntervals: number[];
  waveform: OscillatorType;
  description: string;
}

export interface StudioCreation {
  id: string;
  mode: 'image' | 'video';
  prompt: string;
  style: string;
  aspectRatio: AspectRatio;
  mediaUrl: string;
  createdAt: string;
}
