import { Client } from '@gradio/client';
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

const WARM_STORYBOOK_3D_MODIFIERS =
  'soft-focus vintage cinema lens, dreamy halation and warm sunlit bloom, gentle mist diffusion filter (Pro-Mist 1/2), low micro-contrast, soft pastel matte clay and felt textures, slightly blurred soft edges, warm overexposed sunlit sky in background, cozy handcrafted animated film still, 35mm film softness—strictly avoid razor-sharp focus, avoid ultra-detailed pores or sharp fabric lines, avoid high-contrast HDR, avoid glossy studio lighting.';

const WARM_STORYBOOK_3D_FRAMING =
  'wide 16:9 candid full-scene movie frame with foreground and background layers where characters interact naturally in a warm sunlit environment rather than sharp close-up portraits';

const WARM_STORYBOOK_3D_NEGATIVE_PROMPT =
  'razor-sharp focus, ultra-detailed pores, sharp fabric lines, high-contrast HDR, glossy studio lighting, close-up portrait, text, watermark, signature, artifacts';

const CLIENT_STYLE_CUES: Record<string, string> = {
  'Warm Storybook 3D': `${WARM_STORYBOOK_3D_FRAMING}, ${WARM_STORYBOOK_3D_MODIFIERS}`,
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

function withBrowserTimeout<T>(
  promise: Promise<T>,
  ms: number,
  timeoutMessage: string
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(timeoutMessage)), ms);
    promise
      .then((val) => {
        window.clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        window.clearTimeout(timer);
        reject(err);
      });
  });
}

function extractBrowserGradioImageUrl(payload: unknown): string | null {
  if (!payload) return null;
  if (typeof payload === 'string') {
    if (payload.startsWith('https://') || payload.startsWith('data:image/')) {
      return payload;
    }
    return null;
  }
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = extractBrowserGradioImageUrl(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof payload === 'object') {
    const rec = payload as Record<string, unknown>;
    if (typeof rec.url === 'string' && (rec.url.startsWith('https://') || rec.url.startsWith('data:image/'))) {
      return rec.url;
    }
    if (rec.image) {
      const im = extractBrowserGradioImageUrl(rec.image);
      if (im) return im;
    }
    for (const val of Object.values(rec)) {
      const found = extractBrowserGradioImageUrl(val);
      if (found) return found;
    }
  }
  return null;
}

const HF_BROWSER_FLUX_SPACES = [
  'black-forest-labs/FLUX.1-schnell',
  'stabilityai/stable-diffusion-3.5-large-turbo',
  'prodia/fast-stable-diffusion',
];

const HF_BROWSER_SDXL_SPACES = [
  'stabilityai/stable-diffusion-3.5-large-turbo',
  'black-forest-labs/FLUX.1-schnell',
  'prodia/fast-stable-diffusion',
];

async function generateHfSpaceBrowserFallback(
  payload: {
    prompt: string;
    style: AnimationStyle;
    aspectRatio?: AspectRatio;
    engine?: ImageEngine;
    spaceId?: string;
  },
  onProgress?: (event: HfVideoProgressEvent) => void
): Promise<{
  imageDataUrl: string;
  imageUrl: string;
  spaceUsed: string;
  nodeLabel: string;
  provider?: 'cloudflare' | 'colab-turbo' | 'huggingface';
  elapsedMs?: number;
  translatedPrompt: string;
  width: number;
  height: number;
}> {
  const started = Date.now();
  const isWarmStorybook = payload.style === 'Warm Storybook 3D';
  const dims = CLIENT_DIMS_BY_RATIO[payload.aspectRatio ?? '16:9'] ?? { w: 1280, h: 720 };
  const styleCue = CLIENT_STYLE_CUES[payload.style] ?? `${payload.style} aesthetic`;
  const enhancedPrompt = isWarmStorybook
    ? `${payload.prompt.trim().slice(0, 520)}, ${WARM_STORYBOOK_3D_FRAMING}, ${WARM_STORYBOOK_3D_MODIFIERS}, no text, no watermark`
    : `${payload.prompt.trim().slice(0, 700)}, ${styleCue}, crisp detail, studio lighting, clean framing, no text, no watermark`;

  const useSdxl = payload.engine === 'sdxl';
  const baseSpaces = useSdxl ? HF_BROWSER_SDXL_SPACES : HF_BROWSER_FLUX_SPACES;
  const customSpace =
    typeof payload.spaceId === 'string' && /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(payload.spaceId.trim())
      ? payload.spaceId.trim()
      : null;
  const candidates = customSpace
    ? [customSpace, ...baseSpaces.filter((s) => s !== customSpace)]
    : baseSpaces;

  let lastErr = 'Public Hugging Face ZeroGPU Spaces are temporarily busy.';

  for (let i = 0; i < candidates.length; i++) {
    const spaceId = candidates[i];
    const nodeLabel = `Hugging Face Browser Direct (${spaceId})`;
    onProgress?.({
      type: 'status',
      space: spaceId,
      nodeLabel,
      provider: 'huggingface',
      attempt: i + 1,
      totalAttempts: candidates.length,
      progress: Math.min(90, 70 + i * 10),
      translatedPrompt: enhancedPrompt,
      message: `Connecting directly in browser via WebSockets to ${spaceId}...`,
    });

    try {
      const client = await withBrowserTimeout(
        Client.connect(spaceId),
        15000,
        `${spaceId} WebSocket connection timed out.`
      );
      const api = await withBrowserTimeout(
        client.view_api(),
        10000,
        `${spaceId} API inspection timed out.`
      );

      const namedEndpoints = Object.keys(api.named_endpoints ?? {});
      const endpoint =
        namedEndpoints.find((k) => /^\/?(infer|txt2img|generate|predict)$/i.test(k)) ??
        namedEndpoints[0] ??
        0;

      const epInfo =
        typeof endpoint === 'string'
          ? api.named_endpoints?.[endpoint]
          : api.unnamed_endpoints?.[0];
      const paramsMeta = epInfo?.parameters ?? [];

      const isSd35OrProdia =
        spaceId.includes('stable-diffusion-3.5') || spaceId.includes('prodia');
      const gradioPayload: Record<string, unknown> = {};

      for (const p of paramsMeta) {
        const name = p.parameter_name;
        if (!name) continue;
        const lower = name.toLowerCase();
        if (
          (lower === 'prompt' || lower === 'positive_prompt' || lower === 'text') &&
          !lower.includes('negative')
        ) {
          gradioPayload[name] = enhancedPrompt;
        } else if (lower.includes('negative')) {
          gradioPayload[name] = isWarmStorybook
            ? WARM_STORYBOOK_3D_NEGATIVE_PROMPT
            : 'text, watermark, signature, blurry, low quality, artifacts';
        } else if (lower === 'randomize_seed') {
          gradioPayload[name] = true;
        } else if (lower === 'width') {
          gradioPayload[name] = dims.w;
        } else if (lower === 'height') {
          gradioPayload[name] = dims.h;
        } else if (lower === 'num_inference_steps' || lower === 'steps') {
          gradioPayload[name] = isSd35OrProdia ? 8 : 4;
        } else if (lower === 'guidance_scale' || lower === 'cfg' || lower === 'cfg_scale') {
          gradioPayload[name] = isSd35OrProdia ? 1.5 : 0;
        } else if (p.parameter_has_default) {
          gradioPayload[name] = p.parameter_default;
        }
      }

      const predResult = await withBrowserTimeout(
        client.predict(
          endpoint,
          Object.keys(gradioPayload).length > 0 ? gradioPayload : [enhancedPrompt]
        ),
        42000,
        `${spaceId} GPU queue timeout reached.`
      );

      const mediaUrl = extractBrowserGradioImageUrl(predResult.data);
      if (!mediaUrl) {
        lastErr = `${spaceId} did not return a valid image URL.`;
        continue;
      }

      let imageDataUrl = mediaUrl;
      if (!mediaUrl.startsWith('data:image/')) {
        try {
          const imgRes = await withBrowserTimeout(
            fetch(mediaUrl),
            15000,
            `${spaceId} image download timed out.`
          );
          if (imgRes.ok) {
            const blob = await imgRes.blob();
            if (blob.size > 64) {
              imageDataUrl = await blobToDataUrl(blob);
            }
          }
        } catch {
          // Keep direct HTTPS URL if browser blob read fails
        }
      }

      const elapsedMs = Date.now() - started;
      const finalPayload = {
        imageDataUrl,
        imageUrl: imageDataUrl,
        spaceUsed: spaceId,
        nodeLabel,
        provider: 'huggingface' as const,
        elapsedMs,
        translatedPrompt: enhancedPrompt,
        width: dims.w,
        height: dims.h,
      };
      onProgress?.({
        type: 'complete',
        ...finalPayload,
        progress: 100,
      });
      return finalPayload;
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
  }

  throw new Error(lastErr);
}

function normalizeServerImageResponse(
  data: {
    imageDataUrl?: string;
    imageUrl?: string;
    spaceUsed?: string;
    nodeLabel?: string;
    provider?: 'cloudflare' | 'colab-turbo' | 'huggingface';
    elapsedMs?: number;
    translatedPrompt?: string;
    width?: number;
    height?: number;
  },
  fallbackPrompt: string
) {
  const resolved = data.imageDataUrl || data.imageUrl || '';
  if (!resolved) {
    throw new Error('Image endpoint returned an empty image payload.');
  }
  return {
    imageDataUrl: resolved,
    imageUrl: resolved,
    spaceUsed: data.spaceUsed ?? '@cf/black-forest-labs/flux-1-schnell',
    nodeLabel: data.nodeLabel ?? data.spaceUsed ?? 'Cloudflare Workers AI',
    provider: data.provider,
    elapsedMs: data.elapsedMs,
    translatedPrompt: data.translatedPrompt ?? fallbackPrompt,
    width: data.width ?? 1024,
    height: data.height ?? 1024,
  };
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
  imageUrl?: string;
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
      const serverData = await postJson<{
        imageDataUrl?: string;
        imageUrl?: string;
        spaceUsed?: string;
        nodeLabel?: string;
        provider?: 'cloudflare' | 'colab-turbo' | 'huggingface';
        elapsedMs?: number;
        translatedPrompt?: string;
        width?: number;
        height?: number;
      }>('/api/generate-image', requestBody);
      return normalizeServerImageResponse(serverData, payload.prompt);
    } catch (err) {
      if (err instanceof HttpApiError && err.status === 400) {
        throw err;
      }
      return await generateHfSpaceBrowserFallback(payload);
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
        const serverData = await postJson<{
          imageDataUrl?: string;
          imageUrl?: string;
          spaceUsed?: string;
          nodeLabel?: string;
          provider?: 'cloudflare' | 'colab-turbo' | 'huggingface';
          elapsedMs?: number;
          translatedPrompt?: string;
          width?: number;
          height?: number;
        }>('/api/generate-image', requestBody);
        return normalizeServerImageResponse(serverData, payload.prompt);
      } catch (jsonErr) {
        if (jsonErr instanceof HttpApiError && jsonErr.status === 400) {
          throw jsonErr;
        }
        return await generateHfSpaceBrowserFallback(payload, onProgress);
      }
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalResult: {
      imageDataUrl: string;
      imageUrl: string;
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
        if (evt.type === 'error') {
          throw new Error(evt.error || 'Image generation failed on server GPU node.');
        }
        onProgress(evt);
        const resolvedImg = evt.imageDataUrl || (evt as { imageUrl?: string }).imageUrl;
        if (evt.type === 'complete' && resolvedImg) {
          finalResult = {
            imageDataUrl: resolvedImg,
            imageUrl: resolvedImg,
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
      const serverData = await postJson<{
        imageDataUrl?: string;
        imageUrl?: string;
        spaceUsed?: string;
        nodeLabel?: string;
        provider?: 'cloudflare' | 'colab-turbo' | 'huggingface';
        elapsedMs?: number;
        translatedPrompt?: string;
        width?: number;
        height?: number;
      }>('/api/generate-image', requestBody);
      return normalizeServerImageResponse(serverData, payload.prompt);
    } catch (jsonErr) {
      if (jsonErr instanceof HttpApiError && jsonErr.status === 400) {
        throw jsonErr;
      }
      return await generateHfSpaceBrowserFallback(payload, onProgress);
    }
  }

  return await generateHfSpaceBrowserFallback(payload, onProgress);
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
