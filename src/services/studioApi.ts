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

class HttpApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function extractErrorMessage(res: Response, fallback: string): Promise<string> {
  const rawText = await res.text().catch(() => '');
  if (rawText) {
    try {
      const parsed = JSON.parse(rawText) as { error?: string };
      if (parsed && typeof parsed.error === 'string' && parsed.error.trim()) {
        return parsed.error.trim();
      }
    } catch {
      const trimmed = rawText.trim();
      if (trimmed && !trimmed.startsWith('<!') && !trimmed.startsWith('<html')) {
        return trimmed.slice(0, 220);
      }
    }
  }
  return fallback;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const msg = await extractErrorMessage(res, `Request failed with status ${res.status}`);
    throw new HttpApiError(res.status, msg);
  }
  return (await res.json()) as T;
}

export async function checkServerHealth(): Promise<{
  ok: boolean;
  hasApiKey: boolean;
  hasCloudflareAi?: boolean;
  hasHfToken?: boolean;
}> {
  try {
    const res = await fetch('/api/health');
    if (!res.ok) {
      return { ok: false, hasApiKey: false, hasCloudflareAi: false };
    }
    return await res.json();
  } catch {
    return { ok: false, hasApiKey: false, hasCloudflareAi: false };
  }
}

export function testColabTurboConnection(colabUrl: string): Promise<{
  ok: boolean;
  normalizedUrl: string;
  host: string;
  endpoints: string[];
  latencyMs: number;
}> {
  return postJson('/api/test-colab', { colabUrl });
}

export function generateScript(payload: GenerateScriptPayload): Promise<GeneratedScriptResponse> {
  return postJson<GeneratedScriptResponse>('/api/generate-script', {
    ...payload,
    action: 'generate',
  });
}

export function refineSceneWithAi(payload: {
  scene: Scene;
  instruction: string;
  style: AnimationStyle;
  projectTitle: string;
}): Promise<
  Omit<Scene, 'id' | 'dialogueLines'> & {
    dialogueLines: Array<{ speaker: string; emotion: string; line: string }>;
  }
> {
  return postJson('/api/generate-script', {
    ...payload,
    action: 'refine-scene',
  });
}

export function generateSceneStoryboard(payload: {
  scene: Scene;
  style: AnimationStyle;
  aspectRatio: AspectRatio;
  projectTitle: string;
}): Promise<StoryboardData> {
  return postJson<StoryboardData>('/api/generate-script', {
    ...payload,
    action: 'storyboard',
  });
}

export function generateCharacterSheet(payload: {
  concept: string;
  styleAffinity: AnimationStyle;
}): Promise<Omit<CharacterProfile, 'id' | 'avatarUrl'>> {
  return postJson('/api/characters', {
    ...payload,
    action: 'generate',
  });
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
  return postJson('/api/characters', {
    ...payload,
    action: 'expression-sheet',
    colabUrl: payload.colabUrl ?? getActiveColabUrl(),
  });
}

export function synthesizeVoiceover(payload: {
  text: string;
  voiceName: GeminiVoiceName;
  styleInstruction: string;
}): Promise<{ audioBase64: string; mimeType: string; voiceName: GeminiVoiceName }> {
  return postJson('/api/voice', payload);
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

const CLIENT_STYLE_CUES: Record<string, string> = {
  '3D Pixar-Style Cartoon':
    '3D Pixar-style animated feature film aesthetic, subsurface scattering, expressive eyes, warm rim lighting, crisp 35mm depth-of-field',
  '3D Cartoon': '3D animated cartoon feature aesthetic, vibrant color grading, warm rim highlights',
  Anime: 'high-budget theatrical anime animation, crisp cel-shaded linework, luminous atmospheric lighting',
  'Cinematic Film': '35mm anamorphic cinema film look, moody volumetric light, rich contrast',
  '2D Illustration': 'hand-crafted 2D editorial illustration aesthetic, rich gouache brushwork',
  'Music Video': 'high-energy stylized music video cinematography, vibrant neon and rim lighting',
  'Product Ad': 'luxury commercial product studio macro photography, crisp specular highlights',
  Realistic: 'photorealistic live-action cinema camera aesthetic, natural lens clarity',
  Educational: 'clean 2.5D motion graphics explainer aesthetic, crisp geometric clarity',
};

const CLIENT_DIMS_BY_RATIO: Record<string, { w: number; h: number }> = {
  '16:9': { w: 1280, h: 720 },
  '9:16': { w: 720, h: 1280 },
  '1:1': { w: 1024, h: 1024 },
  '21:9': { w: 1344, h: 576 },
};

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string' && reader.result.startsWith('data:')) {
        resolve(reader.result);
      } else {
        reject(new Error('Could not convert generated image blob to data URL.'));
      }
    };
    reader.onerror = () => reject(new Error('Failed reading generated image blob.'));
    reader.readAsDataURL(blob);
  });
}

async function generatePollinationsBrowserFallback(
  prompt: string,
  style: AnimationStyle,
  aspectRatio: AspectRatio = '16:9',
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
  const started = Date.now();
  const dims = CLIENT_DIMS_BY_RATIO[aspectRatio] ?? { w: 1024, h: 1024 };
  const styleCue = CLIENT_STYLE_CUES[style] ?? `${style} aesthetic`;
  const enhancedPrompt = `${prompt.trim().slice(0, 700)}, ${styleCue}, crisp detail, studio lighting, clean framing, no text, no watermark`;
  const seed = Date.now();
  const encoded = encodeURIComponent(enhancedPrompt);

  onProgress?.({
    type: 'status',
    space: 'pollinations/flux-browser',
    nodeLabel: 'Direct Browser Fallback',
    provider: 'huggingface',
    progress: 85,
    translatedPrompt: enhancedPrompt,
    message: 'Connecting directly from browser to open-source image engine...',
  });

  const candidateUrls = [
    `https://image.pollinations.ai/prompt/${encoded}?width=${dims.w}&height=${dims.h}&nologo=true&seed=${seed}`,
    `https://image.pollinations.ai/prompt/${encoded}?width=1024&height=1024&nologo=true&seed=${seed + 1}`,
  ];

  let lastErr = 'Free open-source image endpoint did not respond in time.';
  for (const url of candidateUrls) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 30000);
    try {
      const res = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
      });
      if (!res.ok) {
        lastErr = `Direct fallback endpoint returned HTTP ${res.status}`;
        continue;
      }
      const blob = await res.blob();
      if (!blob.size || (!blob.type.startsWith('image/') && blob.size < 256)) {
        lastErr = 'Direct fallback returned invalid image bytes.';
        continue;
      }
      const imageDataUrl = await blobToDataUrl(blob);
      const elapsedMs = Date.now() - started;
      const result = {
        imageDataUrl,
        spaceUsed: 'pollinations/flux',
        nodeLabel: 'Open-Source Direct Engine',
        provider: 'huggingface' as const,
        elapsedMs,
        translatedPrompt: enhancedPrompt,
        width: dims.w,
        height: dims.h,
      };
      onProgress?.({
        type: 'complete',
        ...result,
        progress: 100,
      });
      return result;
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    } finally {
      window.clearTimeout(timer);
    }
  }

  throw new Error(lastErr);
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

  if (payload.prompt.trim().length < 4) {
    throw new HttpApiError(400, 'Please provide an image prompt of at least 4 characters.');
  }

  if (!onProgress) {
    try {
      return await postJson('/api/generate-image', requestBody);
    } catch (err) {
      if (err instanceof HttpApiError && err.status === 400) {
        throw err;
      }
      return await generatePollinationsBrowserFallback(
        payload.prompt,
        payload.style,
        payload.aspectRatio
      );
    }
  }

  try {
    const res = await fetch('/api/generate-image?stream=1', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({ ...requestBody, stream: true }),
    });

    if (!res.ok || !res.body) {
      if (res.status === 400) {
        const msg = await extractErrorMessage(res, `Image generation failed (${res.status})`);
        throw new HttpApiError(400, msg);
      }
      try {
        return await postJson('/api/generate-image', requestBody);
      } catch (jsonErr) {
        if (jsonErr instanceof HttpApiError && jsonErr.status === 400) {
          throw jsonErr;
        }
        return await generatePollinationsBrowserFallback(
          payload.prompt,
          payload.style,
          payload.aspectRatio,
          onProgress
        );
      }
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

    if (finalResult) {
      return finalResult;
    }
  } catch (streamErr) {
    if (streamErr instanceof HttpApiError && streamErr.status === 400) {
      throw streamErr;
    }
    try {
      return await postJson('/api/generate-image', requestBody);
    } catch (jsonErr) {
      if (jsonErr instanceof HttpApiError && jsonErr.status === 400) {
        throw jsonErr;
      }
      return await generatePollinationsBrowserFallback(
        payload.prompt,
        payload.style,
        payload.aspectRatio,
        onProgress
      );
    }
  }

  return await generatePollinationsBrowserFallback(
    payload.prompt,
    payload.style,
    payload.aspectRatio,
    onProgress
  );
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
    const errMsg = await extractErrorMessage(res, `Generation request failed (${res.status})`);
    throw new Error(errMsg);
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
    '/api/generate-video',
    {
      ...payload,
      action: 'video',
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
    '/api/generate-video',
    {
      ...payload,
      action: 'lipsync',
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
    '/api/generate-video',
    {
      ...payload,
      action: 'talking-scene',
      colabUrl: payload.colabUrl ?? getActiveColabUrl(),
    },
    onProgress
  );
}
