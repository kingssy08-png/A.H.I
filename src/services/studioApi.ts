import { compileCinemaMotionMp4WithFfmpeg } from '../utils/cinemaMotionCompiler';
import { getActiveColabUrl } from '../utils/turboGpuConfig';
import {
  doesImageMatchAspectRatio,
  getImageDimensions,
  normalizeImageOutputAspectRatio,
  prepareReferenceCanvasForAspectRatio,
  removeUniformBackgroundFallback,
} from '../utils/imageReferencePipeline';
import type {
  AnimationStyle,
  AspectRatio,
  CameraMotion,
  CharacterExpressionView,
  CharacterProfile,
  FoleySfxId,
  GeminiVoiceName,
  ImageEngine,
  ImageQualityTier,
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

function sanitizeUserFacingMessage(raw: string | undefined, fallback: string): string {
  if (!raw || !raw.trim()) return fallback;
  const trimmed = raw.trim();
  if (
    /zerogpu|quota|exceeded|gradio|huggingface|hf_token|cloudflare|worker|\b(401|403|429|500|502|503|504)\b|https?:\/\/|[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+/i.test(
      trimmed
    )
  ) {
    return fallback;
  }
  return trimmed;
}

async function extractErrorMessage(res: Response, fallback: string): Promise<string> {
  const rawText = await res.text().catch(() => '');
  if (rawText) {
    try {
      const parsed = JSON.parse(rawText) as { error?: string };
      if (parsed && typeof parsed.error === 'string' && parsed.error.trim()) {
        return res.status === 400
          ? parsed.error.trim()
          : sanitizeUserFacingMessage(parsed.error, fallback);
      }
    } catch {
      const trimmed = rawText.trim();
      if (trimmed && !trimmed.startsWith('<!') && !trimmed.startsWith('<html')) {
        return res.status === 400
          ? trimmed.slice(0, 220)
          : sanitizeUserFacingMessage(trimmed.slice(0, 220), fallback);
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
    const msg = await extractErrorMessage(res, 'Request is temporarily busy. Please try again.');
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
  modelLabel?: string;
  quality?: ImageQualityTier;
  width?: number;
  height?: number;
  aspectRatio?: AspectRatio;
  cameraMotion?: CameraMotion | string;
  style?: AnimationStyle | string;
  fallbackMotion?: boolean;
  mode?: 'text-to-video' | 'image-to-video' | 'lipsync';
  error?: string;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string' && reader.result.startsWith('data:')) {
        resolve(reader.result);
      } else {
        reject(new Error('Could not convert image blob to data URL.'));
      }
    };
    reader.onerror = () => reject(new Error('Failed reading image blob.'));
    reader.readAsDataURL(blob);
  });
}

async function imageUrlToDataUrl(src: string): Promise<string> {
  if (src.startsWith('data:image/')) return src;
  const res = await fetch(src);
  if (!res.ok) throw new Error('Could not read reference image.');
  const blob = await res.blob();
  return await blobToDataUrl(blob);
}

/**
 * Removes background through the authenticated backend (/api/remove-background),
 * auto-retrying once silently before falling back to local edge-flood matte segmentation.
 */
export async function removeImageBackground(
  imageUrl: string,
  options?: { strictAi?: boolean }
): Promise<{ imageDataUrl: string; spaceUsed: string }> {
  const inputDataUrl = await imageUrlToDataUrl(imageUrl).catch(() => imageUrl);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const serverRes = await postJson<{ imageDataUrl?: string; spaceUsed?: string }>(
        '/api/remove-background',
        { imageDataUrl: inputDataUrl }
      );
      if (serverRes.imageDataUrl) {
        return {
          imageDataUrl: serverRes.imageDataUrl,
          spaceUsed: serverRes.spaceUsed ?? 'ahi-segmentation',
        };
      }
    } catch {
      // Silent retry / fallback
    }
  }

  if (options?.strictAi) {
    throw new Error(
      'Background segmentation is temporarily busy. Please try again in a moment.'
    );
  }

  try {
    const fallbackCutout = await removeUniformBackgroundFallback(inputDataUrl);
    return { imageDataUrl: fallbackCutout, spaceUsed: 'local-matte' };
  } catch {
    return { imageDataUrl: inputDataUrl, spaceUsed: 'original' };
  }
}

async function ensureResultMatchesAspectRatio(
  imageDataUrl: string,
  targetRatio: AspectRatio
): Promise<{ imageDataUrl: string; width: number; height: number }> {
  const currentDims = await getImageDimensions(imageDataUrl);
  if (
    currentDims &&
    doesImageMatchAspectRatio(currentDims.width, currentDims.height, targetRatio, 0.015)
  ) {
    return {
      imageDataUrl,
      width: currentDims.width,
      height: currentDims.height,
    };
  }

  const normalized = await normalizeImageOutputAspectRatio(imageDataUrl, targetRatio);
  return {
    imageDataUrl: normalized.imageDataUrl,
    width: normalized.width,
    height: normalized.height,
  };
}

function normalizeServerImageResponse(
  data: {
    imageDataUrl?: string;
    imageUrl?: string;
    spaceUsed?: string;
    modelLabel?: string;
    quality?: ImageQualityTier;
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
    throw new Error('Image creation is temporarily busy. Please try again in a moment.');
  }
  return {
    imageDataUrl: resolved,
    imageUrl: resolved,
    spaceUsed: data.spaceUsed ?? 'ahi-image-engine',
    modelLabel: data.modelLabel ?? 'A.H.I Render Engine',
    quality: data.quality,
    nodeLabel: 'A.H.I Image Engine',
    provider: data.provider,
    elapsedMs: data.elapsedMs,
    translatedPrompt: data.translatedPrompt ?? fallbackPrompt,
    width: data.width ?? 1024,
    height: data.height ?? 1024,
  };
}

/**
 * Generates an image via authenticated backend (/api/generate-image),
 * which uses Cloudflare Workers AI first (10,000 free neurons/day, no ZeroGPU limits)
 * and falls back silently to authenticated HF Inference API only if needed.
 */
export async function generateHfImage(
  payload: {
    prompt: string;
    style: AnimationStyle;
    aspectRatio?: AspectRatio;
    engine?: ImageEngine;
    quality?: ImageQualityTier;
    spaceId?: string;
    colabUrl?: string;
    imageDataUrl?: string;
    removeBackground?: boolean;
    referenceImages?: Array<
      Pick<VideoReferenceItem, 'imageUrl' | 'role' | 'label' | 'description' | 'backgroundRemoved'>
    >;
  },
  onProgress?: (event: HfVideoProgressEvent) => void
): Promise<{
  imageDataUrl: string;
  imageUrl?: string;
  spaceUsed: string;
  modelLabel: string;
  quality?: ImageQualityTier;
  nodeLabel: string;
  provider?: 'cloudflare' | 'colab-turbo' | 'huggingface';
  elapsedMs?: number;
  translatedPrompt: string;
  width: number;
  height: number;
}> {
  if (payload.prompt.trim().length < 4) {
    throw new HttpApiError(400, 'Please provide an image prompt of at least 4 characters.');
  }

  const targetRatio: AspectRatio = payload.aspectRatio ?? '16:9';
  let preparedRefs = payload.referenceImages ? [...payload.referenceImages] : [];
  if (preparedRefs.length === 0 && payload.imageDataUrl) {
    preparedRefs = [
      {
        imageUrl: payload.imageDataUrl,
        role: 'Character',
        label: 'Reference Character',
      },
    ];
  }

  let preparedCanvasDataUrl: string | undefined;
  if (preparedRefs.length > 0) {
    onProgress?.({
      type: 'status',
      progress: 14,
      message: 'Creating your image...',
    });

    const normalizedRefs = await Promise.all(
      preparedRefs.map(async (ref) => {
        const dataUrl = await imageUrlToDataUrl(ref.imageUrl).catch(() => ref.imageUrl);
        if (
          payload.removeBackground &&
          !ref.backgroundRemoved &&
          (ref.role === 'Character' || ref.role === 'Outfit / Prop')
        ) {
          const stripped = await removeImageBackground(dataUrl).catch(() => null);
          return {
            ...ref,
            imageUrl: stripped?.imageDataUrl || dataUrl,
            backgroundRemoved: Boolean(stripped?.imageDataUrl),
          };
        }
        return { ...ref, imageUrl: dataUrl };
      })
    );

    preparedRefs = normalizedRefs;
    const canvasRes = await prepareReferenceCanvasForAspectRatio(normalizedRefs, targetRatio, {
      removeBackground: Boolean(payload.removeBackground),
    });
    preparedCanvasDataUrl = canvasRes.canvasDataUrl;
  }

  const requestBody = {
    ...payload,
    aspectRatio: targetRatio,
    quality: payload.quality ?? 'high',
    imageDataUrl: preparedRefs[0]?.imageUrl ?? payload.imageDataUrl,
    referenceImages: preparedRefs.length > 0 ? preparedRefs : undefined,
    preparedCanvasDataUrl,
    colabUrl: payload.colabUrl ?? getActiveColabUrl(),
  };

  const finalizeAspectRatio = async (result: {
    imageDataUrl: string;
    imageUrl?: string;
    spaceUsed: string;
    modelLabel: string;
    quality?: ImageQualityTier;
    nodeLabel: string;
    provider?: 'cloudflare' | 'colab-turbo' | 'huggingface';
    elapsedMs?: number;
    translatedPrompt: string;
    width: number;
    height: number;
  }) => {
    const fixed = await ensureResultMatchesAspectRatio(result.imageDataUrl, targetRatio);
    return {
      ...result,
      imageDataUrl: fixed.imageDataUrl,
      imageUrl: fixed.imageDataUrl,
      width: result.width || fixed.width,
      height: result.height || fixed.height,
    };
  };

  if (onProgress) {
    try {
      const res = await fetch('/api/generate-image?stream=1', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({ ...requestBody, stream: true }),
      });

      if (res.ok && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let finalResult: {
          imageDataUrl: string;
          imageUrl: string;
          spaceUsed: string;
          modelLabel: string;
          quality?: ImageQualityTier;
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
              throw new Error(
                sanitizeUserFacingMessage(
                  evt.error,
                  'Image creation is temporarily busy. Please try again in a moment.'
                )
              );
            }
            onProgress({
              ...evt,
              message: evt.type === 'status' ? 'Creating your image...' : evt.message,
              nodeLabel: 'A.H.I Image Engine',
            });
            const resolvedImg = evt.imageDataUrl || (evt as { imageUrl?: string }).imageUrl;
            if (evt.type === 'complete' && resolvedImg) {
              finalResult = {
                imageDataUrl: resolvedImg,
                imageUrl: resolvedImg,
                spaceUsed: evt.spaceUsed ?? 'ahi-image-engine',
                modelLabel: evt.modelLabel ?? 'A.H.I Render Engine',
                quality: evt.quality ?? (payload.quality ?? 'high'),
                nodeLabel: 'A.H.I Image Engine',
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
          return await finalizeAspectRatio(finalResult);
        }
      } else if (res.status === 400) {
        const msg = await extractErrorMessage(res, 'Please check your prompt and try again.');
        throw new HttpApiError(400, msg);
      }
    } catch (streamErr) {
      if (streamErr instanceof HttpApiError && streamErr.status === 400) {
        throw streamErr;
      }
      // Auto-retry silently via JSON endpoint below
    }
  }

  // Direct JSON call + 1 silent auto-retry
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const serverData = await postJson<{
        imageDataUrl?: string;
        imageUrl?: string;
        spaceUsed?: string;
        modelLabel?: string;
        quality?: ImageQualityTier;
        nodeLabel?: string;
        provider?: 'cloudflare' | 'colab-turbo' | 'huggingface';
        elapsedMs?: number;
        translatedPrompt?: string;
        width?: number;
        height?: number;
      }>('/api/generate-image', requestBody);
      const normalized = await finalizeAspectRatio(
        normalizeServerImageResponse(serverData, payload.prompt)
      );
      onProgress?.({ type: 'complete', ...normalized, progress: 100 });
      return normalized;
    } catch (err) {
      if (err instanceof HttpApiError && err.status === 400) {
        throw err;
      }
      if (attempt === 1) {
        throw new Error('Image creation is temporarily busy. Please try again in a moment.');
      }
    }
  }

  throw new Error('Image creation is temporarily busy. Please try again in a moment.');
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

interface VideoStreamCompletion {
  videoUrl: string;
  imageDataUrl?: string;
  compositedImageDataUrl?: string;
  audioDataUrl?: string;
  spaceUsed: string;
  nodeLabel: string;
  provider?: 'cloudflare' | 'colab-turbo' | 'huggingface';
  elapsedMs?: number;
  translatedPrompt?: string;
  mode: 'text-to-video' | 'image-to-video' | 'lipsync';
}

async function consumeSseVideoStream(
  url: string,
  payload: Record<string, unknown>,
  onProgress: (event: HfVideoProgressEvent) => void
): Promise<VideoStreamCompletion> {
  const started = Date.now();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, clientMotionFallback: true }),
  });

  if (!res.ok || !res.body) {
    const errMsg = await extractErrorMessage(
      res,
      'Video creation is temporarily busy. Please try again.'
    );
    throw new HttpApiError(res.status, errMsg);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalResult: VideoStreamCompletion | null = null;

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

      if (evt.type === 'status') {
        onProgress({
          ...evt,
          message: 'Creating your video...',
          nodeLabel: 'Cinema Video Engine',
        });
        continue;
      }

      if (evt.type === 'error') {
        throw new Error(
          sanitizeUserFacingMessage(
            evt.error,
            'Video creation is temporarily busy. Please try again in a moment.'
          )
        );
      }

      if (evt.type === 'complete') {
        if (evt.fallbackMotion && !evt.videoUrl && evt.imageDataUrl) {
          const fallbackRatio = (evt.aspectRatio ||
            (payload.aspectRatio as AspectRatio | undefined) ||
            '16:9') as AspectRatio;
          const fallbackMotion =
            (evt.cameraMotion as CameraMotion | undefined) ||
            (payload.cameraMotion as CameraMotion | undefined) ||
            'Slow Dolly In';
          const fallbackStyle =
            (evt.style as AnimationStyle | undefined) ||
            (payload.style as AnimationStyle | undefined) ||
            'Cinematic Film';

          const compiled = await compileCinemaMotionMp4WithFfmpeg({
            imageDataUrl: evt.imageDataUrl,
            aspectRatio: fallbackRatio,
            cameraMotion: fallbackMotion,
            style: fallbackStyle,
            audioDataUrl: evt.audioDataUrl,
            durationSeconds: 5,
            onProgress: (pct) =>
              onProgress({
                type: 'status',
                progress: pct,
                message: 'Creating your video...',
              }),
          });

          const completedEvt: HfVideoProgressEvent = {
            type: 'complete',
            videoUrl: compiled.videoUrl,
            imageDataUrl: evt.imageDataUrl,
            compositedImageDataUrl: evt.compositedImageDataUrl ?? evt.imageDataUrl,
            audioDataUrl: evt.audioDataUrl,
            spaceUsed: 'cinema-motion-wasm',
            nodeLabel: 'Cinema Motion Engine',
            provider: 'cloudflare',
            elapsedMs: Date.now() - started,
            translatedPrompt: evt.translatedPrompt,
            width: compiled.width,
            height: compiled.height,
            aspectRatio: fallbackRatio,
            progress: 100,
            mode: evt.mode ?? 'text-to-video',
          };
          onProgress(completedEvt);

          finalResult = {
            videoUrl: compiled.videoUrl,
            imageDataUrl: evt.imageDataUrl,
            compositedImageDataUrl: evt.compositedImageDataUrl ?? evt.imageDataUrl,
            audioDataUrl: evt.audioDataUrl,
            spaceUsed: 'cinema-motion-wasm',
            nodeLabel: 'Cinema Motion Engine',
            provider: 'cloudflare',
            elapsedMs: Date.now() - started,
            translatedPrompt: evt.translatedPrompt,
            mode: evt.mode ?? 'text-to-video',
          };
          continue;
        }

        if (evt.videoUrl) {
          onProgress({
            ...evt,
            nodeLabel: 'Cinema Video Engine',
          });
          finalResult = {
            videoUrl: evt.videoUrl,
            imageDataUrl: evt.imageDataUrl,
            compositedImageDataUrl: evt.compositedImageDataUrl,
            audioDataUrl: evt.audioDataUrl,
            spaceUsed: evt.spaceUsed ?? 'cinema-video-engine',
            nodeLabel: 'Cinema Video Engine',
            provider: evt.provider,
            elapsedMs: evt.elapsedMs,
            translatedPrompt: evt.translatedPrompt,
            mode: evt.mode ?? 'text-to-video',
          };
        }
      }
    }
  }

  if (!finalResult) {
    throw new Error('Video creation is temporarily busy. Please try again in a moment.');
  }
  return finalResult;
}

/**
 * Tier 3 Client Safety Net: compiles a smooth 5-second Cinema Motion MP4
 * using a Cloudflare Workers AI scene frame if the streaming endpoint fails unexpectedly.
 */
async function compileEmergencyClientCinemaMotion(
  options: {
    prompt: string;
    style: AnimationStyle;
    aspectRatio: AspectRatio;
    cameraMotion?: CameraMotion;
    imageDataUrl?: string;
    referenceImages?: Array<Pick<VideoReferenceItem, 'imageUrl' | 'role' | 'label' | 'description'>>;
    audioDataUrl?: string;
    mode: 'text-to-video' | 'image-to-video' | 'lipsync';
  },
  onProgress: (event: HfVideoProgressEvent) => void
): Promise<VideoStreamCompletion> {
  const started = Date.now();
  onProgress({
    type: 'status',
    progress: 40,
    message: 'Creating your video...',
  });

  let sceneFrameUrl = options.imageDataUrl;
  if (!sceneFrameUrl || (options.referenceImages && options.referenceImages.length > 0)) {
    const cfFrame = await generateHfImage(
      {
        prompt: options.prompt,
        style: options.style,
        aspectRatio: options.aspectRatio,
        engine: 'flux-schnell',
        imageDataUrl: options.imageDataUrl,
        referenceImages: options.referenceImages,
        removeBackground: Boolean(options.referenceImages && options.referenceImages.length > 0),
      },
      (imgEvt) => {
        if (typeof imgEvt.progress === 'number') {
          onProgress({
            type: 'status',
            progress: Math.min(60, Math.max(25, Math.round(imgEvt.progress * 0.6))),
            message: 'Creating your video...',
          });
        }
      }
    );
    sceneFrameUrl = cfFrame.imageDataUrl;
  }

  const compiled = await compileCinemaMotionMp4WithFfmpeg({
    imageDataUrl: sceneFrameUrl,
    aspectRatio: options.aspectRatio,
    cameraMotion: options.cameraMotion ?? 'Auto',
    style: options.style,
    audioDataUrl: options.audioDataUrl,
    durationSeconds: 5,
    onProgress: (pct) =>
      onProgress({
        type: 'status',
        progress: pct,
        message: 'Creating your video...',
      }),
  });

  const completion: VideoStreamCompletion = {
    videoUrl: compiled.videoUrl,
    imageDataUrl: sceneFrameUrl,
    compositedImageDataUrl: sceneFrameUrl,
    audioDataUrl: options.audioDataUrl,
    spaceUsed: 'cinema-motion-wasm',
    nodeLabel: 'Cinema Motion Engine',
    provider: 'cloudflare',
    elapsedMs: Date.now() - started,
    mode: options.mode,
  };

  onProgress({
    type: 'complete',
    ...completion,
    width: compiled.width,
    height: compiled.height,
    aspectRatio: options.aspectRatio,
    progress: 100,
  });

  return completion;
}

export async function generateHfVideoClip(
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
  if (payload.prompt.trim().length < 4) {
    throw new HttpApiError(400, 'Please provide a scene visual prompt (at least 4 characters).');
  }

  const requestPayload = {
    ...payload,
    action: 'video',
    colabUrl: payload.colabUrl ?? getActiveColabUrl(),
    clientMotionFallback: true,
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await consumeSseVideoStream('/api/generate-video', requestPayload, onProgress);
    } catch (err) {
      if (err instanceof HttpApiError && err.status === 400) {
        throw err;
      }
      if (attempt === 0) {
        onProgress({ type: 'status', progress: 20, message: 'Creating your video...' });
        continue;
      }
      // Tier 3 zero-error Cinema Motion fallback in browser
      return await compileEmergencyClientCinemaMotion(
        {
          prompt: payload.prompt,
          style: payload.style,
          aspectRatio: payload.aspectRatio ?? '16:9',
          cameraMotion: payload.cameraMotion,
          imageDataUrl: payload.imageDataUrl,
          referenceImages: payload.referenceImages,
          mode: payload.mode,
        },
        onProgress
      );
    }
  }

  return await compileEmergencyClientCinemaMotion(
    {
      prompt: payload.prompt,
      style: payload.style,
      aspectRatio: payload.aspectRatio ?? '16:9',
      cameraMotion: payload.cameraMotion,
      imageDataUrl: payload.imageDataUrl,
      referenceImages: payload.referenceImages,
      mode: payload.mode,
    },
    onProgress
  );
}

export async function generateHfLipSyncClip(
  payload: {
    imageDataUrl: string;
    audioBase64?: string;
    spaceId?: string;
    colabUrl?: string;
  },
  onProgress: (event: HfVideoProgressEvent) => void
) {
  const requestPayload = {
    ...payload,
    action: 'lipsync',
    colabUrl: payload.colabUrl ?? getActiveColabUrl(),
    clientMotionFallback: true,
  };

  try {
    return await consumeSseVideoStream('/api/generate-video', requestPayload, onProgress);
  } catch (err) {
    if (err instanceof HttpApiError && err.status === 400) {
      throw err;
    }
    const audioDataUrl =
      payload.audioBase64 && payload.audioBase64.startsWith('data:')
        ? payload.audioBase64
        : payload.audioBase64
        ? `data:audio/wav;base64,${payload.audioBase64}`
        : undefined;
    return await compileEmergencyClientCinemaMotion(
      {
        prompt: 'Expressive character portrait',
        style: 'Cinematic Film',
        aspectRatio: '16:9',
        cameraMotion: 'Zoom In',
        imageDataUrl: payload.imageDataUrl,
        audioDataUrl,
        mode: 'lipsync',
      },
      onProgress
    );
  }
}

export async function generateTalkingSceneClip(
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
  const requestPayload = {
    ...payload,
    action: 'talking-scene',
    colabUrl: payload.colabUrl ?? getActiveColabUrl(),
    clientMotionFallback: true,
  };

  try {
    return await consumeSseVideoStream('/api/generate-video', requestPayload, onProgress);
  } catch (err) {
    if (err instanceof HttpApiError && err.status === 400) {
      throw err;
    }
    const audioDataUrl =
      payload.customAudioBase64 && payload.customAudioBase64.startsWith('data:')
        ? payload.customAudioBase64
        : payload.customAudioBase64
        ? `data:audio/wav;base64,${payload.customAudioBase64}`
        : undefined;
    return await compileEmergencyClientCinemaMotion(
      {
        prompt: payload.actionPrompt || payload.backgroundPrompt || 'Expressive animated character speaking',
        style: payload.style,
        aspectRatio: payload.aspectRatio ?? '16:9',
        cameraMotion: 'Zoom In',
        imageDataUrl: payload.characterImageUrl,
        audioDataUrl,
        mode: 'lipsync',
      },
      onProgress
    );
  }
}
