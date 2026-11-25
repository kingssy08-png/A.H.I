import { getActiveColabUrl } from '../utils/turboGpuConfig';
import type {
  AnimationStyle,
  AspectRatio,
  CameraMotion,
  CharacterExpressionView,
  CharacterProfile,
  FoleySfxId,
  GeminiVoiceName,
  ImageEngine,
  Scene,
  ShowBible,
  StoryboardData,
  StoryBeatTag,
  TalkingShotAngle,
  TalkingVoicePreset,
  VideoReferenceItem,
  VoiceArchetype,
} from '../types/studio';

export type { TalkingShotAngle, TalkingVoicePreset };

export interface GenerateScriptPayload {
  storyIdea: string;
  style: AnimationStyle;
  targetDurationSeconds: number;
  aspectRatio: AspectRatio;
  cameraMotion?: CameraMotion;
  characters: Array<{
    id?: string;
    name: string;
    role: string;
    appearancePrompt: string;
    voiceArchetype?: VoiceArchetype;
  }>;
  tone?: string;
  showBible?: Pick<
    ShowBible,
    'showTitle' | 'visualStyle' | 'lockVisualStyle' | 'worldSetting' | 'targetAgeGroup'
  > | null;
  kidsShowMode?: boolean;
}

export interface GeneratedScriptResponse {
  title: string;
  logline: string;
  styleNotes: string;
  suggestedMusicMood: string;
  scenes: Array<
    Omit<Scene, 'id' | 'dialogueLines'> & {
      storyBeat?: StoryBeatTag;
      assignedCharacterIds?: string[];
      cameraMotion?: CameraMotion;
      sfxPresetId?: FoleySfxId;
      dialogueLines: Array<{ speaker: string; emotion: string; line: string }>;
    }
  >;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed with status ${res.status}`);
  }
  return data as T;
}

export async function checkServerHealth(): Promise<{
  ok: boolean;
  hasApiKey: boolean;
  hasCloudflareAi?: boolean;
  hasHfToken?: boolean;
}> {
  const res = await fetch('/api/health');
  if (!res.ok) {
    return { ok: false, hasApiKey: false, hasCloudflareAi: false };
  }
  return res.json();
}

export function testColabTurboConnection(colabUrl: string): Promise<{
  ok: boolean;
  normalizedUrl: string;
  host: string;
  endpoints: string[];
  latencyMs: number;
}> {
  return postJson('/api/turbo/test-colab', { colabUrl });
}

export function generateScript(payload: GenerateScriptPayload): Promise<GeneratedScriptResponse> {
  return postJson<GeneratedScriptResponse>('/api/scripts/generate', payload);
}

export function refineSceneWithAi(payload: {
  scene: Scene;
  instruction: string;
  style: AnimationStyle;
  projectTitle: string;
}): Promise<Omit<Scene, 'id' | 'dialogueLines'> & { dialogueLines: Array<{ speaker: string; emotion: string; line: string }> }> {
  return postJson('/api/scripts/refine-scene', payload);
}

export function generateSceneStoryboard(payload: {
  scene: Scene;
  style: AnimationStyle;
  aspectRatio: AspectRatio;
  projectTitle: string;
}): Promise<StoryboardData> {
  return postJson<StoryboardData>('/api/storyboard/generate', payload);
}

export function generateCharacterSheet(payload: {
  concept: string;
  styleAffinity: AnimationStyle;
}): Promise<Omit<CharacterProfile, 'id' | 'avatarUrl'>> {
  return postJson('/api/characters/generate', payload);
}

export function generateCharacterExpressionSheet(payload: {
  name: string;
  appearancePrompt: string;
  styleAffinity: AnimationStyle;
  avatarImageUrl?: string;
  colabUrl?: string;
}): Promise<{
  expressions: CharacterExpressionView[];
  visualDna: string;
}> {
  return postJson('/api/characters/expression-sheet', {
    ...payload,
    colabUrl: payload.colabUrl ?? getActiveColabUrl(),
  });
}

export function synthesizeVoiceover(payload: {
  text: string;
  voiceName: GeminiVoiceName;
  styleInstruction: string;
}): Promise<{ audioBase64: string; mimeType: string; voiceName: GeminiVoiceName }> {
  return postJson('/api/voice/synthesize', payload);
}

export interface HfVideoProgressEvent {
  type: 'status' | 'complete' | 'error';
  message?: string;
  space?: string;
  nodeLabel?: string;
  provider?: 'cloudflare' | 'colab-turbo' | 'huggingface';
  elapsedMs?: number;
  attempt?: number;
  totalAttempts?: number;
  progress?: number;
  translatedPrompt?: string;
  queuePosition?: number;
  eta?: number;
  videoUrl?: string;
  imageDataUrl?: string;
  compositedImageDataUrl?: string;
  audioDataUrl?: string;
  spaceUsed?: string;
  width?: number;
  height?: number;
  mode?: 'text-to-video' | 'image-to-video' | 'lipsync';
  error?: string;
}

export async function generateHfImage(
  payload: {
    prompt: string;
    style: AnimationStyle;
    aspectRatio?: AspectRatio;
    engine?: ImageEngine;
    spaceId?: string;
    colabUrl?: string;
  },
  onProgress?: (event: HfVideoProgressEvent) => void
): Promise<{
  imageDataUrl: string;
  spaceUsed: string;
  nodeLabel: string;
  provider?: 'cloudflare' | 'colab-turbo' | 'huggingface';
  elapsedMs?: number;
  translatedPrompt: string;
  width: number;
  height: number;
}> {
  const requestBody = {
    ...payload,
    colabUrl: payload.colabUrl ?? getActiveColabUrl(),
  };

  if (!onProgress) {
    return postJson('/api/hf/generate-image', requestBody);
  }

  const res = await fetch('/api/hf/generate-image-stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  if (!res.ok || !res.body) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || `Image generation failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalResult: {
    imageDataUrl: string;
    spaceUsed: string;
    nodeLabel: string;
    provider?: 'cloudflare' | 'colab-turbo' | 'huggingface';
    elapsedMs?: number;
    translatedPrompt: string;
    width: number;
    height: number;
  } | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n\n');
    buffer = lines.pop() ?? '';

    for (const chunk of lines) {
      const dataLine = chunk.split('\n').find((l) => l.startsWith('data: '));
      if (!dataLine) continue;
      const evt = JSON.parse(dataLine.slice(6)) as HfVideoProgressEvent;
      onProgress(evt);
      if (evt.type === 'error') {
        throw new Error(evt.error || 'Image generation failed on GPU node.');
      }
      if (evt.type === 'complete' && evt.imageDataUrl) {
        finalResult = {
          imageDataUrl: evt.imageDataUrl,
          spaceUsed: evt.spaceUsed ?? '@cf/black-forest-labs/flux-1-schnell',
          nodeLabel: evt.nodeLabel ?? evt.spaceUsed ?? 'Turbo GPU Node',
          provider: evt.provider,
          elapsedMs: evt.elapsedMs,
          translatedPrompt: evt.translatedPrompt ?? payload.prompt,
          width: evt.width ?? 1024,
          height: evt.height ?? 1024,
        };
      }
    }
  }

  if (!finalResult) {
    throw new Error('Image generation stream ended without returning an image.');
  }
  return finalResult;
}

export function generateHfCharacterImage(
  payload: {
    prompt: string;
    style: AnimationStyle;
    spaceId?: string;
    colabUrl?: string;
  },
  onProgress?: (event: HfVideoProgressEvent) => void
): Promise<{
  imageDataUrl: string;
  spaceUsed: string;
  nodeLabel: string;
  provider?: 'cloudflare' | 'colab-turbo' | 'huggingface';
  elapsedMs?: number;
  translatedPrompt: string;
}> {
  return generateHfImage(
    {
      ...payload,
      aspectRatio: '1:1',
      engine: 'flux-schnell',
    },
    onProgress
  );
}

async function consumeSseVideoStream(
  url: string,
  payload: unknown,
  onProgress: (event: HfVideoProgressEvent) => void
): Promise<{
  videoUrl: string;
  compositedImageDataUrl?: string;
  audioDataUrl?: string;
  spaceUsed: string;
  nodeLabel: string;
  provider?: 'cloudflare' | 'colab-turbo' | 'huggingface';
  elapsedMs?: number;
  translatedPrompt?: string;
  mode: 'text-to-video' | 'image-to-video' | 'lipsync';
}> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok || !res.body) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || `Generation request failed (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalResult: {
    videoUrl: string;
    compositedImageDataUrl?: string;
    audioDataUrl?: string;
    spaceUsed: string;
    nodeLabel: string;
    provider?: 'cloudflare' | 'colab-turbo' | 'huggingface';
    elapsedMs?: number;
    translatedPrompt?: string;
    mode: 'text-to-video' | 'image-to-video' | 'lipsync';
  } | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n\n');
    buffer = lines.pop() ?? '';

    for (const chunk of lines) {
      const dataLine = chunk.split('\n').find((l) => l.startsWith('data: '));
      if (!dataLine) continue;
      const evt = JSON.parse(dataLine.slice(6)) as HfVideoProgressEvent;
      onProgress(evt);
      if (evt.type === 'error') {
        throw new Error(evt.error || 'Generation failed on video node.');
      }
      if (evt.type === 'complete' && evt.videoUrl) {
        finalResult = {
          videoUrl: evt.videoUrl,
          compositedImageDataUrl: evt.compositedImageDataUrl,
          audioDataUrl: evt.audioDataUrl,
          spaceUsed: evt.spaceUsed ?? 'Lightricks/ltx-video-distilled',
          nodeLabel: evt.nodeLabel ?? evt.spaceUsed ?? 'Fast Video Node',
          provider: evt.provider,
          elapsedMs: evt.elapsedMs,
          translatedPrompt: evt.translatedPrompt,
          mode: evt.mode ?? 'text-to-video',
        };
      }
    }
  }

  if (!finalResult) {
    throw new Error('Generation stream ended without returning a video clip.');
  }
  return finalResult;
}

export function generateHfVideoClip(
  payload: {
    prompt: string;
    mode: 'text-to-video' | 'image-to-video';
    imageDataUrl?: string;
    animateExactFrame?: boolean;
    referenceImages?: Array<Pick<VideoReferenceItem, 'imageUrl' | 'role' | 'label' | 'description'>>;
    style: AnimationStyle;
    aspectRatio?: AspectRatio;
    cameraMotion?: CameraMotion;
    spaceId?: string;
    colabUrl?: string;
  },
  onProgress: (event: HfVideoProgressEvent) => void
) {
  return consumeSseVideoStream(
    '/api/hf/generate-video',
    {
      ...payload,
      colabUrl: payload.colabUrl ?? getActiveColabUrl(),
    },
    onProgress
  );
}

export function generateHfLipSyncClip(
  payload: {
    imageDataUrl: string;
    audioBase64?: string;
    spaceId?: string;
    colabUrl?: string;
  },
  onProgress: (event: HfVideoProgressEvent) => void
) {
  return consumeSseVideoStream(
    '/api/hf/lipsync',
    {
      ...payload,
      colabUrl: payload.colabUrl ?? getActiveColabUrl(),
    },
    onProgress
  );
}

export function generateTalkingSceneClip(
  payload: {
    characterImageUrl: string;
    characterLabel?: string;
    coStarCharacters?: Array<{ imageUrl: string; label: string }>;
    shotAngle?: TalkingShotAngle;
    backgroundImageUrl?: string;
    backgroundPrompt?: string;
    dialogue?: string;
    voicePreset?: TalkingVoicePreset;
    voiceName?: GeminiVoiceName;
    voiceStyleInstruction?: string;
    voicePitch?: number;
    voiceSpeed?: number;
    customAudioBase64?: string;
    actionPrompt?: string;
    style: AnimationStyle;
    aspectRatio?: AspectRatio;
    spaceId?: string;
    colabUrl?: string;
  },
  onProgress: (event: HfVideoProgressEvent) => void
) {
  return consumeSseVideoStream(
    '/api/hf/talking-scene',
    {
      ...payload,
      colabUrl: payload.colabUrl ?? getActiveColabUrl(),
    },
    onProgress
  );
}
