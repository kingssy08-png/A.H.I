import { Client, handle_file } from '@gradio/client';
import { getActiveColabUrl } from '../utils/turboGpuConfig';
import {
  doesImageMatchAspectRatio,
  getImageDimensions,
  getTargetDimensionsForRatio,
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

const PREMIUM_3D_ANIMATION_BENCHMARK =
  'theatrical feature-film-quality 3D character animation, sculpted stylized character proportions with expressive faces, rich subsurface skin scattering with warm amber bounce light, detailed eyes with crisp eyelashes eyebrows and corneal catchlights, individually sculpted hair strands and braids, woven fabric and physically based metallic/glass surface materials, cinematic global illumination, soft ambient occlusion and rim shadows, rich layered depth-of-field environment, theatrical color grading — strictly avoid live-action photorealism, flat 2D cartoon, or cheap plastic AI look';

const CLIENT_STYLE_CUES: Record<string, string> = {
  'Warm Storybook 3D': `${WARM_STORYBOOK_3D_FRAMING}, ${WARM_STORYBOOK_3D_MODIFIERS}`,
  '3D Pixar-Style Cartoon': PREMIUM_3D_ANIMATION_BENCHMARK,
  '3D Cartoon': PREMIUM_3D_ANIMATION_BENCHMARK,
  Anime:
    'high-budget theatrical anime feature animation, expressive eyes, crisp cel-shaded linework, luminous atmospheric sky, layered depth, cinematic color grading',
  'Cinematic Film':
    '35mm anamorphic cinema film look, moody volumetric global illumination, physically based surface detail, rich contrast, shallow depth-of-field bokeh',
  '2D Illustration':
    'hand-crafted 2D feature animation concept illustration, rich gouache brushwork, tactile layered storybook depth',
  'Music Video':
    'high-energy stylized music video cinematography, kinetic gimbal choreography, vibrant neon & rim lighting, anamorphic lens flare',
  'Product Ad':
    'luxury commercial product studio macro photography, sleek brushed metal & glass PBR specular highlights, obsidian pedestal reflections, shallow depth of field',
  Realistic:
    'photorealistic live-action cinema camera aesthetic, physically accurate reflections, natural lens clarity, cinema color grading',
  Educational:
    'clean 2.5D educational motion graphics explainer aesthetic, crisp geometric clarity, PBR surface polish, high visual contrast',
};

const CLIENT_DIMS_BY_RATIO: Record<string, { w: number; h: number }> = {
  '16:9': { w: 1280, h: 720 },
  '9:16': { w: 720, h: 1280 },
  '1:1': { w: 1024, h: 1024 },
  '21:9': { w: 1344, h: 576 },
};

const CLIENT_VIDEO_DIMS_BY_RATIO: Record<string, { w: number; h: number }> = {
  '16:9': { w: 1024, h: 576 },
  '9:16': { w: 576, h: 1024 },
  '1:1': { w: 768, h: 768 },
  '21:9': { w: 896, h: 384 },
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

const HF_BROWSER_BG_REMOVAL_SPACES = [
  'not-lain/background-removal',
  'briaai/BRIA-RMBG-1.4',
  'ZhengPeng7/BiRefNet_demo',
];

const HF_BROWSER_REFERENCE_EDIT_SPACES = [
  'black-forest-labs/FLUX.1-Kontext-dev',
  'Qwen/Qwen-Image-Edit',
  'black-forest-labs/FLUX.2-dev',
];

const HF_BROWSER_FLUX_SPACES = [
  'black-forest-labs/FLUX.1-dev',
  'Qwen/Qwen-Image-2512',
  'black-forest-labs/FLUX.1-schnell',
  'stabilityai/stable-diffusion-3.5-large-turbo',
  'prodia/fast-stable-diffusion',
];

const HF_BROWSER_SDXL_SPACES = [
  'black-forest-labs/FLUX.1-dev',
  'stabilityai/stable-diffusion-3.5-large-turbo',
  'black-forest-labs/FLUX.1-schnell',
  'prodia/fast-stable-diffusion',
];

async function imageUrlToDataUrl(src: string): Promise<string> {
  if (src.startsWith('data:image/')) return src;
  const res = await fetch(src);
  if (!res.ok) throw new Error('Could not read reference image.');
  const blob = await res.blob();
  return await blobToDataUrl(blob);
}

/**
 * Removes background from an uploaded reference image using /api/remove-background,
 * falling back directly in the browser to live Hugging Face RMBG/BiRefNet Spaces
 * and finally a clean edge-flood fallback if all remote nodes are unreachable.
 */
export async function removeImageBackground(
  imageUrl: string,
  options?: { strictAi?: boolean }
): Promise<{ imageDataUrl: string; spaceUsed: string }> {
  const inputDataUrl = await imageUrlToDataUrl(imageUrl).catch(() => imageUrl);

  try {
    const serverRes = await postJson<{ imageDataUrl?: string; spaceUsed?: string }>(
      '/api/remove-background',
      { imageDataUrl: inputDataUrl }
    );
    if (serverRes.imageDataUrl) {
      return {
        imageDataUrl: serverRes.imageDataUrl,
        spaceUsed: serverRes.spaceUsed ?? 'briaai/RMBG',
      };
    }
  } catch {
    // Fall through to browser Gradio ZeroGPU background removal
  }

  let blob: Blob | null = null;
  try {
    blob = await dataUrlOrRemoteToBlob(inputDataUrl);
  } catch {
    blob = null;
  }

  if (blob) {
    for (const spaceId of HF_BROWSER_BG_REMOVAL_SPACES) {
      try {
        const client = await withBrowserTimeout(
          Client.connect(spaceId),
          14000,
          `${spaceId} connection timed out.`
        );
        let endpoint = '/image';
        let args: Record<string, unknown> = { image: handle_file(blob) };
        if (spaceId === 'not-lain/background-removal') {
          endpoint = '/png';
          args = { f: handle_file(blob) };
        } else if (spaceId === 'briaai/BRIA-RMBG-1.4') {
          endpoint = '/run';
          args = { image: handle_file(blob) };
        } else if (spaceId === 'ZhengPeng7/BiRefNet_demo') {
          endpoint = '/image';
          args = { images: handle_file(blob), resolution: '', weights_file: 'General' };
        }
        const pred = await withBrowserTimeout(
          client.predict(endpoint, args),
          32000,
          `${spaceId} background removal timed out.`
        );
        const mediaUrl = extractBrowserGradioImageUrl(pred.data);
        if (mediaUrl) {
          const downloaded = await imageUrlToDataUrl(mediaUrl).catch(() => mediaUrl);
          return { imageDataUrl: downloaded, spaceUsed: spaceId };
        }
      } catch {
        // try next BG removal Space
      }
    }
  }

  if (options?.strictAi) {
    throw new Error(
      'Background segmentation models are temporarily busy. Please try again in a moment.'
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
  targetRatio: AspectRatio,
  scenePrompt: string
): Promise<{ imageDataUrl: string; width: number; height: number }> {
  const targetDims = getTargetDimensionsForRatio(targetRatio);
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

  // If the image is already close in the same orientation, snap cleanly without AI re-paint
  if (currentDims) {
    const actualRatio = currentDims.width / Math.max(1, currentDims.height);
    const expectedRatio = targetDims.w / targetDims.h;
    if (Math.abs(actualRatio - expectedRatio) / expectedRatio <= 0.12) {
      const snapped = await normalizeImageOutputAspectRatio(imageDataUrl, targetRatio);
      return {
        imageDataUrl: snapped.imageDataUrl,
        width: snapped.width,
        height: snapped.height,
      };
    }
  }

  // Otherwise use AI scene outpainting so off-ratio outputs expand cleanly into full-bleed scenery
  try {
    const blob = await dataUrlOrRemoteToBlob(imageDataUrl);
    const client = await withBrowserTimeout(
      Client.connect('fffiloni/diffusers-image-outpaint'),
      14000,
      'Outpaint Space timed out.'
    );
    const pred = await withBrowserTimeout(
      client.predict('/infer', {
        image: handle_file(blob),
        width: targetDims.w,
        height: targetDims.h,
        overlap_percentage: 10,
        num_inference_steps: 10,
        resize_option: 'Full',
        custom_resize_percentage: 50,
        prompt_input: scenePrompt.slice(0, 380),
        alignment: 'Middle',
        overlap_left: true,
        overlap_right: true,
        overlap_top: true,
        overlap_bottom: true,
      }),
      38000,
      'Outpaint render timed out.'
    );
    const outUrl = extractBrowserGradioImageUrl(pred.data);
    if (outUrl) {
      const converted = await imageUrlToDataUrl(outUrl).catch(() => outUrl);
      const outDims = await getImageDimensions(converted);
      if (outDims && doesImageMatchAspectRatio(outDims.width, outDims.height, targetRatio, 0.08)) {
        const snapped = await normalizeImageOutputAspectRatio(converted, targetRatio);
        return {
          imageDataUrl: snapped.imageDataUrl,
          width: snapped.width,
          height: snapped.height,
        };
      }
    }
  } catch {
    // Outpaint unavailable
  }

  const normalized = await normalizeImageOutputAspectRatio(imageDataUrl, targetRatio);
  return {
    imageDataUrl: normalized.imageDataUrl,
    width: normalized.width,
    height: normalized.height,
  };
}

function buildReferenceScenePrompts(
  prompt: string,
  style: AnimationStyle,
  aspectRatio: AspectRatio,
  refs?: Array<Pick<VideoReferenceItem, 'imageUrl' | 'role' | 'label' | 'description'>>,
  removeBackground?: boolean
): { editPrompt: string; generationPrompt: string } {
  const isWarmStorybook = style === 'Warm Storybook 3D';
  const styleCue = CLIENT_STYLE_CUES[style] ?? `${style} aesthetic`;
  const refSummary = (refs ?? [])
    .map(
      (r, idx) =>
        `Ref ${idx + 1} [${r.role} - ${r.label}]${r.description ? `: ${r.description}` : ''}`
    )
    .join('; ');

  const bgDirective = removeBackground
    ? 'Completely replace the studio or original background with the prompted environment filling the entire frame edge-to-edge (no side bars or studio backdrop).'
    : 'Generate and expand the prompted environment seamlessly edge-to-edge across the entire canvas (no side bars or empty margins).';

  const editPrompt = isWarmStorybook
    ? `Keep the exact character appearance (face, hairstyle, skin tone, body proportions, clothing, colors, accessories) from the input image without cropping or stretching, and place them in this ${aspectRatio} scene: ${prompt.trim()}. ${bgDirective} ${WARM_STORYBOOK_3D_FRAMING}, ${WARM_STORYBOOK_3D_MODIFIERS}`
    : `Keep the exact character appearance (face, hairstyle, skin tone, body proportions, clothing, colors, accessories) from the input image without cropping or stretching, and render this ${aspectRatio} scene: ${prompt.trim()}. ${bgDirective} Style: ${styleCue}.`;

  const generationPrompt = isWarmStorybook
    ? `${prompt.trim().slice(0, 420)}${refSummary ? `. Character identity: ${refSummary}` : ''}. Full uncropped character(s) properly proportioned inside ${aspectRatio} frame. ${bgDirective} ${WARM_STORYBOOK_3D_FRAMING}, ${WARM_STORYBOOK_3D_MODIFIERS}, no text, no watermark`
    : `${prompt.trim().slice(0, 520)}${refSummary ? `. Character identity: ${refSummary}` : ''}. Full uncropped character(s) properly proportioned inside ${aspectRatio} composition. ${bgDirective} ${styleCue}, clean framing, no text, no watermark`;

  return { editPrompt, generationPrompt };
}

async function generateHfSpaceBrowserFallback(
  payload: {
    prompt: string;
    style: AnimationStyle;
    aspectRatio?: AspectRatio;
    engine?: ImageEngine;
    spaceId?: string;
    imageDataUrl?: string;
    preparedCanvasDataUrl?: string;
    removeBackground?: boolean;
    referenceImages?: Array<Pick<VideoReferenceItem, 'imageUrl' | 'role' | 'label' | 'description'>>;
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
  const targetRatio = payload.aspectRatio ?? '16:9';
  const dims = CLIENT_DIMS_BY_RATIO[targetRatio] ?? { w: 1280, h: 720 };
  const hasRefs = Boolean(
    payload.preparedCanvasDataUrl ||
      payload.imageDataUrl ||
      (payload.referenceImages && payload.referenceImages.length > 0)
  );

  const { editPrompt, generationPrompt } = buildReferenceScenePrompts(
    payload.prompt,
    payload.style,
    targetRatio,
    payload.referenceImages,
    payload.removeBackground
  );

  const refInputDataUrl =
    payload.preparedCanvasDataUrl ||
    payload.imageDataUrl ||
    payload.referenceImages?.[0]?.imageUrl;

  let lastErr = 'Public Hugging Face ZeroGPU Spaces are temporarily busy.';

  // 1. Try pixel-aware reference-conditioned Spaces first when reference image(s) are attached
  if (hasRefs && refInputDataUrl) {
    let refBlob: Blob | null = null;
    try {
      refBlob = await dataUrlOrRemoteToBlob(refInputDataUrl);
    } catch {
      refBlob = null;
    }
    const rawRefBlobs: Blob[] = [];
    if (payload.referenceImages?.length) {
      for (const r of payload.referenceImages.slice(0, 4)) {
        try {
          rawRefBlobs.push(await dataUrlOrRemoteToBlob(r.imageUrl));
        } catch {
          // ignore
        }
      }
    } else if (refBlob) {
      rawRefBlobs.push(refBlob);
    }

    if (refBlob) {
      for (let i = 0; i < HF_BROWSER_REFERENCE_EDIT_SPACES.length; i++) {
        const spaceId = HF_BROWSER_REFERENCE_EDIT_SPACES[i];
        const nodeLabel = `Reference Scene Composer (${spaceId})`;
        onProgress?.({
          type: 'status',
          space: spaceId,
          nodeLabel,
          provider: 'huggingface',
          attempt: i + 1,
          totalAttempts: HF_BROWSER_REFERENCE_EDIT_SPACES.length + 2,
          progress: 64 + i * 8,
          translatedPrompt: editPrompt,
          message: `Composing reference character into ${targetRatio} scene...`,
        });

        try {
          const client = await withBrowserTimeout(
            Client.connect(spaceId),
            14000,
            `${spaceId} WebSocket connection timed out.`
          );
          let args: Record<string, unknown>;
          if (spaceId === 'black-forest-labs/FLUX.2-dev') {
            const f2Dims =
              targetRatio === '9:16'
                ? { w: 576, h: 1024 }
                : targetRatio === '1:1'
                ? { w: 1024, h: 1024 }
                : targetRatio === '21:9'
                ? { w: 1008, h: 432 }
                : { w: 1024, h: 576 };
            args = {
              prompt: editPrompt,
              input_images: rawRefBlobs.map((b) => ({ image: handle_file(b) })),
              seed: 0,
              randomize_seed: true,
              width: f2Dims.w,
              height: f2Dims.h,
              num_inference_steps: 28,
              guidance_scale: 4,
              prompt_upsampling: true,
            };
          } else if (spaceId === 'Qwen/Qwen-Image-Edit') {
            args = {
              image: handle_file(refBlob),
              prompt: editPrompt,
              seed: 0,
              randomize_seed: true,
              true_guidance_scale: 4,
              num_inference_steps: 28,
              rewrite_prompt: true,
            };
          } else {
            args = {
              input_image: handle_file(refBlob),
              prompt: editPrompt,
              seed: 0,
              randomize_seed: true,
              guidance_scale: 3.5,
              steps: 24,
            };
          }

          const predResult = await withBrowserTimeout(
            client.predict('/infer', args),
            36000,
            `${spaceId} GPU queue timeout reached.`
          );
          const mediaUrl = extractBrowserGradioImageUrl(predResult.data);
          if (!mediaUrl) continue;

          const rawDataUrl = await imageUrlToDataUrl(mediaUrl).catch(() => mediaUrl);
          const normalized = await ensureResultMatchesAspectRatio(
            rawDataUrl,
            targetRatio,
            editPrompt
          );
          if (!doesImageMatchAspectRatio(normalized.width, normalized.height, targetRatio, 0.08)) {
            continue;
          }
          const finalPayload = {
            imageDataUrl: normalized.imageDataUrl,
            imageUrl: normalized.imageDataUrl,
            spaceUsed: spaceId,
            nodeLabel,
            provider: 'huggingface' as const,
            elapsedMs: Date.now() - started,
            translatedPrompt: editPrompt,
            width: normalized.width,
            height: normalized.height,
          };
          onProgress?.({ type: 'complete', ...finalPayload, progress: 100 });
          return finalPayload;
        } catch (err) {
          lastErr = err instanceof Error ? err.message : String(err);
        }
      }
    }
  }

  // 2. Fallback to Flux.1-dev / Qwen-Image / Flux.1-schnell / SD 3.5 Turbo Spaces with exact target aspect-ratio dims
  const useSdxl = payload.engine === 'sdxl';
  const baseSpaces = useSdxl ? HF_BROWSER_SDXL_SPACES : HF_BROWSER_FLUX_SPACES;
  const customSpace =
    typeof payload.spaceId === 'string' && /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(payload.spaceId.trim())
      ? payload.spaceId.trim()
      : null;
  const candidates = customSpace
    ? [customSpace, ...baseSpaces.filter((s) => s !== customSpace)]
    : baseSpaces;

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
      progress: Math.min(92, 74 + i * 8),
      translatedPrompt: generationPrompt,
      message: `Connecting directly in browser via WebSockets to ${spaceId}...`,
    });

    try {
      const client = await withBrowserTimeout(
        Client.connect(spaceId),
        14000,
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
      const requiresImageInput = paramsMeta.some(
        (p) =>
          !p.parameter_has_default &&
          ((p.component && /image/i.test(String(p.component))) ||
            (p.parameter_name && /input_image|first_frame|image_path|image/i.test(p.parameter_name)))
      );
      if (requiresImageInput) {
        lastErr = `${spaceId} requires an input image.`;
        continue;
      }

      const isSd35OrProdia =
        spaceId.includes('stable-diffusion-3.5') || spaceId.includes('prodia');
      const isFlux1Dev = spaceId === 'black-forest-labs/FLUX.1-dev';
      const isQwenImage = spaceId.startsWith('Qwen/Qwen-Image');
      const spaceDims = isFlux1Dev
        ? targetRatio === '9:16'
          ? { w: 864, h: 1536 }
          : targetRatio === '1:1'
          ? { w: 1024, h: 1024 }
          : targetRatio === '21:9'
          ? { w: 1344, h: 576 }
          : { w: 1536, h: 864 }
        : dims;
      const gradioPayload: Record<string, unknown> = {};

      for (const p of paramsMeta) {
        const name = p.parameter_name;
        if (!name || name === 'null') continue;
        const lower = name.toLowerCase();
        if (
          (lower === 'prompt' || lower === 'positive_prompt' || lower === 'text') &&
          !lower.includes('negative')
        ) {
          gradioPayload[name] = generationPrompt;
        } else if (lower.includes('negative')) {
          gradioPayload[name] = isWarmStorybook
            ? WARM_STORYBOOK_3D_NEGATIVE_PROMPT
            : 'photorealistic photography, flat 2d cartoon, plastic glossy skin, stretched anatomy, blurry face, text, watermark, signature';
        } else if (lower === 'randomize_seed') {
          gradioPayload[name] = true;
        } else if (lower === 'aspect_ratio') {
          gradioPayload[name] = targetRatio === '21:9' ? '16:9' : targetRatio;
        } else if (lower === 'width') {
          gradioPayload[name] = spaceDims.w;
        } else if (lower === 'height') {
          gradioPayload[name] = spaceDims.h;
        } else if (lower === 'num_inference_steps' || lower === 'steps') {
          gradioPayload[name] = isQwenImage ? 36 : isFlux1Dev ? 28 : isSd35OrProdia ? 8 : 4;
        } else if (lower === 'guidance_scale' || lower === 'cfg' || lower === 'cfg_scale') {
          gradioPayload[name] = isQwenImage ? 4 : isFlux1Dev ? 3.5 : isSd35OrProdia ? 1.5 : 0;
        } else if (p.parameter_has_default) {
          gradioPayload[name] = p.parameter_default;
        } else {
          gradioPayload[name] = null;
        }
      }

      const predResult = await withBrowserTimeout(
        client.predict(
          endpoint,
          Object.keys(gradioPayload).length > 0 ? gradioPayload : [generationPrompt]
        ),
        38000,
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

      const normalized = await ensureResultMatchesAspectRatio(
        imageDataUrl,
        targetRatio,
        generationPrompt
      );
      const elapsedMs = Date.now() - started;
      const finalPayload = {
        imageDataUrl: normalized.imageDataUrl,
        imageUrl: normalized.imageDataUrl,
        spaceUsed: spaceId,
        nodeLabel,
        provider: 'huggingface' as const,
        elapsedMs,
        translatedPrompt: generationPrompt,
        width: normalized.width,
        height: normalized.height,
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
      message: payload.removeBackground
        ? 'Isolating reference character & framing aspect ratio...'
        : 'Framing reference character for target aspect ratio...',
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
    imageDataUrl: preparedRefs[0]?.imageUrl ?? payload.imageDataUrl,
    referenceImages: preparedRefs.length > 0 ? preparedRefs : undefined,
    preparedCanvasDataUrl,
    colabUrl: payload.colabUrl ?? getActiveColabUrl(),
  };

  const finalizeAspectRatio = async (result: {
    imageDataUrl: string;
    imageUrl?: string;
    spaceUsed: string;
    nodeLabel: string;
    provider?: 'cloudflare' | 'colab-turbo' | 'huggingface';
    elapsedMs?: number;
    translatedPrompt: string;
    width: number;
    height: number;
  }) => {
    const fixed = await ensureResultMatchesAspectRatio(
      result.imageDataUrl,
      targetRatio,
      result.translatedPrompt || payload.prompt
    );
    return {
      ...result,
      imageDataUrl: fixed.imageDataUrl,
      imageUrl: fixed.imageDataUrl,
      width: fixed.width,
      height: fixed.height,
    };
  };

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
      return await finalizeAspectRatio(normalizeServerImageResponse(serverData, payload.prompt));
    } catch (err) {
      if (err instanceof HttpApiError && err.status === 400) {
        throw err;
      }
      const fb = await generateHfSpaceBrowserFallback({
        ...payload,
        aspectRatio: targetRatio,
        imageDataUrl: requestBody.imageDataUrl,
        referenceImages: requestBody.referenceImages,
        preparedCanvasDataUrl,
      });
      return await finalizeAspectRatio(fb);
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
        return await finalizeAspectRatio(normalizeServerImageResponse(serverData, payload.prompt));
      } catch (jsonErr) {
        if (jsonErr instanceof HttpApiError && jsonErr.status === 400) {
          throw jsonErr;
        }
        const fb = await generateHfSpaceBrowserFallback(
          {
            ...payload,
            aspectRatio: targetRatio,
            imageDataUrl: requestBody.imageDataUrl,
            referenceImages: requestBody.referenceImages,
            preparedCanvasDataUrl,
          },
          onProgress
        );
        return await finalizeAspectRatio(fb);
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
      return await finalizeAspectRatio(finalResult);
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
      return await finalizeAspectRatio(normalizeServerImageResponse(serverData, payload.prompt));
    } catch (jsonErr) {
      if (jsonErr instanceof HttpApiError && jsonErr.status === 400) {
        throw jsonErr;
      }
      const fb = await generateHfSpaceBrowserFallback(
        {
          ...payload,
          aspectRatio: targetRatio,
          imageDataUrl: requestBody.imageDataUrl,
          referenceImages: requestBody.referenceImages,
          preparedCanvasDataUrl,
        },
        onProgress
      );
      return await finalizeAspectRatio(fb);
    }
  }

  const fb = await generateHfSpaceBrowserFallback(
    {
      ...payload,
      aspectRatio: targetRatio,
      imageDataUrl: requestBody.imageDataUrl,
      referenceImages: requestBody.referenceImages,
      preparedCanvasDataUrl,
    },
    onProgress
  );
  return await finalizeAspectRatio(fb);
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
    throw new HttpApiError(res.status, errMsg);
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

const HF_BROWSER_VIDEO_T2V_SPACES = [
  'Lightricks/ltx-video-distilled',
  'DeepRat/LTX-Video-ZeroGPU-Optimized',
  'zai-org/CogVideoX-5B-Space',
  'zai-org/CogVideoX-2B-Space',
];

const HF_BROWSER_VIDEO_I2V_SPACES = [
  'JCisHERE/wan2-2-i2v-v3',
  'linoyts/wan2-2-i2v-rCM',
  'zerogpu-aoti/wan2-2-fp8da-aoti-faster',
  'r3gm/wan2-2-fp8da-aoti-preview',
  'r3gm/wan2-2-fp8da-aoti-preview2',
  'multimodalart/wan2-1-fast',
  'ysharma/wan2-1-fast',
  'Lightricks/ltx-video-distilled',
  'zai-org/CogVideoX-5B-Space',
];

function dataUrlOrRemoteToBlob(dataUrl: string): Promise<Blob> {
  return fetch(dataUrl).then((r) => {
    if (!r.ok) throw new Error('Could not read starting frame image.');
    return r.blob();
  });
}

function extractBrowserGradioVideoUrl(payload: unknown): string | null {
  if (!payload) return null;
  if (typeof payload === 'string') {
    if (payload.startsWith('https://') || payload.startsWith('data:video/')) {
      return payload;
    }
    return null;
  }
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = extractBrowserGradioVideoUrl(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof payload === 'object') {
    const rec = payload as Record<string, unknown>;
    if (typeof rec.url === 'string' && (rec.url.startsWith('https://') || rec.url.startsWith('data:video/'))) {
      return rec.url;
    }
    if (rec.video) {
      const v = extractBrowserGradioVideoUrl(rec.video);
      if (v) return v;
    }
    for (const val of Object.values(rec)) {
      const found = extractBrowserGradioVideoUrl(val);
      if (found) return found;
    }
  }
  return null;
}

async function discoverBrowserRunningVideoSpaces(
  mode: 'text-to-video' | 'image-to-video'
): Promise<string[]> {
  const curated =
    mode === 'image-to-video'
      ? HF_BROWSER_VIDEO_I2V_SPACES
      : Array.from(new Set([...HF_BROWSER_VIDEO_T2V_SPACES, ...HF_BROWSER_VIDEO_I2V_SPACES]));
  const terms = ['wan2-2-i2v', 'wan2-2', 'wan2-1', 'ltx-video', 'cogvideox'];
  const discovered = new Map<string, { id: string; likes: number; hasGpu: boolean; rank: number }>();

  try {
    const results = await Promise.allSettled(
      terms.map(async (term) => {
        const res = await withBrowserTimeout(
          fetch(
            `https://huggingface.co/api/spaces?search=${encodeURIComponent(
              term
            )}&sort=likes&direction=-1&limit=12&expand[]=runtime&expand[]=sdk&expand[]=likes`
          ),
          5000,
          'Hub lookup timed out'
        );
        if (!res.ok) return [];
        const arr = (await res.json()) as unknown;
        return Array.isArray(arr) ? arr : [];
      })
    );

    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      for (const raw of r.value) {
        const item = raw as {
          id?: string;
          sdk?: string;
          likes?: number;
          runtime?: { stage?: string; hardware?: { current?: string | null } };
        };
        const id = String(item.id ?? '');
        if (!id || item.sdk !== 'gradio' || item.runtime?.stage !== 'RUNNING') continue;
        if (/upscaler|lora|trainer|extract|caption|demo-blank|bench|dataset|first-last-frame|mochi-1-preview/i.test(id)) {
          continue;
        }
        const rank = curated.indexOf(id);
        const hasGpu = Boolean(item.runtime?.hardware?.current);
        const likes = typeof item.likes === 'number' ? item.likes : 0;
        const prev = discovered.get(id);
        if (!prev || likes > prev.likes) {
          discovered.set(id, { id, likes, hasGpu, rank: rank === -1 ? 999 : rank });
        }
      }
    }

    const sorted = Array.from(discovered.values())
      .sort((a, b) => {
        if (a.hasGpu !== b.hasGpu) return a.hasGpu ? -1 : 1;
        if (a.rank !== b.rank) return a.rank - b.rank;
        return b.likes - a.likes;
      })
      .map((x) => x.id)
      .slice(0, 10);

    return sorted.length > 0 ? sorted : curated;
  } catch {
    return curated;
  }
}

async function generateHfVideoBrowserFallback(
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
): Promise<{
  videoUrl: string;
  imageDataUrl?: string;
  spaceUsed: string;
  nodeLabel: string;
  provider?: 'cloudflare' | 'colab-turbo' | 'huggingface';
  elapsedMs?: number;
  translatedPrompt?: string;
  mode: 'text-to-video' | 'image-to-video' | 'lipsync';
}> {
  const started = Date.now();
  const targetRatio: AspectRatio = payload.aspectRatio ?? '16:9';
  const videoDims = CLIENT_VIDEO_DIMS_BY_RATIO[targetRatio] ?? { w: 1024, h: 576 };
  const isWarmStorybook = payload.style === 'Warm Storybook 3D';
  const styleCue = CLIENT_STYLE_CUES[payload.style] ?? `${payload.style} aesthetic`;
  const motionCue =
    payload.cameraMotion && payload.cameraMotion !== 'Auto' && payload.cameraMotion !== 'Static'
      ? ` Camera motion: ${payload.cameraMotion.toLowerCase()}.`
      : '';
  const fullPrompt = isWarmStorybook
    ? `${payload.prompt.trim().slice(0, 520)}. ${WARM_STORYBOOK_3D_FRAMING}.${motionCue} ${WARM_STORYBOOK_3D_MODIFIERS}`
    : `${payload.prompt.trim().slice(0, 740)}. Style: ${styleCue}.${motionCue} Coherent natural motion, clean watermark-free frame.`;

  const initialImageUrl =
    payload.imageDataUrl || payload.referenceImages?.[0]?.imageUrl || undefined;
  let canReuseExactFrame = false;
  if (
    initialImageUrl &&
    payload.animateExactFrame &&
    (!payload.referenceImages || payload.referenceImages.length <= 1)
  ) {
    const imgDims = await getImageDimensions(initialImageUrl);
    if (imgDims && doesImageMatchAspectRatio(imgDims.width, imgDims.height, targetRatio, 0.04)) {
      canReuseExactFrame = true;
    }
  }

  let activeImageBlob: Blob | null = canReuseExactFrame && initialImageUrl
    ? await dataUrlOrRemoteToBlob(initialImageUrl).catch(() => null)
    : null;
  let autoGeneratedStartFrameUrl: string | undefined;

  const liveSpaces = await discoverBrowserRunningVideoSpaces(
    activeImageBlob || (payload.referenceImages && payload.referenceImages.length > 0) || initialImageUrl
      ? 'image-to-video'
      : payload.mode
  );
  const customSpace =
    typeof payload.spaceId === 'string' && /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(payload.spaceId.trim())
      ? payload.spaceId.trim()
      : null;
  const candidates = customSpace
    ? [customSpace, ...liveSpaces.filter((s) => s !== customSpace)]
    : liveSpaces;

  let lastError = 'Live Hugging Face video Spaces are currently queued.';
  let autoFrameFailed = false;

  const ensureStartFrame = async (targetSpace: string): Promise<Blob> => {
    if (activeImageBlob) return activeImageBlob;
    if (autoFrameFailed) {
      throw new Error(lastError || 'Starting scene frame generation unavailable.');
    }
    onProgress({
      type: 'status',
      progress: 24,
      translatedPrompt: fullPrompt,
      message: `Generating ${targetRatio} scene starting frame first...`,
    });
    let generated;
    try {
      generated = await generateHfImage(
        {
          prompt: payload.prompt,
          style: payload.style,
          aspectRatio: targetRatio,
          engine: 'flux-schnell',
          colabUrl: payload.colabUrl,
          imageDataUrl: payload.imageDataUrl,
          referenceImages: payload.referenceImages,
          removeBackground: Boolean(initialImageUrl || (payload.referenceImages && payload.referenceImages.length > 0)),
        },
        onProgress
      );
    } catch (err) {
      autoFrameFailed = true;
      throw err;
    }
    const blob = await dataUrlOrRemoteToBlob(generated.imageDataUrl);
    activeImageBlob = blob;
    autoGeneratedStartFrameUrl = generated.imageDataUrl;
    onProgress({
      type: 'status',
      progress: 34,
      imageDataUrl: generated.imageDataUrl,
      translatedPrompt: fullPrompt,
      message: `Starting frame ready — feeding straight into ${targetSpace}...`,
    });
    return blob;
  };

  for (let i = 0; i < candidates.length; i++) {
    const spaceId = candidates[i];
    const nodeLabel = `Hugging Face Browser Direct (${spaceId})`;
    onProgress({
      type: 'status',
      space: spaceId,
      nodeLabel,
      provider: 'huggingface',
      attempt: i + 1,
      totalAttempts: candidates.length,
      progress: Math.min(45, 20 + i * 5),
      translatedPrompt: fullPrompt,
      message: `Connecting directly in browser to ${spaceId}...`,
    });

    try {
      const client = await withBrowserTimeout(
        Client.connect(spaceId),
        18000,
        `${spaceId} connection timed out.`
      );
      const api = await withBrowserTimeout(
        client.view_api(),
        12000,
        `${spaceId} API inspection timed out.`
      );

      const namedEntries = Object.entries(api.named_endpoints ?? {}).filter(
        ([k]) => !/^\/?(_|handle_|update_|extract_|fit_|on_)/i.test(k)
      );
      const videoEndpoints = namedEntries.filter(([, ep]) =>
        (ep?.returns ?? []).some((r) => /video/i.test(String(r.component)))
      );
      const candidateEntries = videoEndpoints.length > 0 ? videoEndpoints : namedEntries;
      const isCogVideoSpace = /cogvideo/i.test(spaceId);
      const isExplicitI2vSpace =
        /wan2[-_.]?[12]|i2v|img2vid|image-to-video|minimax/i.test(spaceId) &&
        !/t2v|text-to-video/i.test(spaceId);

      // CogVideoX only produces fixed 720x480 landscape; skip it if portrait 9:16 is requested
      if (isCogVideoSpace && targetRatio === '9:16') {
        lastError = `${spaceId} only renders landscape frames`;
        continue;
      }

      const hasAnyImageIntent = Boolean(
        activeImageBlob || initialImageUrl || (payload.referenceImages && payload.referenceImages.length > 0)
      );

      const pickEndpoint = (hasFrame: boolean): string | number => {
        if (hasFrame) {
          const m = candidateEntries.find(([k]) =>
            /i2v|img2vid|image_to_video|generate_video|generate/i.test(k)
          );
          if (m) return m[0];
        } else {
          const m = candidateEntries.find(([k]) =>
            /t2v|txt2vid|text_to_video|generate|predict|infer/i.test(k)
          );
          if (m) return m[0];
        }
        return candidateEntries[0]?.[0] ?? 0;
      };

      let endpoint = pickEndpoint(Boolean(activeImageBlob));
      let epInfo =
        typeof endpoint === 'string'
          ? api.named_endpoints?.[endpoint]
          : api.unnamed_endpoints?.[0];
      let paramsMeta = epInfo?.parameters ?? [];

      const isPrimaryImageParam = (p: (typeof paramsMeta)[number]): boolean => {
        const lower = (p.parameter_name ?? '').toLowerCase();
        if (lower.includes('last') || lower.includes('end')) return false;
        const comp = String(p.component ?? '').toLowerCase();
        return (
          comp === 'image' ||
          lower === 'first_frame' ||
          lower === 'image_path' ||
          lower === 'input_image' ||
          lower === 'input_image_filepath' ||
          lower === 'image_input' ||
          (lower.includes('image') && comp !== 'textbox')
        );
      };

      const requiresMandatoryImage =
        !isCogVideoSpace &&
        paramsMeta.some((p) => !p.parameter_has_default && isPrimaryImageParam(p));
      const endpointIsI2v = /i2v|img2vid|image_to_video/i.test(String(endpoint));

      if (!activeImageBlob && (hasAnyImageIntent || requiresMandatoryImage || isExplicitI2vSpace || endpointIsI2v)) {
        await ensureStartFrame(spaceId);
        endpoint = pickEndpoint(true);
        epInfo =
          typeof endpoint === 'string'
            ? api.named_endpoints?.[endpoint]
            : api.unnamed_endpoints?.[0];
        paramsMeta = epInfo?.parameters ?? [];
      }

      const stillRequiresPrimaryImage = paramsMeta.some(
        (p) => !p.parameter_has_default && isPrimaryImageParam(p)
      );
      if (!activeImageBlob && stillRequiresPrimaryImage) {
        lastError = `${spaceId} requires a starting image frame.`;
        continue;
      }

      let attachedImage = false;
      const isDistilled = /ltx|fast|turbo|fp8/i.test(spaceId);
      const isWan22V3 = /wan2-2/i.test(spaceId);
      const needsPositional = paramsMeta.some((p) => !p.parameter_name || p.parameter_name === 'null');

      const resolveParamValue = (p: (typeof paramsMeta)[number]): unknown => {
        const name = p.parameter_name ?? '';
        const lower = name.toLowerCase();
        if (lower.includes('prompt') && !lower.includes('negative')) {
          return fullPrompt;
        }
        if (lower.includes('negative')) {
          return isWarmStorybook
            ? WARM_STORYBOOK_3D_NEGATIVE_PROMPT
            : 'photorealistic photography, flat 2d cartoon, plastic glossy skin, blurry face, text, watermark, signature, artifacts';
        }
        if (lower === 'mode') {
          return activeImageBlob ? 'image-to-video' : 'text-to-video';
        }
        if (lower === 'generation_mode') {
          return activeImageBlob ? 'Image-to-Video' : 'Text-to-Video';
        }
        if (lower === 'width' || lower === 'width_ui') {
          return videoDims.w;
        }
        if (lower === 'height' || lower === 'height_ui') {
          return videoDims.h;
        }
        if (activeImageBlob && !attachedImage && isPrimaryImageParam(p)) {
          attachedImage = true;
          return handle_file(activeImageBlob);
        }
        if (isWan22V3 && lower === 'quality') {
          return 8;
        }
        if (isWan22V3 && lower === 'steps') {
          return 8;
        }
        if (
          (lower === 'num_inference_steps' || lower === 'steps') &&
          isDistilled &&
          !p.parameter_has_default
        ) {
          return 8;
        }
        if ((lower === 'duration' || lower === 'seconds') && !p.parameter_has_default) {
          return 3;
        }
        if (p.parameter_has_default) {
          return p.parameter_default;
        }
        return null;
      };

      const positionalValues = paramsMeta.map((p) => resolveParamValue(p));
      const gradioPayload: Record<string, unknown> = {};
      paramsMeta.forEach((p, idx) => {
        if (p.parameter_name && p.parameter_name !== 'null') {
          gradioPayload[p.parameter_name] = positionalValues[idx];
        }
      });

      const submitArgs: unknown[] | Record<string, unknown> = needsPositional
        ? positionalValues
        : Object.keys(gradioPayload).length > 0
        ? gradioPayload
        : [fullPrompt];

      const job = client.submit(endpoint, submitArgs, null, null, true);

      let videoUrl: string | null = null;
      const jobStart = Date.now();
      for await (const msg of job) {
        if (Date.now() - jobStart > 120_000 && !videoUrl) {
          lastError = `${spaceId} queue wait exceeded 120s limit.`;
          break;
        }
        if (msg.type === 'status') {
          const queueInfo =
            typeof msg.position === 'number' ? `Queue #${msg.position + 1}` : msg.stage;
          const etaInfo =
            typeof msg.eta === 'number' && msg.eta > 0 ? ` · Est. ${Math.round(msg.eta)}s` : '';
          onProgress({
            type: 'status',
            space: spaceId,
            nodeLabel,
            provider: 'huggingface',
            attempt: i + 1,
            totalAttempts: candidates.length,
            progress: msg.stage === 'generating' ? 72 : 52,
            queuePosition: msg.position,
            eta: msg.eta,
            translatedPrompt: fullPrompt,
            message: `Connected to ${spaceId} · ${queueInfo}${etaInfo}`,
          });
          if (msg.stage === 'error') {
            lastError =
              typeof msg.message === 'string' ? msg.message : `${spaceId} reported an error.`;
            break;
          }
        } else if (msg.type === 'data') {
          videoUrl = extractBrowserGradioVideoUrl(msg.data);
          if (videoUrl) break;
        }
      }

      if (!videoUrl) continue;

      const finalResult = {
        videoUrl,
        ...(autoGeneratedStartFrameUrl ? { imageDataUrl: autoGeneratedStartFrameUrl } : {}),
        spaceUsed: spaceId,
        nodeLabel,
        provider: 'huggingface' as const,
        elapsedMs: Date.now() - started,
        translatedPrompt: fullPrompt,
        mode: (activeImageBlob ? 'image-to-video' : 'text-to-video') as
          | 'text-to-video'
          | 'image-to-video',
      };
      onProgress({
        type: 'complete',
        ...finalResult,
        progress: 100,
      });
      return finalResult;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  throw new Error(lastError);
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

  try {
    return await consumeSseVideoStream(
      '/api/generate-video',
      {
        ...payload,
        action: 'video',
        colabUrl: payload.colabUrl ?? getActiveColabUrl(),
      },
      onProgress
    );
  } catch (err) {
    if (err instanceof HttpApiError && err.status === 400) {
      throw err;
    }
    return await generateHfVideoBrowserFallback(payload, onProgress);
  }
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
