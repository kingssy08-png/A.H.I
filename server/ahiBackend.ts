import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Buffer } from 'node:buffer';
import dotenv from 'dotenv';
import { Client, handle_file } from '@gradio/client';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

dotenv.config();

const execFileAsync = promisify(execFile);

const ALLOWED_STYLES = [
  'Warm Storybook 3D',
  'Enchanted Storybook',
  '3D Pixar-Style Cartoon',
  'Anime',
  'Cinematic Film',
  '2D Illustration',
  'Music Video',
  'Product Ad',
  'Realistic',
  '3D Cartoon',
  'Educational',
] as const;

const ALLOWED_RATIOS = ['16:9', '9:16', '1:1', '21:9'] as const;
const ALLOWED_QUALITIES = ['standard', 'high', 'ultra'] as const;
type ImageQualityTier = (typeof ALLOWED_QUALITIES)[number];

const ALLOWED_CAMERA_MOTIONS = [
  'Auto',
  'Zoom In',
  'Zoom Out',
  'Pan Left',
  'Pan Right',
  'Orbit',
  'Drone Flyover',
  'Static',
] as const;
const ALLOWED_VOICES = ['Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr'] as const;

const IMAGE_DIMENSIONS_BY_RATIO: Record<string, { w: number; h: number }> = {
  '16:9': { w: 1280, h: 720 },
  '9:16': { w: 720, h: 1280 },
  '1:1': { w: 1024, h: 1024 },
  '21:9': { w: 1344, h: 576 },
};

const QUALITY_DIMENSIONS_BY_TIER: Record<
  ImageQualityTier,
  Record<string, { w: number; h: number }>
> = {
  standard: {
    '16:9': { w: 1024, h: 576 },
    '9:16': { w: 576, h: 1024 },
    '1:1': { w: 768, h: 768 },
    '21:9': { w: 1008, h: 432 },
  },
  high: {
    '16:9': { w: 1280, h: 720 },
    '9:16': { w: 720, h: 1280 },
    '1:1': { w: 1024, h: 1024 },
    '21:9': { w: 1344, h: 576 },
  },
  ultra: {
    '16:9': { w: 1536, h: 864 },
    '9:16': { w: 864, h: 1536 },
    '1:1': { w: 1024, h: 1024 },
    '21:9': { w: 1344, h: 576 },
  },
};

const CLOUDFLARE_DIMENSIONS_BY_RATIO: Record<string, { w: number; h: number }> = {
  '16:9': { w: 1024, h: 576 },
  '9:16': { w: 576, h: 1024 },
  '1:1': { w: 1024, h: 1024 },
  '21:9': { w: 1008, h: 432 },
};

const FLUX1_DEV_DIMENSIONS_BY_RATIO: Record<string, { w: number; h: number }> = {
  '16:9': { w: 1536, h: 864 },
  '9:16': { w: 864, h: 1536 },
  '1:1': { w: 1024, h: 1024 },
  '21:9': { w: 1344, h: 576 },
};

const FLUX2_DIMENSIONS_BY_RATIO: Record<string, { w: number; h: number }> = {
  '16:9': { w: 1024, h: 576 },
  '9:16': { w: 576, h: 1024 },
  '1:1': { w: 1024, h: 1024 },
  '21:9': { w: 1008, h: 432 },
};

const VIDEO_DIMENSIONS_BY_RATIO: Record<string, { w: number; h: number }> = {
  '16:9': { w: 1024, h: 576 },
  '9:16': { w: 576, h: 1024 },
  '1:1': { w: 768, h: 768 },
  '21:9': { w: 896, h: 384 },
};

const SVG_VIEWBOX_BY_RATIO: Record<string, { w: number; h: number }> = {
  '16:9': { w: 640, h: 360 },
  '9:16': { w: 360, h: 640 },
  '1:1': { w: 480, h: 480 },
  '21:9': { w: 756, h: 324 },
};

const SPACE_ID_RE = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/;
const FLUX_SPACES = [
  'black-forest-labs/FLUX.2-klein-9B',
  'black-forest-labs/FLUX.1-schnell',
  'black-forest-labs/FLUX.1-dev',
  'Qwen/Qwen-Image-2512',
  'stabilityai/stable-diffusion-3.5-large-turbo',
  'prodia/fast-stable-diffusion',
];
const BACKGROUND_REMOVAL_SPACES = [
  'not-lain/background-removal',
  'briaai/BRIA-RMBG-1.4',
  'ZhengPeng7/BiRefNet_demo',
];
const REFERENCE_EDIT_SPACES = [
  'black-forest-labs/FLUX.2-klein-9B',
  'black-forest-labs/FLUX.1-Kontext-dev',
  'Qwen/Qwen-Image-Edit',
  'black-forest-labs/FLUX.2-dev',
];
const SDXL_SPACES = [
  'black-forest-labs/FLUX.2-klein-9B',
  'Qwen/Qwen-Image-2512',
  'stabilityai/stable-diffusion-3.5-large-turbo',
  'prodia/fast-stable-diffusion',
  'stabilityai/stable-diffusion-xl-base-1.0',
  'black-forest-labs/FLUX.1-schnell',
];
const VIDEO_SPACES_T2V = [
  'Lightricks/ltx-video-distilled',
  'Lightricks/LTX-2-3',
  'alexnasa/ltx-2-TURBO',
  'DeepRat/LTX-Video-ZeroGPU-Optimized',
  'zai-org/CogVideoX-5B-Space',
  'zai-org/CogVideoX-2B-Space',
];
const VIDEO_SPACES_I2V = [
  'JCisHERE/wan2-2-i2v-v3',
  'linoyts/wan2-2-i2v-rCM',
  'zerogpu-aoti/wan2-2-fp8da-aoti-faster',
  'r3gm/wan2-2-fp8da-aoti-preview',
  'r3gm/wan2-2-fp8da-aoti-preview2',
  'Lightricks/LTX-2-3',
  'wank3r/minimax-h3',
  'multimodalart/wan2-1-fast',
  'ysharma/wan2-1-fast',
  'Lightricks/ltx-video-distilled',
  'alexnasa/ltx-2-TURBO',
  'zai-org/CogVideoX-5B-Space',
  'zai-org/CogVideoX-2B-Space',
];
const LIPSYNC_SPACES = [
  'KwaiVGI/LivePortrait',
  'vinthony/SadTalker',
  'fffiloni/SadTalker',
  'BadToBest/EchoMimic',
  'fudan-generative-ai/hallo',
];

const SPACE_NODE_LABELS: Record<string, string> = {
  'cloudflare/flux-1-schnell': 'Cloudflare Workers AI (Instant 1–3s)',
  'colab/turbo-gpu': 'Colab Turbo GPU (Private Zero-Queue)',
  'black-forest-labs/FLUX.1-dev': 'FLUX.1 Dev HF Node',
  'black-forest-labs/FLUX.2-dev': 'FLUX.2 Dev Multi-Ref Node',
  'Qwen/Qwen-Image-2512': 'Qwen Image 2512 HF Node',
  'black-forest-labs/FLUX.1-schnell': 'Flux.1 HF Node',
  'stabilityai/stable-diffusion-3.5-large-turbo': 'SD 3.5 Turbo HF Node',
  'prodia/fast-stable-diffusion': 'Prodia Fast SD HF Node',
  'stabilityai/stable-diffusion-xl-base-1.0': 'SDXL Base HF Node',
  'Lightricks/ltx-video-distilled': 'LTX-Video Distilled (Fast 10–25s)',
  'DeepRat/LTX-Video-ZeroGPU-Optimized': 'LTX-Video ZeroGPU Optimized',
  'alexnasa/ltx-2-TURBO': 'LTX-2 Turbo Fast Node',
  'JCisHERE/wan2-2-i2v-v3': 'Wan 2.2 I2V v3 ZeroGPU Node',
  'linoyts/wan2-2-i2v-rCM': 'Wan 2.2 I2V rCM Fast Node',
  'zerogpu-aoti/wan2-2-fp8da-aoti-faster': 'Wan 2.2 Fast ZeroGPU Node',
  'r3gm/wan2-2-fp8da-aoti-preview': 'Wan 2.2 Preview ZeroGPU Node',
  'r3gm/wan2-2-fp8da-aoti-preview2': 'Wan 2.2 Preview-2 ZeroGPU Node',
  'multimodalart/wan2-1-fast': 'Wan 2.1 Fast Turbo (4-Step)',
  'ysharma/wan2-1-fast': 'Wan 2.1 Fast I2V (4-Step)',
  'zai-org/CogVideoX-5B-Space': 'CogVideoX-5B ZeroGPU Node',
  'zai-org/CogVideoX-2B-Space': 'CogVideoX-2B ZeroGPU Node',
  'KwaiVGI/LivePortrait': 'LivePortrait Expression Node',
  'vinthony/SadTalker': 'SadTalker Talking-Head Node',
  'fffiloni/SadTalker': 'SadTalker Mirror Node',
  'BadToBest/EchoMimic': 'EchoMimic Portrait Node',
  'fudan-generative-ai/hallo': 'Hallo Portrait Lip-Sync Node',
};

const WARM_STORYBOOK_3D_MODIFIERS =
  'soft-focus vintage cinema lens, dreamy halation and warm sunlit bloom, gentle mist diffusion filter (Pro-Mist 1/2), low micro-contrast, soft pastel matte clay and felt textures, slightly blurred soft edges, warm overexposed sunlit sky in background, cozy handcrafted animated film still, 35mm film softness—strictly avoid razor-sharp focus, avoid ultra-detailed pores or sharp fabric lines, avoid high-contrast HDR, avoid glossy studio lighting.';

const WARM_STORYBOOK_3D_FRAMING =
  'wide 16:9 candid full-scene movie frame with foreground and background layers where characters interact naturally in a warm sunlit environment rather than sharp close-up portraits';

const WARM_STORYBOOK_3D_NEGATIVE_PROMPT =
  'razor-sharp focus, ultra-detailed pores, sharp fabric lines, high-contrast HDR, glossy studio lighting, close-up portrait, text, watermark, signature, artifacts';

const ENCHANTED_STORYBOOK_DIRECTIVES =
  'enchanted fairy-tale animated storybook atmosphere, golden volumetric sunbeams filtering diagonally through mossy ancient trees, glowing floating dust motes and warm fireflies drifting softly in the air, lush botanical foreground framed with wildflowers, curled ferns, and woodland mushrooms, soft atmospheric depth-of-field haze, warm painterly brushwork blended with rich theatrical 3D cinema depth, luminous golden-hour rim light and cozy woodland magic—no text, no watermark';

const PREMIUM_3D_ANIMATION_BENCHMARK =
  'theatrical feature-film-quality 3D animated movie frame, beautifully sculpted stylized characters with natural proportions, expressive faces, detailed irises with corneal catchlights, individually sculpted eyebrows and eyelashes, realistic hair strands/braids and tactile fur textures, warm subsurface skin shading with amber bounce light, tactile woven fabrics and subtle brushed metal PBR surface shaders, physically based global illumination, soft ambient occlusion, natural grounded contact shadows, rich atmospheric environments with realistic depth perspective and shallow depth-of-field bokeh, professional cinematic color grading—strictly avoid flat 2D cartoon, avoid low-poly models, avoid blurry textures, avoid photorealistic uncanny valleys, avoid glossy plastic AI skin';

const STYLE_PROMPT_DIRECTIVES: Record<string, string> = {
  'Warm Storybook 3D': `${WARM_STORYBOOK_3D_FRAMING}, ${WARM_STORYBOOK_3D_MODIFIERS}`,
  'Enchanted Storybook': ENCHANTED_STORYBOOK_DIRECTIVES,
  '3D Pixar-Style Cartoon': PREMIUM_3D_ANIMATION_BENCHMARK,
  '3D Cartoon': PREMIUM_3D_ANIMATION_BENCHMARK,
  Anime:
    'high-budget theatrical anime feature animation, expressive cel-shaded linework, layered painted environments, volumetric atmospheric lighting, dynamic cinema depth',
  'Cinematic Film':
    '35mm anamorphic theatrical film aesthetic, volumetric light shafts, rich cinematic color grading, optical shallow depth-of-field bokeh',
  '2D Illustration':
    'hand-crafted theatrical 2D editorial illustration aesthetic, rich gouache brushwork, layered depth and atmospheric lighting',
  'Music Video':
    'high-energy stylized music video cinematography, kinetic lighting choreography, vibrant rim lighting, anamorphic lens flare',
  'Product Ad':
    'luxury commercial product studio macro cinematography, physically accurate glass & brushed metal specular highlights, soft reflections, shallow depth of field',
  Realistic:
    'photorealistic live-action cinema camera aesthetic, physically accurate global illumination, natural lens depth',
  Educational:
    'clean 2.5D animated explainer motion graphics aesthetic, crisp geometric clarity, warm studio readability',
};

const CAMERA_MOTION_DIRECTIVES: Record<string, string> = {
  'Zoom In': 'smooth dramatic dolly zoom-in pushing steadily toward the focal subject',
  'Zoom Out': 'gradual cinematic dolly zoom-out pulling back to reveal the wider environment',
  'Pan Left': 'fluid horizontal camera pan sweeping smoothly from right to left across the scene',
  'Pan Right': 'fluid horizontal tracking camera pan gliding steadily to the right',
  Orbit: 'smooth 180-degree orbital arc camera rotating gracefully around the hero subject',
  'Drone Flyover': 'elevated aerial drone flyover shot gliding smoothly above the landscape',
  Static: 'locked cinema tripod static frame with crisp, stable composition and natural subject motion',
};

type TalkingShotAngle = 'two-shot' | 'close-up' | 'over-shoulder';
type TalkingVoicePreset = 'male' | 'female' | 'cartoon' | 'mentor' | 'bright';

const TALKING_VOICE_MAP: Record<
  TalkingVoicePreset,
  { voiceName: (typeof ALLOWED_VOICES)[number]; styleInstruction: string }
> = {
  male: {
    voiceName: 'Charon',
    styleInstruction: 'Natural, expressive adult male character speaking clearly with warm tone',
  },
  female: {
    voiceName: 'Kore',
    styleInstruction: 'Natural, warm, expressive female character speaking clearly',
  },
  cartoon: {
    voiceName: 'Puck',
    styleInstruction: 'Bright, playful youthful child/cartoon character pitch with lively animation energy',
  },
  mentor: {
    voiceName: 'Fenrir',
    styleInstruction: 'Deep, grounded, cinematic mentor or narrator speaking with calm authority',
  },
  bright: {
    voiceName: 'Zephyr',
    styleInstruction: 'Crisp, upbeat, friendly energetic character speaking cleanly',
  },
};

function getNodeLabel(space: string): string {
  return SPACE_NODE_LABELS[space] ?? space;
}

function formatModelDisplayLabel(modelId: string): string {
  const lower = modelId.toLowerCase();
  if (lower.includes('flux-2-dev') || lower.includes('flux.2-dev')) return 'Flux.2 Dev';
  if (lower.includes('flux-2-klein-9b') || lower.includes('flux.2-klein-9b')) return 'Flux.2 Klein 9B';
  if (lower.includes('flux-2-klein-4b') || lower.includes('flux.2-klein-4b')) return 'Flux.2 Klein 4B';
  if (lower.includes('flux.1-dev') || lower.includes('flux-1-dev')) return 'Flux.1 Dev';
  if (lower.includes('flux-1-schnell') || lower.includes('flux.1-schnell')) return 'Flux.1 Schnell';
  if (lower.includes('kontext')) return 'Flux.1 Kontext';
  if (lower.includes('qwen-image')) return 'Qwen Image';
  if (lower.includes('lucid-origin')) return 'Lucid Origin';
  if (lower.includes('phoenix')) return 'Phoenix 1.0';
  if (lower.includes('stable-diffusion-3.5') || lower.includes('sd3.5')) return 'SD 3.5 Turbo';
  if (lower.includes('stable-diffusion-3')) return 'SD3 Medium';
  if (lower.includes('stable-diffusion-xl') || lower.includes('sdxl')) return 'SDXL 1.0';
  if (lower.includes('dreamshaper')) return 'DreamShaper';
  if (lower.includes('deliberate')) return 'Deliberate';
  if (lower.includes('aam xl')) return 'AAM XL';
  if (lower.includes('hassaku')) return 'Hassaku XL';
  if (lower.includes('526mix')) return '526Mix Animated';
  if (lower.includes('camelliamix')) return 'CamelliaMix 2.5D';
  if (lower.includes('comic-diffusion')) return 'Comic Diffusion';
  if (lower.includes('stable_diffusion')) return 'Stable Diffusion';
  return 'A.H.I Render Engine';
}

function getHfToken(): `hf_${string}` | undefined {
  const raw = process.env.HF_TOKEN?.trim() ?? '';
  if (!raw || raw.startsWith('MY_HF_')) return undefined;
  return raw as `hf_${string}`;
}

function getHfGradioOptions(): { hf_token: `hf_${string}`; token: `hf_${string}` } | undefined {
  const hfToken = getHfToken();
  return hfToken ? { hf_token: hfToken, token: hfToken } : undefined;
}

function getHfAuthHeadersForUrl(rawUrl: string): Record<string, string> | undefined {
  const hfToken = getHfToken();
  if (!hfToken) return undefined;
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    if (host === 'huggingface.co' || host.endsWith('.huggingface.co') || host.endsWith('.hf.space')) {
      return { Authorization: `Bearer ${hfToken}` };
    }
  } catch {
    // ignore malformed URL
  }
  return undefined;
}

function getCloudflareCredentials(): { accountId: string; apiToken: string } | null {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim() ?? '';
  const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim() ?? '';
  if (
    !accountId ||
    !apiToken ||
    accountId.startsWith('MY_CLOUDFLARE') ||
    apiToken.startsWith('MY_CLOUDFLARE')
  ) {
    return null;
  }
  return { accountId, apiToken };
}

export function getMissingEnvKeys(): string[] {
  const missing: string[] = [];
  if (!process.env.GEMINI_API_KEY?.trim()) missing.push('GEMINI_API_KEY');
  if (!getHfToken()) missing.push('HF_TOKEN');
  if (!getCloudflareCredentials()) {
    missing.push('CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN');
  }
  return missing;
}

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    const error = new Error(
      'GEMINI_API_KEY is not configured. Add it in your environment variables to enable Gemini generation.'
    ) as Error & { statusCode?: number };
    error.statusCode = 503;
    throw error;
  }

  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function formatGeminiError(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : String(err);
  const maybeStatus =
    (err as { statusCode?: number; status?: number })?.statusCode ??
    (err as { status?: number })?.status;

  if (maybeStatus === 503) {
    return { status: 503, message: raw };
  }
  if (raw.includes('API_KEY_INVALID') || raw.includes('PERMISSION_DENIED') || raw.includes('403')) {
    return {
      status: 403,
      message: 'Gemini API authentication failed. Please verify GEMINI_API_KEY in environment settings.',
    };
  }
  if (raw.includes('RESOURCE_EXHAUSTED') || raw.includes('429')) {
    return {
      status: 429,
      message: 'Gemini API rate limit reached. Please wait a moment and try again.',
    };
  }
  if (raw.includes('NOT_FOUND') || raw.includes('404')) {
    return {
      status: 404,
      message: `Requested Gemini model could not be reached: ${raw}`,
    };
  }
  return {
    status: 500,
    message: raw || 'Unexpected error communicating with Gemini API.',
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number, timeoutMessage: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(timeoutMessage)), ms);
    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

export async function parseJsonBody(
  request: Request
): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; response: Response }> {
  try {
    const text = await request.text();
    if (!text.trim()) return { ok: true, data: {} };
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { ok: true, data: parsed as Record<string, unknown> };
    }
    return {
      ok: false,
      response: Response.json({ error: 'Request JSON body must be an object.' }, { status: 400 }),
    };
  } catch {
    return {
      ok: false,
      response: Response.json({ error: 'Invalid JSON request body.' }, { status: 400 }),
    };
  }
}

function createSseStreamResponse(
  run: (sendEvent: (event: Record<string, unknown>) => void) => Promise<void>
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const sendEvent = (event: Record<string, unknown>) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          closed = true;
        }
      };

      try {
        await run(sendEvent);
      } catch (err) {
        sendEvent({
          type: 'error',
          error: err instanceof Error ? err.message : 'Unexpected server stream error.',
        });
      } finally {
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            // already closed
          }
        }
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}

interface HfHubSpaceSummary {
  id?: string;
  sdk?: string;
  likes?: number;
  runtime?: {
    stage?: string;
    hardware?: {
      current?: string | null;
    };
  };
}

const liveSpaceDiscoveryCache = new Map<string, { spaces: string[]; expiresAt: number }>();

async function queryHfHubSpaces(searchTerm: string, limit = 12): Promise<HfHubSpaceSummary[]> {
  const hfToken = getHfToken();
  const url = `https://huggingface.co/api/spaces?search=${encodeURIComponent(
    searchTerm
  )}&sort=likes&direction=-1&limit=${limit}&expand[]=runtime&expand[]=sdk&expand[]=likes`;

  const res = await withTimeout(
    fetch(url, {
      headers: hfToken ? { Authorization: `Bearer ${hfToken}` } : undefined,
    }),
    5000,
    'Hugging Face Hub discovery timed out.'
  );
  if (!res.ok) return [];
  const data = (await res.json()) as unknown;
  return Array.isArray(data) ? (data as HfHubSpaceSummary[]) : [];
}

async function fetchSingleHfSpaceStatus(spaceId: string): Promise<HfHubSpaceSummary | null> {
  if (!SPACE_ID_RE.test(spaceId)) return null;
  const hfToken = getHfToken();
  try {
    const res = await withTimeout(
      fetch(`https://huggingface.co/api/spaces/${spaceId}`, {
        headers: hfToken ? { Authorization: `Bearer ${hfToken}` } : undefined,
      }),
      4000,
      'HF space status lookup timed out.'
    );
    if (!res.ok) return null;
    return (await res.json()) as HfHubSpaceSummary;
  } catch {
    return null;
  }
}

function isEligibleRunningVideoSpace(item: HfHubSpaceSummary): boolean {
  const id = String(item.id ?? '');
  if (!id || !SPACE_ID_RE.test(id)) return false;
  if (id === 'genmo/mochi-1-preview') return false;
  if (item.sdk !== 'gradio') return false;
  if (item.runtime?.stage !== 'RUNNING') return false;
  if (/upscaler|lora|trainer|extract|caption|demo-blank|bench|dataset|first-last-frame/i.test(id)) {
    return false;
  }
  return true;
}

async function discoverRunningVideoSpaces(
  mode: 'text-to-video' | 'image-to-video'
): Promise<string[]> {
  const now = Date.now();
  const cached = liveSpaceDiscoveryCache.get(mode);
  if (cached && cached.expiresAt > now && cached.spaces.length > 0) {
    return cached.spaces;
  }

  // Always check all curated T2V + I2V Spaces across Wan2.1, Wan2.2, LTX-Video, and CogVideoX
  // so Text-to-Video can seamlessly promote to auto-frame + I2V if T2V nodes are busy or down.
  const curatedPriority =
    mode === 'image-to-video'
      ? VIDEO_SPACES_I2V
      : Array.from(new Set([...VIDEO_SPACES_T2V, ...VIDEO_SPACES_I2V]));

  const searchTerms =
    mode === 'image-to-video'
      ? ['wan2-2-i2v', 'wan2-2', 'wan2-1', 'ltx-video', 'cogvideox']
      : ['ltx-video', 'cogvideox', 'wan2-2-i2v', 'wan2-2', 'wan2-1'];

  try {
    const [searchResults, curatedStatuses] = await Promise.all([
      Promise.allSettled(searchTerms.map((term) => queryHfHubSpaces(term, 15))),
      Promise.allSettled(curatedPriority.map((id) => fetchSingleHfSpaceStatus(id))),
    ]);

    const discoveredMap = new Map<
      string,
      { id: string; likes: number; hasGpu: boolean; curatedRank: number }
    >();

    const recordCandidate = (item: HfHubSpaceSummary) => {
      if (!isEligibleRunningVideoSpace(item) || !item.id) return;
      const curatedIdx = curatedPriority.indexOf(item.id);
      const hasGpu = Boolean(item.runtime?.hardware?.current);
      const likes = typeof item.likes === 'number' ? item.likes : 0;
      const existing = discoveredMap.get(item.id);
      if (!existing || likes > existing.likes) {
        discoveredMap.set(item.id, {
          id: item.id,
          likes,
          hasGpu,
          curatedRank: curatedIdx === -1 ? 999 : curatedIdx,
        });
      }
    };

    for (const r of curatedStatuses) {
      if (r.status === 'fulfilled' && r.value) recordCandidate(r.value);
    }
    for (const r of searchResults) {
      if (r.status === 'fulfilled') {
        for (const item of r.value) recordCandidate(item);
      }
    }

    const ranked = Array.from(discoveredMap.values())
      .sort((a, b) => {
        if (a.hasGpu !== b.hasGpu) return a.hasGpu ? -1 : 1;
        if (a.curatedRank !== b.curatedRank) return a.curatedRank - b.curatedRank;
        return b.likes - a.likes;
      })
      .map((entry) => entry.id)
      .slice(0, 12);

    const finalSpaces = ranked.length > 0 ? ranked : curatedPriority;
    liveSpaceDiscoveryCache.set(mode, { spaces: finalSpaces, expiresAt: now + 90_000 });
    return finalSpaces;
  } catch {
    return curatedPriority;
  }
}

async function discoverRunningImageSpaces(useSdxl: boolean): Promise<string[]> {
  const cacheKey = useSdxl ? 'image-sdxl' : 'image-flux';
  const now = Date.now();
  const cached = liveSpaceDiscoveryCache.get(cacheKey);
  if (cached && cached.expiresAt > now && cached.spaces.length > 0) {
    return cached.spaces;
  }

  const curated = useSdxl ? SDXL_SPACES : FLUX_SPACES;
  const searchTerms = useSdxl
    ? ['Qwen-Image', 'stable-diffusion-3.5', 'stable-diffusion-xl']
    : ['FLUX.1-dev', 'Qwen-Image', 'FLUX.1-schnell'];

  try {
    const [curatedStatuses, searchResults] = await Promise.all([
      Promise.allSettled(curated.map((id) => fetchSingleHfSpaceStatus(id))),
      Promise.allSettled(searchTerms.map((t) => queryHfHubSpaces(t, 10))),
    ]);

    const discoveredMap = new Map<string, { id: string; likes: number; curatedRank: number }>();
    const addIfRunning = (item: HfHubSpaceSummary) => {
      const id = String(item.id ?? '');
      if (!id || !SPACE_ID_RE.test(id)) return;
      if (item.sdk !== 'gradio' || item.runtime?.stage !== 'RUNNING') return;
      if (
        /video|i2v|t2v|upscaler|lora|trainer|angles|multiple-angles|pose|depth|canny|controlnet|edit|inpaint|outpaint|kontext|rembg|remove/i.test(
          id
        )
      ) {
        return;
      }
      const idx = curated.indexOf(id);
      const likes = typeof item.likes === 'number' ? item.likes : 0;
      const prev = discoveredMap.get(id);
      if (!prev || likes > prev.likes) {
        discoveredMap.set(id, { id, likes, curatedRank: idx === -1 ? 999 : idx });
      }
    };

    for (const r of curatedStatuses) {
      if (r.status === 'fulfilled' && r.value) addIfRunning(r.value);
    }
    for (const r of searchResults) {
      if (r.status === 'fulfilled') {
        for (const item of r.value) addIfRunning(item);
      }
    }

    const ranked = Array.from(discoveredMap.values())
      .sort((a, b) => {
        if (a.curatedRank !== b.curatedRank) return a.curatedRank - b.curatedRank;
        return b.likes - a.likes;
      })
      .map((x) => x.id)
      .slice(0, 6);

    const finalSpaces = ranked.length > 0 ? ranked : curated;
    liveSpaceDiscoveryCache.set(cacheKey, { spaces: finalSpaces, expiresAt: now + 90_000 });
    return finalSpaces;
  } catch {
    return curated;
  }
}

async function discoverRunningLipsyncSpaces(): Promise<string[]> {
  try {
    const [curatedStatuses, livePortraitRes, sadTalkerRes, echoMimicRes] = await Promise.all([
      Promise.allSettled(LIPSYNC_SPACES.map((id) => fetchSingleHfSpaceStatus(id))),
      queryHfHubSpaces('LivePortrait', 4),
      queryHfHubSpaces('SadTalker', 8),
      queryHfHubSpaces('EchoMimic', 5),
    ]);
    const running: string[] = [];
    for (const r of curatedStatuses) {
      if (
        r.status === 'fulfilled' &&
        r.value?.id &&
        r.value.sdk === 'gradio' &&
        r.value.runtime?.stage === 'RUNNING'
      ) {
        running.push(r.value.id);
      }
    }
    for (const item of [...sadTalkerRes, ...echoMimicRes, ...livePortraitRes]) {
      if (
        item.id &&
        SPACE_ID_RE.test(item.id) &&
        item.sdk === 'gradio' &&
        item.runtime?.stage === 'RUNNING'
      ) {
        if (!running.includes(item.id)) running.push(item.id);
      }
    }
    return running.length > 0 ? running.slice(0, 6) : LIPSYNC_SPACES;
  } catch {
    return LIPSYNC_SPACES;
  }
}

function buildTranslatedImagePrompt(prompt: string, style: string): string {
  if (style === 'Warm Storybook 3D') {
    return `${prompt.trim().slice(0, 520)}, ${WARM_STORYBOOK_3D_FRAMING}, ${WARM_STORYBOOK_3D_MODIFIERS}, no text, no watermark`;
  }
  const styleCue = STYLE_PROMPT_DIRECTIVES[style] ?? `${style} visual aesthetic`;
  return `${prompt.trim().slice(0, 720)}, ${styleCue}, cohesive edge-to-edge scene composition, no letterbox bars, no text, no watermark`;
}

function buildTranslatedVideoPrompt(
  prompt: string,
  style: string,
  aspectRatio: string,
  cameraMotion: string
): string {
  if (style === 'Warm Storybook 3D') {
    const targetRatio = aspectRatio === 'Auto' || !aspectRatio ? '16:9' : aspectRatio;
    const motionSegment =
      cameraMotion && cameraMotion !== 'Auto' && cameraMotion !== 'Static'
        ? ` Gentle camera motion: ${
            CAMERA_MOTION_DIRECTIVES[cameraMotion] ??
            `smooth cinematic camera ${cameraMotion.toLowerCase()} movement`
          }.`
        : '';
    return `${prompt.trim().slice(0, 520)}. ${WARM_STORYBOOK_3D_FRAMING} (${targetRatio} aspect ratio).${motionSegment} ${WARM_STORYBOOK_3D_MODIFIERS} Coherent gentle natural motion, clean watermark-free film still.`;
  }
  const styleCue = STYLE_PROMPT_DIRECTIVES[style] ?? `${style} visual aesthetic`;
  if (!cameraMotion || cameraMotion === 'Auto' || cameraMotion === 'Static') {
    return `${prompt.trim().slice(0, 780)}. Style: ${styleCue}, ${aspectRatio} framing, coherent temporal motion, clean watermark-free output.`;
  }
  const motionCue =
    CAMERA_MOTION_DIRECTIVES[cameraMotion] ??
    `smooth cinematic camera ${cameraMotion.toLowerCase()} movement`;
  return `${prompt.trim().slice(0, 740)}. Style: ${styleCue}. Camera hint if not specified: ${motionCue}, ${aspectRatio} framing, coherent temporal motion, clean watermark-free output.`;
}

const generatedClipCache = new Map<string, { buffer: Buffer; mimeType: string }>();

function cacheGeneratedClip(buffer: Buffer, mimeType: string): string {
  const id = `clip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  if (generatedClipCache.size >= 16) {
    const oldestKey = generatedClipCache.keys().next().value;
    if (oldestKey) generatedClipCache.delete(oldestKey);
  }
  generatedClipCache.set(id, { buffer, mimeType });
  return id;
}

function serializeRenderedVideoUrl(buf: Buffer, mime: string, fallbackUpstreamUrl: string): string {
  // On stateless serverless (Vercel), cross-container GET /api/hf/clip/:id misses memory cache.
  // Embed playable base64 data URI directly when <= 8MB; otherwise return upstream HTTPS URL.
  if (process.env.VERCEL) {
    if (buf.length <= 8 * 1024 * 1024) {
      const cleanMime = mime.split(';')[0]?.trim() || 'video/mp4';
      return `data:${cleanMime};base64,${buf.toString('base64')}`;
    }
    return fallbackUpstreamUrl;
  }
  const clipId = cacheGeneratedClip(buf, mime);
  return `/api/hf/clip/${clipId}`;
}

function isPrivateOrBlockedHost(host: string): boolean {
  const lower = host.toLowerCase();
  if (
    lower === 'localhost' ||
    lower === '0.0.0.0' ||
    lower === '::1' ||
    lower.startsWith('127.') ||
    lower.startsWith('10.') ||
    lower.startsWith('192.168.') ||
    lower.startsWith('169.254.') ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal')
  ) {
    return true;
  }
  const m172 = lower.match(/^172\.(\d+)\./);
  if (m172) {
    const second = Number(m172[1]);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

function validateColabGradioUrl(rawUrl: unknown): { url: string; host: string } | null {
  if (typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') return null;
    if (parsed.username || parsed.password) return null;
    const host = parsed.hostname.toLowerCase();
    if (isPrivateOrBlockedHost(host)) return null;
    if (!host.endsWith('.gradio.live') && !host.endsWith('.hf.space')) {
      return null;
    }
    return {
      url: `${parsed.origin}${parsed.pathname === '/' ? '' : parsed.pathname}`.replace(/\/+$/, ''),
      host,
    };
  } catch {
    return null;
  }
}

function isAllowedMediaUrl(rawUrl: string, extraAllowedHost?: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (isPrivateOrBlockedHost(host)) return false;
    if (extraAllowedHost && host === extraAllowedHost.toLowerCase()) {
      return true;
    }
    return (
      host === 'huggingface.co' ||
      host.endsWith('.huggingface.co') ||
      host.endsWith('.hf.space') ||
      host.endsWith('.gradio.live')
    );
  } catch {
    return false;
  }
}

function extractGradioMediaUrl(payload: unknown, extraAllowedHost?: string): string | null {
  if (!payload) return null;
  if (typeof payload === 'string') {
    return isAllowedMediaUrl(payload, extraAllowedHost) ? payload : null;
  }
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = extractGradioMediaUrl(item, extraAllowedHost);
      if (found) return found;
    }
    return null;
  }
  if (typeof payload === 'object') {
    const rec = payload as Record<string, unknown>;
    if (typeof rec.url === 'string' && isAllowedMediaUrl(rec.url, extraAllowedHost)) {
      return rec.url;
    }
    if (rec.video) {
      const v = extractGradioMediaUrl(rec.video, extraAllowedHost);
      if (v) return v;
    }
    if (rec.image) {
      const im = extractGradioMediaUrl(rec.image, extraAllowedHost);
      if (im) return im;
    }
    for (const val of Object.values(rec)) {
      const found = extractGradioMediaUrl(val, extraAllowedHost);
      if (found) return found;
    }
  }
  return null;
}

function detectBase64ImageMime(base64Str: string): string {
  if (base64Str.startsWith('iVBOR')) return 'image/png';
  if (base64Str.startsWith('UklGR')) return 'image/webp';
  return 'image/jpeg';
}

function detectImageBufferMime(buf: Buffer, headerContentType = ''): string | null {
  const cleanHeader = headerContentType.split(';')[0]?.trim().toLowerCase() ?? '';
  if (cleanHeader.startsWith('image/')) {
    return cleanHeader;
  }
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return 'image/png';
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

function parseAspectRatioNumeric(aspectRatio: string): number {
  if (aspectRatio === '9:16') return 9 / 16;
  if (aspectRatio === '1:1') return 1;
  if (aspectRatio === '21:9') return 21 / 9;
  return 16 / 9;
}

function isDimensionsMatchingRatio(
  width: number,
  height: number,
  aspectRatio: string,
  tolerance = 0.025
): boolean {
  if (!width || !height) return false;
  const target = parseAspectRatioNumeric(aspectRatio);
  const actual = width / height;
  return Math.abs(actual - target) <= tolerance * target;
}

function getImageBufferDimensions(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 24) return null;
  // PNG IHDR
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    if (width > 0 && height > 0) return { width, height };
  }
  // WEBP
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') {
    const chunk = buf.subarray(12, 16).toString('ascii');
    if (chunk === 'VP8X' && buf.length >= 30) {
      const width = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
      const height = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
      if (width > 0 && height > 0) return { width, height };
    } else if (chunk === 'VP8L' && buf.length >= 25) {
      const b0 = buf[21];
      const b1 = buf[22];
      const b2 = buf[23];
      const b3 = buf[24];
      const width = 1 + (((b1 & 0x3f) << 8) | b0);
      const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
      if (width > 0 && height > 0) return { width, height };
    } else if (chunk === 'VP8 ' && buf.length >= 30) {
      const width = buf.readUInt16LE(26) & 0x3fff;
      const height = buf.readUInt16LE(28) & 0x3fff;
      if (width > 0 && height > 0) return { width, height };
    }
  }
  // JPEG SOFn
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let offset = 2;
    while (offset + 8 < buf.length) {
      if (buf[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = buf[offset + 1];
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
        offset += 2;
        continue;
      }
      if (offset + 4 >= buf.length) break;
      const segLen = buf.readUInt16BE(offset + 2);
      if (segLen < 2) break;
      const isSof =
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf);
      if (isSof && offset + 9 < buf.length) {
        const height = buf.readUInt16BE(offset + 5);
        const width = buf.readUInt16BE(offset + 7);
        if (width > 0 && height > 0) return { width, height };
      }
      offset += 2 + segLen;
    }
  }
  return null;
}

async function getImageBufferDimensionsReliable(
  buf: Buffer,
  extHint = 'bin'
): Promise<{ width: number; height: number } | null> {
  const fast = getImageBufferDimensions(buf);
  if (fast) return fast;
  const tmpFile = path.join(os.tmpdir(), `ahi-img-${crypto.randomUUID()}.${extHint}`);
  try {
    await fs.promises.writeFile(tmpFile, buf);
    const { stdout } = await execFileAsync('ffprobe', [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=width,height',
      '-of',
      'json',
      tmpFile,
    ]);
    const parsed = JSON.parse(stdout) as { streams?: Array<{ width?: number; height?: number }> };
    const st = parsed.streams?.[0];
    if (st?.width && st?.height) {
      return { width: st.width, height: st.height };
    }
  } catch {
    // ignore ffprobe fallback failure
  } finally {
    await fs.promises.unlink(tmpFile).catch(() => {});
  }
  return null;
}

async function snapImageBufferWithFfmpeg(
  buf: Buffer,
  targetW: number,
  targetH: number
): Promise<{ buffer: Buffer; mimeType: string; width: number; height: number } | null> {
  const id = crypto.randomUUID();
  const inFile = path.join(os.tmpdir(), `ahi-snap-in-${id}.img`);
  const outFile = path.join(os.tmpdir(), `ahi-snap-out-${id}.png`);
  try {
    await fs.promises.writeFile(inFile, buf);
    await execFileAsync('ffmpeg', [
      '-y',
      '-i',
      inFile,
      '-vf',
      `scale=${targetW}:${targetH}:flags=lanczos:force_original_aspect_ratio=increase,crop=${targetW}:${targetH}`,
      '-frames:v',
      '1',
      outFile,
    ]);
    const outBuf = await fs.promises.readFile(outFile);
    const dims = getImageBufferDimensions(outBuf) ?? { width: targetW, height: targetH };
    return {
      buffer: outBuf,
      mimeType: 'image/png',
      width: dims.width,
      height: dims.height,
    };
  } catch {
    return null;
  } finally {
    await fs.promises.unlink(inFile).catch(() => {});
    await fs.promises.unlink(outFile).catch(() => {});
  }
}

async function prepareNeutralStudioCanvasServer(
  buf: Buffer,
  mimeType: string,
  targetW: number,
  targetH: number
): Promise<{ buffer: Buffer; mimeType: string }> {
  const id = crypto.randomUUID();
  const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
  const inFile = path.join(os.tmpdir(), `ahi-prep-in-${id}.${ext}`);
  const outFile = path.join(os.tmpdir(), `ahi-prep-out-${id}.png`);
  const fgMaxW = Math.round(targetW * 0.92);
  const fgMaxH = Math.round(targetH * 0.92);
  try {
    await fs.promises.writeFile(inFile, buf);
    await execFileAsync('ffmpeg', [
      '-y',
      '-f',
      'lavfi',
      '-i',
      `color=c=#E8ECF2:s=${targetW}x${targetH}:d=1`,
      '-i',
      inFile,
      '-filter_complex',
      `[1:v]scale=${fgMaxW}:${fgMaxH}:force_original_aspect_ratio=decrease[fg];[0:v][fg]overlay=(W-w)/2:(H-h)/2`,
      '-frames:v',
      '1',
      outFile,
    ]);
    const outBuf = await fs.promises.readFile(outFile);
    if (outBuf.length > 128) {
      return { buffer: outBuf, mimeType: 'image/png' };
    }
  } catch {
    // fallback to original buffer if ffmpeg composite fails
  } finally {
    await fs.promises.unlink(inFile).catch(() => {});
    await fs.promises.unlink(outFile).catch(() => {});
  }
  return { buffer: buf, mimeType };
}

async function composeGuaranteedFallbackSceneFrame(options: {
  aspectRatio: string;
  referenceBuffer?: Buffer;
  referenceMimeType?: string;
}): Promise<string> {
  const targetDims =
    options.aspectRatio === '9:16'
      ? { w: 720, h: 1280 }
      : options.aspectRatio === '1:1'
      ? { w: 1024, h: 1024 }
      : options.aspectRatio === '21:9'
      ? { w: 1344, h: 576 }
      : { w: 1280, h: 720 };

  const id = crypto.randomUUID();
  const outFile = path.join(os.tmpdir(), `ahi-t3-frame-${id}.png`);
  let inFile: string | null = null;
  try {
    if (options.referenceBuffer) {
      const mime = options.referenceMimeType || 'image/png';
      const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
      inFile = path.join(os.tmpdir(), `ahi-t3-ref-${id}.${ext}`);
      await fs.promises.writeFile(inFile, options.referenceBuffer);
      const fgMaxW = Math.round(targetDims.w * 0.94);
      const fgMaxH = Math.round(targetDims.h * 0.94);
      await execFileAsync('ffmpeg', [
        '-y',
        '-i',
        inFile,
        '-filter_complex',
        `[0:v]scale=${targetDims.w}:${targetDims.h}:force_original_aspect_ratio=increase,crop=${targetDims.w}:${targetDims.h},gblur=sigma=32,eq=brightness=-0.08:saturation=1.15[bg];[0:v]scale=${fgMaxW}:${fgMaxH}:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2`,
        '-frames:v',
        '1',
        outFile,
      ]);
    } else {
      await execFileAsync('ffmpeg', [
        '-y',
        '-f',
        'lavfi',
        '-i',
        `gradients=s=${targetDims.w}x${targetDims.h}:c0=#0F172A:c1=#1E293B:c2=#134E4A:c3=#312E81:d=1:speed=0`,
        '-frames:v',
        '1',
        outFile,
      ]).catch(async () => {
        await execFileAsync('ffmpeg', [
          '-y',
          '-f',
          'lavfi',
          '-i',
          `color=c=#0F172A:s=${targetDims.w}x${targetDims.h}:d=1`,
          '-frames:v',
          '1',
          outFile,
        ]);
      });
    }
    const buf = await fs.promises.readFile(outFile);
    if (buf.length > 128) {
      return `data:image/png;base64,${buf.toString('base64')}`;
    }
  } finally {
    if (inFile) await fs.promises.unlink(inFile).catch(() => {});
    await fs.promises.unlink(outFile).catch(() => {});
  }
  throw new Error('Could not prepare fallback scene frame.');
}

async function outpaintBufferWithHfSpace(
  buf: Buffer,
  mimeType: string,
  aspectRatio: string,
  prompt: string
): Promise<{ buffer: Buffer; mimeType: string; width: number; height: number } | null> {
  const outpaintDims = CLOUDFLARE_DIMENSIONS_BY_RATIO[aspectRatio] ?? CLOUDFLARE_DIMENSIONS_BY_RATIO['16:9'];
  try {
    const blob = new Blob([new Uint8Array(buf)], { type: mimeType });
    const client = await withTimeout(
      Client.connect('fffiloni/diffusers-image-outpaint', getHfGradioOptions()),
      12000,
      'Outpaint Space connection timed out.'
    );
    const pred = await withTimeout(
      client.predict('/infer', {
        image: handle_file(blob),
        width: outpaintDims.w,
        height: outpaintDims.h,
        overlap_percentage: 10,
        num_inference_steps: 12,
        resize_option: 'Full',
        custom_resize_percentage: 50,
        prompt_input: prompt.slice(0, 320),
        alignment: 'Middle',
        overlap_left: true,
        overlap_right: true,
        overlap_top: true,
        overlap_bottom: true,
      }),
      32000,
      'Outpaint Space inference timed out.'
    );
    const outUrl = extractGradioMediaUrl(pred.data);
    if (!outUrl) return null;
    const imgRes = await withTimeout(
      fetch(outUrl, { headers: getHfAuthHeadersForUrl(outUrl) }),
      15000,
      'Outpaint Space image download timed out.'
    );
    if (!imgRes.ok) return null;
    const outBuf = Buffer.from(await imgRes.arrayBuffer());
    const outMime = detectImageBufferMime(outBuf, imgRes.headers.get('content-type') || '') || 'image/png';
    const dims = await getImageBufferDimensionsReliable(outBuf);
    if (!dims) return null;
    return { buffer: outBuf, mimeType: outMime, width: dims.width, height: dims.height };
  } catch {
    return null;
  }
}

async function enforceServerImageAspectRatio(
  imageDataUrl: string,
  aspectRatio: string,
  prompt: string,
  targetOverrideDims?: { w: number; h: number }
): Promise<{ imageDataUrl: string; width: number; height: number }> {
  const resolved = resolveImageInputToBuffer(imageDataUrl);
  if (!resolved) {
    throw new Error('Could not decode generated image buffer.');
  }
  const targetDims =
    targetOverrideDims ?? IMAGE_DIMENSIONS_BY_RATIO[aspectRatio] ?? IMAGE_DIMENSIONS_BY_RATIO['16:9'];
  const actualDims = await getImageBufferDimensionsReliable(resolved.buffer);
  if (!actualDims) {
    return { imageDataUrl, width: targetDims.w, height: targetDims.h };
  }

  if (isDimensionsMatchingRatio(actualDims.width, actualDims.height, aspectRatio, 0.015)) {
    if (actualDims.width < targetDims.w * 0.9 || actualDims.height < targetDims.h * 0.9) {
      const upscaled = await snapImageBufferWithFfmpeg(resolved.buffer, targetDims.w, targetDims.h);
      if (upscaled) {
        return {
          imageDataUrl: `data:${upscaled.mimeType};base64,${upscaled.buffer.toString('base64')}`,
          width: upscaled.width,
          height: upscaled.height,
        };
      }
    }
    return { imageDataUrl, width: actualDims.width, height: actualDims.height };
  }

  const targetRatio = parseAspectRatioNumeric(aspectRatio);
  const actualRatio = actualDims.width / actualDims.height;
  const sameOrientation =
    aspectRatio === '1:1' || (targetRatio > 1 && actualRatio > 1) || (targetRatio < 1 && actualRatio < 1);
  const relDelta = Math.abs(actualRatio - targetRatio) / targetRatio;

  if (sameOrientation && relDelta <= 0.18) {
    const snapped = await snapImageBufferWithFfmpeg(resolved.buffer, targetDims.w, targetDims.h);
    if (snapped) {
      return {
        imageDataUrl: `data:${snapped.mimeType};base64,${snapped.buffer.toString('base64')}`,
        width: snapped.width,
        height: snapped.height,
      };
    }
  }

  const outpainted = await outpaintBufferWithHfSpace(
    resolved.buffer,
    resolved.mimeType,
    aspectRatio,
    prompt
  );
  if (outpainted && isDimensionsMatchingRatio(outpainted.width, outpainted.height, aspectRatio, 0.08)) {
    if (
      !isDimensionsMatchingRatio(outpainted.width, outpainted.height, aspectRatio, 0.015) ||
      outpainted.width < targetDims.w * 0.9
    ) {
      const snapped = await snapImageBufferWithFfmpeg(outpainted.buffer, targetDims.w, targetDims.h);
      if (snapped) {
        return {
          imageDataUrl: `data:${snapped.mimeType};base64,${snapped.buffer.toString('base64')}`,
          width: snapped.width,
          height: snapped.height,
        };
      }
    }
    return {
      imageDataUrl: `data:${outpainted.mimeType};base64,${outpainted.buffer.toString('base64')}`,
      width: outpainted.width,
      height: outpainted.height,
    };
  }

  throw new Error(
    `Generated image dimensions ${actualDims.width}x${actualDims.height} do not match requested ${aspectRatio}.`
  );
}

async function inspectAndNormalizeVideoBuffer(
  buf: Buffer,
  aspectRatio: string
): Promise<{ buffer: Buffer; mimeType: string; width: number; height: number }> {
  const id = crypto.randomUUID();
  const inFile = path.join(os.tmpdir(), `ahi-vid-in-${id}.mp4`);
  const outFile = path.join(os.tmpdir(), `ahi-vid-out-${id}.mp4`);
  const targetDims = VIDEO_DIMENSIONS_BY_RATIO[aspectRatio] ?? VIDEO_DIMENSIONS_BY_RATIO['16:9'];
  const targetRatio = parseAspectRatioNumeric(aspectRatio);

  try {
    await fs.promises.writeFile(inFile, buf);
    const { stdout } = await execFileAsync('ffprobe', [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=width,height',
      '-of',
      'json',
      inFile,
    ]);
    const parsed = JSON.parse(stdout) as { streams?: Array<{ width?: number; height?: number }> };
    const streamInfo = parsed.streams?.[0];
    const width = Number(streamInfo?.width ?? 0);
    const height = Number(streamInfo?.height ?? 0);

    if (!width || !height) {
      return { buffer: buf, mimeType: 'video/mp4', width: targetDims.w, height: targetDims.h };
    }

    if (isDimensionsMatchingRatio(width, height, aspectRatio, 0.025)) {
      return { buffer: buf, mimeType: 'video/mp4', width, height };
    }

    const actualRatio = width / height;
    const sameOrientation =
      aspectRatio === '1:1' ||
      (targetRatio > 1 && actualRatio > 1) ||
      (targetRatio < 1 && actualRatio < 1);
    const relDelta = Math.abs(actualRatio - targetRatio) / targetRatio;

    if (!sameOrientation) {
      throw new Error(
        `Video node returned ${width}x${height} (${actualRatio > 1 ? 'landscape' : 'portrait'}) instead of requested ${aspectRatio}.`
      );
    }

    if (relDelta <= 0.22) {
      await execFileAsync('ffmpeg', [
        '-y',
        '-i',
        inFile,
        '-vf',
        `scale=${targetDims.w}:${targetDims.h}:force_original_aspect_ratio=increase,crop=${targetDims.w}:${targetDims.h}`,
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '18',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        '-c:a',
        'copy',
        outFile,
      ]);
      const normalizedBuf = await fs.promises.readFile(outFile);
      if (normalizedBuf.length > 256) {
        return {
          buffer: normalizedBuf,
          mimeType: 'video/mp4',
          width: targetDims.w,
          height: targetDims.h,
        };
      }
    }

    throw new Error(`Video aspect ratio ${width}x${height} deviated too far from ${aspectRatio}.`);
  } finally {
    await fs.promises.unlink(inFile).catch(() => {});
    await fs.promises.unlink(outFile).catch(() => {});
  }
}

async function tryHuggingFaceInferenceRouterVideo(options: {
  prompt: string;
  aspectRatio: string;
  hfToken: string;
  startImageBuffer?: Buffer;
  startImageMime?: string;
}): Promise<{ buffer: Buffer; mimeType: string; width: number; height: number; modelUsed: string } | null> {
  const { prompt, aspectRatio, hfToken, startImageBuffer, startImageMime } = options;
  const targetDims = VIDEO_DIMENSIONS_BY_RATIO[aspectRatio] ?? VIDEO_DIMENSIONS_BY_RATIO['16:9'];
  const models = startImageBuffer
    ? ['Wan-AI/Wan2.2-I2V-A14B', 'Wan-AI/Wan2.1-I2V-14B-480P', 'Lightricks/LTX-Video']
    : ['Wan-AI/Wan2.2-T2V-A14B', 'Lightricks/LTX-Video', 'zai-org/CogVideoX-5b'];

  for (const modelId of models) {
    const endpoints = [`https://router.huggingface.co/hf-inference/models/${modelId}`];
    for (const url of endpoints) {
      for (let retry = 0; retry < 2; retry++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 22000);
        try {
          const payloadBody = startImageBuffer
            ? JSON.stringify({
                inputs: `data:${startImageMime || 'image/png'};base64,${startImageBuffer.toString('base64')}`,
                parameters: {
                  prompt: prompt.slice(0, 1200),
                  width: targetDims.w,
                  height: targetDims.h,
                  num_frames: 49,
                },
                options: { wait_for_model: true },
              })
            : JSON.stringify({
                inputs: prompt.slice(0, 1200),
                parameters: {
                  width: targetDims.w,
                  height: targetDims.h,
                  num_frames: 49,
                },
                options: { wait_for_model: true },
              });

          const res = await fetch(url, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${hfToken}`,
              'Content-Type': 'application/json',
              Accept: 'video/mp4',
            },
            body: payloadBody,
            signal: controller.signal,
          });

          if (res.status === 503 && retry === 0) {
            await new Promise((r) => setTimeout(r, 1500));
            continue;
          }
          if (!res.ok) {
            break;
          }

          const ct = (res.headers.get('content-type') || '').toLowerCase();
          const rawBuf = Buffer.from(await res.arrayBuffer());
          const looksLikeVideo =
            ct.startsWith('video/') ||
            ct.includes('octet-stream') ||
            (rawBuf.length > 4096 && rawBuf.subarray(4, 8).toString('ascii') === 'ftyp');
          if (!looksLikeVideo) {
            break;
          }

          const verified = await inspectAndNormalizeVideoBuffer(rawBuf, aspectRatio);
          return {
            buffer: verified.buffer,
            mimeType: verified.mimeType || 'video/mp4',
            width: verified.width,
            height: verified.height,
            modelUsed: modelId,
          };
        } catch {
          if (retry === 0) continue;
        } finally {
          clearTimeout(timer);
        }
      }
    }
  }
  return null;
}

async function renderServerCinemaMotionMp4(options: {
  imageDataUrl: string;
  aspectRatio: string;
  cameraMotion?: string;
  audioDataUrl?: string;
  durationSeconds?: number;
}): Promise<{ buffer: Buffer; mimeType: string; width: number; height: number }> {
  const resolvedImg = resolveImageInputToBuffer(options.imageDataUrl);
  if (!resolvedImg) {
    throw new Error('Could not decode scene image for motion compilation.');
  }

  const targetDims =
    options.aspectRatio === '9:16'
      ? { w: 720, h: 1280 }
      : options.aspectRatio === '1:1'
      ? { w: 1024, h: 1024 }
      : options.aspectRatio === '21:9'
      ? { w: 1344, h: 576 }
      : { w: 1280, h: 720 };

  const durationSec = Math.max(3, Math.min(8, options.durationSeconds ?? 5));
  const fps = 24;
  const totalFrames = Math.round(durationSec * fps);
  const id = crypto.randomUUID();
  const imgExt = resolvedImg.mimeType.includes('png')
    ? 'png'
    : resolvedImg.mimeType.includes('webp')
    ? 'webp'
    : 'jpg';
  const imgFile = path.join(os.tmpdir(), `ahi-cm-in-${id}.${imgExt}`);
  const outFile = path.join(os.tmpdir(), `ahi-cm-out-${id}.mp4`);
  let audioFile: string | null = null;

  try {
    await fs.promises.writeFile(imgFile, resolvedImg.buffer);

    if (options.audioDataUrl) {
      const audioBlob = resolveAudioBase64ToBlob(options.audioDataUrl);
      if (audioBlob) {
        audioFile = path.join(os.tmpdir(), `ahi-cm-aud-${id}.wav`);
        await fs.promises.writeFile(audioFile, Buffer.from(await audioBlob.arrayBuffer()));
      }
    }

    const motion = options.cameraMotion || 'Slow Dolly In';
    const upW = targetDims.w * 2;
    const upH = targetDims.h * 2;
    let zoomExpr = `1.0+0.10*on/${totalFrames}`;
    let xExpr = `iw/2-(iw/zoom/2)`;
    let yExpr = `ih/2-(ih/zoom/2)`;

    if (motion === 'Slow Dolly Out') {
      zoomExpr = `1.12-0.10*on/${totalFrames}`;
    } else if (motion === 'Pan Left') {
      zoomExpr = `1.10`;
      xExpr = `(iw-iw/zoom)*(1-on/${totalFrames})`;
    } else if (motion === 'Pan Right') {
      zoomExpr = `1.10`;
      xExpr = `(iw-iw/zoom)*(on/${totalFrames})`;
    } else if (motion === 'Crane Up') {
      zoomExpr = `1.08`;
      yExpr = `(ih-ih/zoom)*(1-on/${totalFrames})`;
    }

    const vf = [
      `scale=${upW}:${upH}:force_original_aspect_ratio=increase`,
      `crop=${upW}:${upH}`,
      `zoompan=z='${zoomExpr}':x='${xExpr}':y='${yExpr}':d=${totalFrames}:fps=${fps}:s=${targetDims.w}x${targetDims.h}`,
    ].join(',');

    const args = [
      '-y',
      '-loop',
      '1',
      '-i',
      imgFile,
      ...(audioFile ? ['-i', audioFile] : []),
      '-vf',
      vf,
      '-t',
      String(durationSec),
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '20',
      '-pix_fmt',
      'yuv420p',
      ...(audioFile ? ['-c:a', 'aac', '-b:a', '128k', '-shortest'] : []),
      '-movflags',
      '+faststart',
      outFile,
    ];

    await execFileAsync('ffmpeg', args);
    const outBuf = await fs.promises.readFile(outFile);
    return {
      buffer: outBuf,
      mimeType: 'video/mp4',
      width: targetDims.w,
      height: targetDims.h,
    };
  } finally {
    await fs.promises.unlink(imgFile).catch(() => {});
    await fs.promises.unlink(outFile).catch(() => {});
    if (audioFile) await fs.promises.unlink(audioFile).catch(() => {});
  }
}

async function runCloudflareFluxImage(
  fullPrompt: string,
  aspectRatio: string,
  accountId: string,
  apiToken: string,
  referenceImage?: { buffer: Buffer; mimeType: string },
  quality: ImageQualityTier = 'high'
): Promise<{
  imageDataUrl: string;
  modelUsed: string;
  elapsedMs: number;
  width: number;
  height: number;
}> {
  const started = Date.now();
  const cfDims = CLOUDFLARE_DIMENSIONS_BY_RATIO[aspectRatio] ?? CLOUDFLARE_DIMENSIONS_BY_RATIO['16:9'];
  const isWarmStorybook = fullPrompt.includes('Pro-Mist 1/2');
  const ratioCue =
    aspectRatio === '1:1'
      ? ''
      : aspectRatio === '9:16'
      ? ', vertical 9:16 portrait composition, full character uncropped'
      : aspectRatio === '21:9'
      ? ', ultra-wide 21:9 anamorphic framing, expanded full-scene environment'
      : isWarmStorybook
      ? ''
      : ', wide 16:9 landscape cinema composition, expanded full-scene environment';
  const promptText = `${fullPrompt}${ratioCue}`.slice(0, 2000);

  const parseCloudflareResponse = async (
    cfRes: Response,
    modelId: string
  ): Promise<{
    imageDataUrl: string;
    modelUsed: string;
    elapsedMs: number;
    width: number;
    height: number;
  }> => {
    const contentType = cfRes.headers.get('content-type') || '';
    if (!cfRes.ok) {
      const errBody = await cfRes.text().catch(() => '');
      const isQuota =
        cfRes.status === 429 ||
        cfRes.status === 402 ||
        /limit|quota|rate|neurons|exceeded|daily/i.test(errBody);
      throw new Error(
        isQuota
          ? 'Cloudflare Workers AI daily free limit reached'
          : `Cloudflare (${modelId}) HTTP ${cfRes.status}${errBody ? `: ${errBody.slice(0, 140)}` : ''}`
      );
    }

    const rawBuf = Buffer.from(await cfRes.arrayBuffer());
    const binaryMime = detectImageBufferMime(rawBuf, contentType);
    if (binaryMime && rawBuf.length > 64) {
      return {
        imageDataUrl: `data:${binaryMime};base64,${rawBuf.toString('base64')}`,
        modelUsed: modelId,
        elapsedMs: Date.now() - started,
        width: cfDims.w,
        height: cfDims.h,
      };
    }

    let json: {
      success?: boolean;
      errors?: Array<{ message?: string }>;
      result?: { image?: string };
      image?: string;
    };
    try {
      json = JSON.parse(rawBuf.toString('utf-8')) as typeof json;
    } catch {
      throw new Error(`Unexpected non-image response from Cloudflare (${modelId})`);
    }

    const rawImage = json.result?.image ?? json.image;
    if (!rawImage || json.success === false) {
      const errMsg = json.errors?.[0]?.message || `Empty response from Cloudflare (${modelId})`;
      throw new Error(errMsg);
    }

    const imageDataUrl = rawImage.startsWith('data:image/')
      ? rawImage
      : `data:${detectBase64ImageMime(rawImage)};base64,${rawImage}`;
    return {
      imageDataUrl,
      modelUsed: modelId,
      elapsedMs: Date.now() - started,
      width: cfDims.w,
      height: cfDims.h,
    };
  };

  let lastErr = 'Cloudflare Workers AI image models unavailable';

  // 1. Try FLUX.2 models via multipart/form-data (supports explicit width/height + optional input_image_0 reference)
  const flux2Models: Array<{ id: string; steps: number; timeoutMs: number }> =
    quality === 'standard'
      ? [
          { id: '@cf/black-forest-labs/flux-2-klein-9b', steps: 4, timeoutMs: 28000 },
          { id: '@cf/black-forest-labs/flux-2-klein-4b', steps: 4, timeoutMs: 25000 },
          { id: '@cf/black-forest-labs/flux-2-dev', steps: 8, timeoutMs: 45000 },
        ]
      : quality === 'ultra'
      ? [
          { id: '@cf/black-forest-labs/flux-2-dev', steps: 22, timeoutMs: 75000 },
          { id: '@cf/black-forest-labs/flux-2-klein-9b', steps: 8, timeoutMs: 32000 },
          { id: '@cf/black-forest-labs/flux-2-klein-4b', steps: 6, timeoutMs: 28000 },
        ]
      : [
          { id: '@cf/black-forest-labs/flux-2-dev', steps: 12, timeoutMs: 65000 },
          { id: '@cf/black-forest-labs/flux-2-klein-9b', steps: 4, timeoutMs: 28000 },
          { id: '@cf/black-forest-labs/flux-2-klein-4b', steps: 4, timeoutMs: 28000 },
        ];

  const runFlux2Attempt = async (
    m: { id: string; steps: number; timeoutMs: number },
    withRef: boolean
  ) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), m.timeoutMs);
    try {
      const form = new FormData();
      form.append('prompt', promptText);
      form.append('width', String(cfDims.w));
      form.append('height', String(cfDims.h));
      form.append('steps', String(m.steps));
      if (withRef && referenceImage) {
        const ext = referenceImage.mimeType.includes('png') ? 'png' : 'jpg';
        form.append(
          'input_image_0',
          new Blob([new Uint8Array(referenceImage.buffer)], { type: referenceImage.mimeType }),
          `reference.${ext}`
        );
      }

      const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(
        accountId
      )}/ai/run/${m.id}`;
      const cfRes = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiToken}` },
        body: form,
        signal: controller.signal,
      });
      return await parseCloudflareResponse(cfRes, m.id);
    } finally {
      clearTimeout(timer);
    }
  };

  for (const m of flux2Models) {
    try {
      return await runFlux2Attempt(m, Boolean(referenceImage));
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
      console.warn(`[CloudflareFlux] ${m.id} (ref=${Boolean(referenceImage)}) failed: ${lastErr}`);
      if (/daily free limit/i.test(lastErr)) throw new Error(lastErr);
      if (referenceImage) {
        try {
          return await runFlux2Attempt(m, false);
        } catch (retryErr) {
          lastErr = retryErr instanceof Error ? retryErr.message : String(retryErr);
          console.warn(`[CloudflareFlux] ${m.id} (text-only retry) failed: ${lastErr}`);
          if (/daily free limit/i.test(lastErr)) throw new Error(lastErr);
        }
      }
    }
  }

  // 2. Try JSON models that support explicit width & height
  const jsonSteps = quality === 'ultra' ? 24 : quality === 'standard' ? 12 : 20;
  const jsonModels: Array<{ id: string; body: Record<string, unknown> }> = [
    {
      id: '@cf/leonardo/lucid-origin',
      body: { prompt: promptText, width: cfDims.w, height: cfDims.h, steps: jsonSteps },
    },
    {
      id: '@cf/leonardo/phoenix-1.0',
      body: { prompt: promptText, width: cfDims.w, height: cfDims.h, num_steps: jsonSteps },
    },
    {
      id: '@cf/stabilityai/stable-diffusion-xl-base-1.0',
      body: { prompt: promptText, width: cfDims.w, height: cfDims.h, num_steps: jsonSteps },
    },
  ];

  // flux-1-schnell on Cloudflare strictly outputs 1024x1024 and rejects width/height properties
  if (aspectRatio === '1:1') {
    jsonModels.push({
      id: '@cf/black-forest-labs/flux-1-schnell',
      body: { prompt: promptText, steps: quality === 'standard' ? 4 : 8 },
    });
  }

  for (const m of jsonModels) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(
        accountId
      )}/ai/run/${m.id}`;
      const cfRes = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(m.body),
        signal: controller.signal,
      });
      return await parseCloudflareResponse(cfRes, m.id);
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
      console.warn(`[CloudflareJson] ${m.id} failed: ${lastErr}`);
      if (/daily free limit/i.test(lastErr)) throw new Error(lastErr);
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error(lastErr);
}

async function runDirectHuggingFaceImage(
  fullPrompt: string,
  dims: { w: number; h: number },
  _useSdxl: boolean,
  hfToken: string
): Promise<{ imageDataUrl: string; modelUsed: string; elapsedMs: number }> {
  const started = Date.now();
  // Active models supported on HF Inference Router (hf-inference)
  const models = [
    'stabilityai/stable-diffusion-3-medium-diffusers',
  ];

  // Clamp SD3 dims cleanly to multiples of 64 within 1024px budget
  const round64 = (n: number) => Math.max(512, Math.min(1024, Math.round(n / 64) * 64));
  const reqW = round64(dims.w);
  const reqH = round64(dims.h);

  let lastErr = 'Hugging Face Inference API unavailable';
  for (const modelId of models) {
    const url = `https://router.huggingface.co/hf-inference/models/${modelId}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 32000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${hfToken}`,
          'Content-Type': 'application/json',
          Accept: 'image/png',
        },
        body: JSON.stringify({
          inputs: fullPrompt.slice(0, 1200),
          parameters: {
            width: reqW,
            height: reqH,
            num_inference_steps: 24,
            guidance_scale: 5.5,
          },
          options: { wait_for_model: true },
        }),
        signal: controller.signal,
      });

      const rawBuf = Buffer.from(await res.arrayBuffer());
      if (!res.ok) {
        const textErr = rawBuf.toString('utf-8').slice(0, 220);
        lastErr = `Hugging Face (${modelId}) HTTP ${res.status}${textErr ? `: ${textErr}` : ''}`;
        continue;
      }

      const mime = detectImageBufferMime(rawBuf, res.headers.get('content-type') || '');
      if (mime && rawBuf.length > 64) {
        return {
          imageDataUrl: `data:${mime};base64,${rawBuf.toString('base64')}`,
          modelUsed: modelId,
          elapsedMs: Date.now() - started,
        };
      }

      lastErr = `Hugging Face (${modelId}) returned non-image payload`;
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error(lastErr);
}

function resolveImageInputToBuffer(
  imageInput: string
): { buffer: Buffer; mimeType: string } | null {
  if (imageInput.startsWith('data:image/')) {
    const match = imageInput.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
    if (!match) return null;
    const buffer = Buffer.from(match[2], 'base64');
    return { buffer, mimeType: match[1] };
  }
  if (imageInput.startsWith('/src/assets/images/')) {
    const fileName = imageInput.slice('/src/assets/images/'.length);
    const candidateDirs = [
      path.resolve(process.cwd(), 'src/assets/images'),
      path.resolve(process.cwd(), 'dist/src/assets/images'),
    ];
    for (const assetsDir of candidateDirs) {
      const resolved = path.resolve(assetsDir, fileName);
      if (resolved.startsWith(assetsDir + path.sep) && fs.existsSync(resolved)) {
        const buffer = fs.readFileSync(resolved);
        const ext = path.extname(resolved).toLowerCase();
        const mimeType =
          ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
        return { buffer, mimeType };
      }
    }
  }
  return null;
}

function resolveImageInputToBlob(imageInput: string): Blob | null {
  const resolved = resolveImageInputToBuffer(imageInput);
  if (!resolved) return null;
  return new Blob([new Uint8Array(resolved.buffer)], { type: resolved.mimeType });
}

interface NormalizedReferenceInput {
  imageUrl: string;
  role: string;
  label: string;
  description: string;
  buffer: Buffer;
  mimeType: string;
}

function expandPlainEnglishCameraDirections(rawPrompt: string): string {
  const lower = rawPrompt.toLowerCase();
  const hints: string[] = [];
  if (/(back|behind).*(front|face)|(front).*(back|behind)/i.test(lower)) {
    hints.push(
      'smooth 180-degree camera orbit starting behind the subject and sweeping smoothly around to the front, maintaining consistent character features and lighting'
    );
  } else if (/orbit|360|around/i.test(lower)) {
    hints.push('fluid orbital camera arc moving smoothly around the subject with consistent lighting');
  } else if (/zoom in|close.?up|push in/i.test(lower)) {
    hints.push('smooth cinematic dolly push-in toward the focal subject');
  } else if (/zoom out|pull back/i.test(lower)) {
    hints.push('gradual cinematic pull-back revealing the full surrounding environment');
  }
  return hints.length > 0 ? `${rawPrompt.trim()}. Cinematography: ${hints.join('; ')}` : rawPrompt.trim();
}

async function enhanceCinemaVideoPrompt(options: {
  basePrompt: string;
  refs: NormalizedReferenceInput[];
  style: string;
  cameraMotion: string;
  animateExactFrame: boolean;
}): Promise<{ enhancedPrompt: string; useExactStartFrame: boolean }> {
  const { basePrompt, refs, style, cameraMotion, animateExactFrame } = options;
  const trimmedPrompt = basePrompt.trim();

  const metadataSummary = refs
    .map(
      (r, idx) =>
        `Ref ${idx + 1} (${r.role}${r.label ? ` - ${r.label}` : ''})${
          r.description ? `: ${r.description}` : ''
        }`
    )
    .join('; ');

  const isWarmStorybook = style === 'Warm Storybook 3D';
  const expandedFallback = expandPlainEnglishCameraDirections(trimmedPrompt);
  const fallbackWithRefs =
    refs.length > 0
      ? `${expandedFallback}. Visual identity & environment details: ${metadataSummary}`
      : expandedFallback;
  const fallbackPrompt = isWarmStorybook
    ? `${fallbackWithRefs.slice(0, 520)}. ${WARM_STORYBOOK_3D_FRAMING}. ${WARM_STORYBOOK_3D_MODIFIERS}`
    : fallbackWithRefs;

  const allowExactSingleFrame = Boolean(animateExactFrame && refs.length === 1);

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return {
      enhancedPrompt: fallbackPrompt,
      useExactStartFrame: allowExactSingleFrame,
    };
  }

  const ai = getGeminiClient();
  const parts: Array<{ inlineData: { mimeType: string; data: string } } | { text: string }> = [];

  for (let i = 0; i < refs.length; i++) {
    const ref = refs[i];
    parts.push({
      text: `Reference Image ${i + 1} | Type: ${ref.role} | Label: ${ref.label || `Ref ${i + 1}`}${
        ref.description ? ` | Notes: ${ref.description}` : ''
      }`,
    });
    parts.push({
      inlineData: {
        mimeType: ref.mimeType,
        data: ref.buffer.toString('base64'),
      },
    });
  }

  parts.push({
    text: [
      `User's Written Video Prompt (PRIMARY AUTHORITY — preserve EVERY action, character, prop, and camera path): "${trimmedPrompt}"`,
      `Visual Style: ${style}`,
      cameraMotion && cameraMotion !== 'Auto' && cameraMotion !== 'Static'
        ? `Optional Camera Dropdown Hint (only use if user wrote no camera movement): ${cameraMotion}`
        : `Camera Mode: Purely follow the user's written prompt`,
      `Instructions (Smart Cinematography & Acting Director):`,
      `1. Expand the user's plain-English camera & acting directions into rich 3D animation direction prompts.`,
      isWarmStorybook
        ? `2. MANDATORY WARM STORYBOOK 3D LOOK: Compose as a ${WARM_STORYBOOK_3D_FRAMING}. Specify soft-focus vintage cinema lens, dreamy halation, warm sunlit bloom, gentle Pro-Mist 1/2 diffusion, low micro-contrast, soft pastel matte clay and felt textures, slightly blurred soft edges, warm overexposed sunlit sky in background, and 35mm film softness. Strictly avoid razor-sharp focus, ultra-detailed pores, sharp fabric lines, high-contrast HDR, glossy studio lighting, or close-up portraits.`
        : style === 'Enchanted Storybook'
        ? `2. MANDATORY ENCHANTED STORYBOOK LOOK: Build a rich fairy-tale woodland atmosphere with ${ENCHANTED_STORYBOOK_DIRECTIVES}. Frame deep layered foreground wildflowers/ferns/mushrooms beneath mossy ancient canopies, glowing fireflies, and golden volumetric sunbeams.`
        : style === '3D Pixar-Style Cartoon' || style === '3D Cartoon'
        ? `2. MANDATORY FEATURE-FILM 3D ANIMATION BENCHMARK: Specify sculpted stylized expressive faces with natural proportions, warm subsurface skin shading with amber bounce light, detailed corneal eye catchlights, sculpted eyebrows/eyelashes/hair braids, PBR fabric weaves and brushed metallic accents, cinematic global illumination, soft ambient occlusion, shallow depth-of-field bokeh, smooth natural body acting, and theatrical color grading (NOT photorealistic, NOT flat cartoon, NOT plastic glossy AI skin).`
        : `2. Specify cinema depth-of-field, expressive facial/eye acting, rich material shaders, warm rim lighting, and smooth continuous camera trajectories.`,
      `3. Keep EVERY detail, action, subject, and angle the user wrote intact — never override or soften their camera trajectory.`,
      refs.length > 0
        ? `4. Treat ALL ${refs.length} uploaded reference image(s) strictly as visual identity, character, outfit, prop, and environment/style references—NEVER copy original framing or background unchanged unless requested. Preserve EVERY character's exact face, hairstyle, skin tone/fur, body proportions, clothing, colors, and signature accessories directly inside the text description.`
        : isWarmStorybook
        ? `4. Build warm golden sunlit atmosphere, layered foreground/midground/background depth, gentle natural character interaction, and dreamy halation matching Warm Storybook 3D.`
        : `4. Add rich lighting, motion continuity, and atmospheric clarity matching the ${style} aesthetic.`,
      `5. Set canStartFromSingleImageFrame to true ONLY if there is 1 reference image AND the user's prompt starts directly from that exact composition without requesting a different starting angle.`,
    ].join('\n'),
  });

  const modelsToTry: Array<{ model: string; useThinkingLow: boolean }> = [
    { model: 'gemini-4-hydrogen', useThinkingLow: true },
    { model: 'gemini-3.1-flash-lite', useThinkingLow: false },
  ];

  for (const candidate of modelsToTry) {
    try {
      const response = await withTimeout(
        ai.models.generateContent({
          model: candidate.model,
          contents: { parts },
          config: {
            systemInstruction: isWarmStorybook
              ? 'You are a Smart 3D Cinematography & Acting Director specializing in dreamy handcrafted Warm Storybook 3D animation. Always frame shots as wide 16:9 candid full-scene movie frames with foreground and background layers in sunlit environments (never close-up portraits), using soft-focus vintage cinema lenses, Pro-Mist 1/2 halation, low micro-contrast, and soft pastel matte clay/felt textures while strictly avoiding razor-sharp focus, ultra-detailed pores, sharp fabric lines, high-contrast HDR, or glossy studio lighting.'
              : 'You are a Smart Feature-Film 3D Cinematography & Acting Director for AI video generators (Wan 2.2, LTX-Video, CogVideoX). Preserve 100% of the user prompt intent while weaving visual identity details from all reference images and theatrical 3D feature animation lighting/material polish into one cohesive prompt.',
            ...(candidate.useThinkingLow
              ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
              : {}),
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                enhancedPrompt: {
                  type: Type.STRING,
                  description:
                    'One cohesive, production-ready video prompt (90-150 words) preserving all user actions and expanded cinematography instructions plus exact visual details from any reference images.',
                },
                canStartFromSingleImageFrame: {
                  type: Type.BOOLEAN,
                  description:
                    'True only when 1 reference image is meant to be animated directly from Frame 1 without conflicting camera origin.',
                },
              },
              required: ['enhancedPrompt', 'canStartFromSingleImageFrame'],
            },
          },
        }),
        12000,
        'Smart cinema prompt enhancement timed out.'
      );

      const parsed = JSON.parse((response.text ?? '{}').trim()) as {
        enhancedPrompt?: string;
        canStartFromSingleImageFrame?: boolean;
      };
      const enhanced = String(parsed.enhancedPrompt ?? '').trim().replace(/\s+/g, ' ');
      if (enhanced.length >= 16) {
        return {
          enhancedPrompt: enhanced.slice(0, 820),
          useExactStartFrame:
            allowExactSingleFrame && Boolean(parsed.canStartFromSingleImageFrame),
        };
      }
    } catch (err) {
      console.warn(
        `[CinemaPromptEnhancer] ${candidate.model} unavailable:`,
        err instanceof Error ? err.message.slice(0, 160) : String(err)
      );
    }
  }

  return {
    enhancedPrompt: fallbackPrompt,
    useExactStartFrame: allowExactSingleFrame,
  };
}

function resolveAudioBase64ToBlob(audioBase64: string): Blob | null {
  try {
    let mimeType = 'audio/wav';
    let raw = audioBase64.trim();
    const dataMatch = raw.match(/^data:(audio\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (dataMatch) {
      mimeType = dataMatch[1];
      raw = dataMatch[2];
    } else if (raw.includes(',')) {
      raw = raw.split(',')[1];
    }
    if (!raw || raw.length < 32) return null;
    const buf = Buffer.from(raw, 'base64');
    return new Blob([buf], { type: mimeType });
  } catch {
    return null;
  }
}

async function buildTalkingSceneCompositingPrompt(options: {
  characterBuffer: { buffer: Buffer; mimeType: string };
  characterLabel?: string;
  coStarCharacters?: Array<{
    buffer: { buffer: Buffer; mimeType: string };
    label: string;
  }>;
  shotAngle?: TalkingShotAngle;
  backgroundBuffer?: { buffer: Buffer; mimeType: string } | null;
  backgroundPrompt?: string;
  actionPrompt?: string;
  style: string;
}): Promise<string> {
  const {
    characterBuffer,
    characterLabel,
    coStarCharacters = [],
    shotAngle = 'close-up',
    backgroundBuffer,
    backgroundPrompt,
    actionPrompt,
    style,
  } = options;

  const isWarmStorybook = style === 'Warm Storybook 3D';
  const shotFramingDirective = isWarmStorybook
    ? `Wide 16:9 candid full-scene movie frame with foreground and background layers showing ${
        characterLabel || 'the active speaker'
      }${
        coStarCharacters.length > 0
          ? ` interacting naturally alongside ${coStarCharacters.map((c) => c.label).join(' and ')}`
          : ''
      } inside a warm sunlit environment rather than a sharp close-up portrait, with ${
        characterLabel || 'the active speaker'
      }'s face gently turned toward camera and unobstructed for natural lip-sync`
    : shotAngle === 'two-shot' && coStarCharacters.length > 0
    ? `Wide medium two-shot showing ${characterLabel || 'the active speaker'} alongside ${coStarCharacters
        .map((c) => c.label)
        .join(' and ')} together inside the same environment; position ${
        characterLabel || 'the active speaker'
      } clearly angled toward the camera with sharp eyes and unobstructed mouth while the listener turns attentively toward them`
    : shotAngle === 'over-shoulder' && coStarCharacters.length > 0
    ? `Cinema over-the-shoulder reverse shot from behind ${
        coStarCharacters[0]?.label || 'the listener'
      }'s soft-focus foreground shoulder, looking directly at ${
        characterLabel || 'the active speaker'
      }'s crisp, brightly lit face facing the camera in sharp focus`
    : `Sharp medium close-up talking portrait of ${
        characterLabel || 'the active speaker'
      } facing toward the camera with head and shoulders clearly visible, unobstructed face and lips, shallow depth of field`;

  const fallbackComposite = isWarmStorybook
    ? [
        shotFramingDirective,
        actionPrompt?.trim() ? actionPrompt.trim() : 'interacting warmly and naturally while speaking',
        backgroundPrompt?.trim()
          ? `set inside ${backgroundPrompt.trim()}`
          : 'placed naturally inside a sunlit layered environment with warm overexposed sky in background',
        WARM_STORYBOOK_3D_MODIFIERS,
      ].join(', ')
    : [
        shotFramingDirective,
        actionPrompt?.trim() ? actionPrompt.trim() : 'warmly expressive while speaking',
        backgroundPrompt?.trim()
          ? `set inside ${backgroundPrompt.trim()}`
          : 'placed seamlessly inside the matching background environment with cohesive studio lighting',
        `${style}, consistent character identity, crisp facial clarity for lip-sync`,
      ].join(', ');

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return fallbackComposite;

  const ai = getGeminiClient();
  const parts: Array<{ inlineData: { mimeType: string; data: string } } | { text: string }> = [
    {
      text: `ACTIVE SPEAKING CHARACTER (${characterLabel || 'Speaker'}):`,
    },
    {
      inlineData: {
        mimeType: characterBuffer.mimeType,
        data: characterBuffer.buffer.toString('base64'),
      },
    },
  ];

  if (shotAngle !== 'close-up' && coStarCharacters.length > 0) {
    for (let i = 0; i < Math.min(2, coStarCharacters.length); i++) {
      const co = coStarCharacters[i];
      parts.push({ text: `CONVERSATION PARTNER ${i + 1} (${co.label}):` });
      parts.push({
        inlineData: {
          mimeType: co.buffer.mimeType,
          data: co.buffer.buffer.toString('base64'),
        },
      });
    }
  }

  if (backgroundBuffer) {
    parts.push({ text: 'SHARED BACKGROUND ENVIRONMENT IMAGE:' });
    parts.push({
      inlineData: {
        mimeType: backgroundBuffer.mimeType,
        data: backgroundBuffer.buffer.toString('base64'),
      },
    });
  }

  parts.push({
    text: [
      `Create ONE vivid image generation prompt (80-130 words) that seamlessly composites the ACTIVE SPEAKING CHARACTER into the shared scene.`,
      `Shot Angle Directive: ${shotFramingDirective}`,
      backgroundBuffer
        ? `Match the exact background architecture, props, sky, lighting direction, and color temperature from the SHARED BACKGROUND ENVIRONMENT IMAGE.`
        : backgroundPrompt?.trim()
        ? `Background Setting: ${backgroundPrompt.trim()}`
        : `Background Setting: ${
            isWarmStorybook
              ? 'Warm sunlit outdoor/storybook environment with layered depth and overexposed sky'
              : 'Cinematic atmospheric studio matching the scene'
          }`,
      `Visual Style: ${style}`,
      `Action / Expression / Camera Direction: ${
        actionPrompt?.trim() || 'speaks warmly with natural expressive face'
      }`,
      isWarmStorybook
        ? `LIGHTING & TEXTURE RULE: Use ${WARM_STORYBOOK_3D_MODIFIERS}`
        : `LIGHTING & SHADOW RULE: Seamlessly composite the character(s) into the background with matching 3D rim-lighting, warm ambient bounce, and grounded contact shadows.`,
      isWarmStorybook
        ? `CRITICAL LIP-SYNC RULE: Keep the ACTIVE SPEAKING CHARACTER naturally visible and unobstructed in the wide candid scene so lip-sync can animate their mouth, without reverting to a tight razor-sharp close-up portrait.`
        : `CRITICAL LIP-SYNC RULE: Keep ONLY the ACTIVE SPEAKING CHARACTER's face sharp, unobstructed, well-lit, and oriented toward the camera so portrait lip-sync animates their mouth cleanly.`,
      `Preserve EVERY visual identity detail. Output plain prompt text only.`,
    ].join('\n'),
  });

  for (const model of ['gemini-4-hydrogen', 'gemini-3.1-flash-lite']) {
    try {
      const response = await withTimeout(
        ai.models.generateContent({
          model,
          contents: { parts },
          config: {
            systemInstruction: isWarmStorybook
              ? 'You are a lead visual compositing supervisor for Warm Storybook 3D animated films. Write one clean Flux/SDXL prompt composing a wide 16:9 candid full-scene frame with foreground and background layers in a sunlit environment, using soft-focus vintage cinema lens, Pro-Mist 1/2 halation, low micro-contrast, and soft pastel matte clay/felt textures.'
              : 'You are a lead visual compositing and cinema shot-reverse-shot supervisor. Write one clean Flux/SDXL image prompt blending the speaker(s) into the shared background with matching 3D rim-lighting, contact shadows, and sharp speaker facial framing.',
          },
        }),
        12000,
        'Compositing prompt analysis timed out.'
      );
      const text = (response.text ?? '').trim().replace(/^["']|["']$/g, '').replace(/\s+/g, ' ');
      if (text.length >= 24) {
        return text.slice(0, 780);
      }
    } catch {
      // try next model
    }
  }

  return fallbackComposite;
}

async function synthesizeTalkingVoiceAudio(
  dialogue: string,
  voicePreset: TalkingVoicePreset,
  lockedProfile?: {
    voiceName?: string;
    voiceStyle?: string;
    voicePitch?: number;
    voiceSpeed?: number;
  }
): Promise<{ audioBase64: string; mimeType: string; voiceLabel: string }> {
  const spec = TALKING_VOICE_MAP[voicePreset] ?? TALKING_VOICE_MAP.female;
  const chosenVoice =
    lockedProfile?.voiceName &&
    ALLOWED_VOICES.includes(lockedProfile.voiceName as (typeof ALLOWED_VOICES)[number])
      ? (lockedProfile.voiceName as (typeof ALLOWED_VOICES)[number])
      : spec.voiceName;
  const pitchHint =
    typeof lockedProfile?.voicePitch === 'number' && lockedProfile.voicePitch !== 1
      ? lockedProfile.voicePitch > 1.06
        ? ', slightly higher youthful pitch'
        : lockedProfile.voicePitch < 0.94
        ? ', slightly deeper warm pitch'
        : ''
      : '';
  const speedHint =
    typeof lockedProfile?.voiceSpeed === 'number' && lockedProfile.voiceSpeed !== 1
      ? lockedProfile.voiceSpeed > 1.06
        ? ', brisk energetic pacing'
        : lockedProfile.voiceSpeed < 0.94
        ? ', calm measured pacing'
        : ''
      : '';
  const combinedStyle = `${lockedProfile?.voiceStyle?.trim() || spec.styleInstruction}${pitchHint}${speedHint}`.slice(
    0,
    240
  );
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (apiKey) {
    try {
      const ai = getGeminiClient();
      const response = await withTimeout(
        ai.models.generateContent({
          model: 'gemini-3.8-flash-lite-tts',
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: dialogue.trim().slice(0, 1200),
                  speechMetadata: {
                    style: combinedStyle,
                  },
                },
              ],
            },
          ],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: chosenVoice },
              },
            },
          },
        }),
        18000,
        'Voice synthesis timed out.'
      );

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        return {
          audioBase64: base64Audio,
          mimeType: 'audio/wav',
          voiceLabel: chosenVoice,
        };
      }
    } catch (err) {
      console.warn(
        '[TalkingSceneTTS] Gemini TTS unavailable, trying open-source HF TTS:',
        err instanceof Error ? err.message.slice(0, 140) : String(err)
      );
    }
  }

  const ttsCandidates = ['ResembleAI/Chatterbox', 'myshell-ai/OpenVoiceV2', 'suno/bark'];
  for (const spaceId of ttsCandidates) {
    try {
      const client = await withTimeout(
        Client.connect(spaceId, getHfGradioOptions()),
        10000,
        'HF TTS connect timed out.'
      );
      const api = await withTimeout(client.view_api(), 6000, 'HF TTS API timed out.');
      const keys = Object.keys(api.named_endpoints ?? {});
      const endpoint = keys[0] ?? 0;
      const epInfo =
        typeof endpoint === 'string' ? api.named_endpoints?.[endpoint] : api.unnamed_endpoints?.[0];
      const payload: Record<string, unknown> = {};
      for (const p of epInfo?.parameters ?? []) {
        const name = p.parameter_name;
        if (!name) continue;
        const lower = name.toLowerCase();
        if (lower.includes('text') || lower.includes('prompt')) {
          payload[name] = dialogue.trim().slice(0, 400);
        } else if (p.parameter_has_default) {
          payload[name] = p.parameter_default;
        }
      }
      const res = await withTimeout(
        client.predict(
          endpoint,
          Object.keys(payload).length > 0 ? payload : [dialogue.trim().slice(0, 400)]
        ),
        25000,
        'HF TTS predict timed out.'
      );
      const audioUrl = extractGradioMediaUrl(res.data);
      if (audioUrl) {
        const audioRes = await fetch(audioUrl, { headers: getHfAuthHeadersForUrl(audioUrl) });
        if (audioRes.ok) {
          const buf = Buffer.from(await audioRes.arrayBuffer());
          return {
            audioBase64: buf.toString('base64'),
            mimeType: audioRes.headers.get('content-type') || 'audio/wav',
            voiceLabel: spaceId,
          };
        }
      }
    } catch {
      // try next TTS space
    }
  }

  throw new Error(
    'Could not synthesize spoken audio right now. Try uploading or recording your own voice clip in the Dialogue slot.'
  );
}

interface ImageGenResult {
  imageDataUrl: string;
  spaceUsed: string;
  modelLabel: string;
  quality: ImageQualityTier;
  nodeLabel: string;
  provider: 'cloudflare' | 'colab-turbo' | 'huggingface';
  elapsedMs: number;
  translatedPrompt: string;
  width: number;
  height: number;
}

async function tryGradioImageEndpoint(
  target: string,
  nodeLabel: string,
  fullPrompt: string,
  dims: { w: number; h: number },
  useSdxl: boolean,
  aspectRatio = '16:9',
  extraAllowedHost?: string,
  quality: ImageQualityTier = 'high'
): Promise<{ imageDataUrl: string }> {
  const clientOptions = extraAllowedHost ? undefined : getHfGradioOptions();
  const client = await withTimeout(
    Client.connect(target, clientOptions),
    12000,
    `${nodeLabel} connection timed out.`
  );
  const api = await withTimeout(
    client.view_api(),
    8000,
    `${nodeLabel} API inspection timed out.`
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

  const returnsMeta = epInfo?.returns ?? [];
  if (
    extraAllowedHost &&
    returnsMeta.some((r) => /video/i.test(String(r.component))) &&
    !returnsMeta.some((r) => /image/i.test(String(r.component)))
  ) {
    throw new Error('Colab GPU node is configured for video generation.');
  }

  const paramsMeta = epInfo?.parameters ?? [];
  const requiresImageInput = paramsMeta.some(
    (p) =>
      !p.parameter_has_default &&
      ((p.component && /image/i.test(String(p.component))) ||
        (p.parameter_name && /input_image|first_frame|image_path|image/i.test(p.parameter_name)))
  );
  if (requiresImageInput) {
    throw new Error(`${nodeLabel} requires an input image.`);
  }

  const isFlux1Dev = target === 'black-forest-labs/FLUX.1-dev';
  const isFlux2Klein = /FLUX\.2-klein/i.test(target);
  const isQwenImage = /Qwen\/Qwen-Image/i.test(target);
  const isTurboOrSd = target.includes('stable-diffusion-3.5') || target.includes('prodia');
  const isWarmStorybook = fullPrompt.includes('Pro-Mist 1/2');
  const effectiveDims = isFlux1Dev
    ? FLUX1_DEV_DIMENSIONS_BY_RATIO[aspectRatio] ?? { w: 1024, h: 576 }
    : FLUX2_DIMENSIONS_BY_RATIO[aspectRatio] ?? { w: 1024, h: 576 };
  const payload: Record<string, unknown> = {};

  for (const p of paramsMeta) {
    const name = p.parameter_name;
    if (!name || name === 'null') continue;
    const lower = name.toLowerCase();
    if (
      (lower === 'prompt' || lower === 'positive_prompt' || lower === 'text') &&
      !lower.includes('negative')
    ) {
      payload[name] = fullPrompt;
    } else if (lower.includes('negative')) {
      payload[name] = isWarmStorybook
        ? WARM_STORYBOOK_3D_NEGATIVE_PROMPT
        : 'photorealistic photo, flat 2d cartoon, plastic glossy skin, text, watermark, signature, blurry, stretched, letterbox bars, artifacts';
    } else if (lower === 'randomize_seed') {
      payload[name] = true;
    } else if (lower === 'aspect_ratio') {
      payload[name] = aspectRatio === '21:9' ? '16:9' : aspectRatio;
    } else if (lower === 'prompt_enhance' || lower === 'prompt_upsampling') {
      payload[name] = true;
    } else if (lower === 'mode_choice') {
      payload[name] = quality === 'ultra' ? 'High (8 steps)' : 'Distilled (4 steps)';
    } else if (lower === 'width') {
      payload[name] = effectiveDims.w;
    } else if (lower === 'height') {
      payload[name] = effectiveDims.h;
    } else if (lower === 'num_inference_steps' || lower === 'steps') {
      payload[name] = isFlux1Dev
        ? quality === 'ultra'
          ? 34
          : quality === 'standard'
          ? 20
          : 28
        : isFlux2Klein
        ? quality === 'ultra'
          ? 8
          : 4
        : isQwenImage
        ? quality === 'ultra'
          ? 40
          : quality === 'standard'
          ? 24
          : 32
        : isTurboOrSd
        ? quality === 'ultra'
          ? 12
          : 8
        : useSdxl
        ? quality === 'ultra'
          ? 30
          : quality === 'standard'
          ? 18
          : 25
        : 4;
    } else if (lower === 'guidance_scale' || lower === 'cfg' || lower === 'cfg_scale') {
      payload[name] = isFlux1Dev
        ? 3.5
        : isFlux2Klein
        ? 1
        : isQwenImage
        ? 4
        : isTurboOrSd
        ? 1.5
        : useSdxl
        ? 7
        : 0;
    } else if (p.parameter_has_default) {
      payload[name] = p.parameter_default;
    } else {
      payload[name] = null;
    }
  }

  const result = await withTimeout(
    client.predict(endpoint, Object.keys(payload).length > 0 ? payload : [fullPrompt]),
    isFlux1Dev || isQwenImage ? 45000 : 32000,
    `${nodeLabel} queue timeout reached.`
  );

  const mediaUrl = extractGradioMediaUrl(result.data, extraAllowedHost);
  if (!mediaUrl) {
    throw new Error(`${nodeLabel} did not return a valid image URL.`);
  }

  const imgRes = await withTimeout(
    fetch(mediaUrl, {
      headers: extraAllowedHost ? undefined : getHfAuthHeadersForUrl(mediaUrl),
    }),
    15000,
    `${nodeLabel} image download timed out.`
  );
  if (!imgRes.ok) {
    throw new Error(`Failed to download image from ${nodeLabel}.`);
  }

  const contentType = imgRes.headers.get('content-type') || 'image/webp';
  const buf = Buffer.from(await imgRes.arrayBuffer());
  return {
    imageDataUrl: `data:${contentType};base64,${buf.toString('base64')}`,
  };
}

async function removeBackgroundServer(
  imageInput: string
): Promise<{ imageDataUrl: string; spaceUsed: string }> {
  const resolved = resolveImageInputToBuffer(imageInput);
  if (!resolved) {
    throw new Error('Could not read image for background removal.');
  }

  const blob = new Blob([new Uint8Array(resolved.buffer)], { type: resolved.mimeType });
  const hfToken = getHfToken();
  let lastError = 'Background removal services are temporarily busy.';

  if (hfToken) {
    for (const modelId of ['briaai/RMBG-1.4', 'ZhengPeng7/BiRefNet']) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 16000);
      try {
        const res = await fetch(`https://router.huggingface.co/hf-inference/models/${modelId}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${hfToken}`,
            'Content-Type': resolved.mimeType,
          },
          body: new Uint8Array(resolved.buffer),
          signal: controller.signal,
        });
        if (res.ok) {
          const outBuf = Buffer.from(await res.arrayBuffer());
          const mime = detectImageBufferMime(outBuf, res.headers.get('content-type') || '');
          if (mime && outBuf.length > 128) {
            return {
              imageDataUrl: `data:${mime};base64,${outBuf.toString('base64')}`,
              spaceUsed: modelId,
            };
          }
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      } finally {
        clearTimeout(timer);
      }
    }
  }

  const clientOptions = getHfGradioOptions();
  for (const spaceId of BACKGROUND_REMOVAL_SPACES) {
    try {
      const client = await withTimeout(
        Client.connect(spaceId, clientOptions),
        12000,
        `${spaceId} connection timed out.`
      );
      let endpoint: string = '/image';
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

      const pred = await withTimeout(
        client.predict(endpoint, args),
        28000,
        `${spaceId} background removal timed out.`
      );
      const outUrl = extractGradioMediaUrl(pred.data);
      if (!outUrl) continue;

      const imgRes = await withTimeout(
        fetch(outUrl, { headers: getHfAuthHeadersForUrl(outUrl) }),
        15000,
        `${spaceId} image download timed out.`
      );
      if (!imgRes.ok) continue;
      const outBuf = Buffer.from(await imgRes.arrayBuffer());
      const mime = detectImageBufferMime(outBuf, imgRes.headers.get('content-type') || '') || 'image/png';
      return {
        imageDataUrl: `data:${mime};base64,${outBuf.toString('base64')}`,
        spaceUsed: spaceId,
      };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  throw new Error(lastError);
}

async function enhanceCinemaImagePrompt(options: {
  basePrompt: string;
  refs: NormalizedReferenceInput[];
  style: string;
  aspectRatio: string;
  removeBackground: boolean;
}): Promise<{ editPrompt: string; generationPrompt: string }> {
  const { basePrompt, refs, style, aspectRatio, removeBackground } = options;
  const trimmedPrompt = basePrompt.trim();
  const isWarmStorybook = style === 'Warm Storybook 3D';
  const styleCue = STYLE_PROMPT_DIRECTIVES[style] ?? `${style} visual aesthetic`;

  const metadataSummary = refs
    .map(
      (r, idx) =>
        `Ref ${idx + 1} (${r.role}${r.label ? ` - ${r.label}` : ''})${
          r.description ? `: ${r.description}` : ''
        }`
    )
    .join('; ');

  const bgDirective = removeBackground
    ? 'Completely replace the original studio or uploaded background with the new requested environment filling the entire frame edge-to-edge.'
    : 'Generate and expand the full requested environment cleanly around the character(s).';

  const fallbackGenPrompt = isWarmStorybook
    ? `${trimmedPrompt}${metadataSummary ? `. Character identity & details: ${metadataSummary}` : ''}. Full uncropped character(s) properly proportioned inside wide ${aspectRatio} frame, ${bgDirective} ${WARM_STORYBOOK_3D_FRAMING}, ${WARM_STORYBOOK_3D_MODIFIERS}`
    : `${trimmedPrompt}${metadataSummary ? `. Character identity & details: ${metadataSummary}` : ''}. Full uncropped character(s) (head, body, clothing, and accessories completely visible and unstretched) placed naturally in ${aspectRatio} composition. ${bgDirective} Style: ${styleCue}, no text, no watermark`;

  const fallbackEditPrompt =
    `Using the exact character appearance from the input image (preserving face, hairstyle, skin tone, body proportions, clothing, colors, and accessories without cropping or stretching), ` +
    `render the scene in full ${aspectRatio} composition: ${trimmedPrompt}. ` +
    `${bgDirective} Do not reproduce the original photo background or empty margins; generate the full surrounding environment in ${style} style.`;

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || refs.length === 0) {
    return { editPrompt: fallbackEditPrompt, generationPrompt: fallbackGenPrompt };
  }

  const ai = getGeminiClient();
  const parts: Array<{ inlineData: { mimeType: string; data: string } } | { text: string }> = [];
  for (let i = 0; i < refs.length; i++) {
    const r = refs[i];
    parts.push({
      text: `Reference Image ${i + 1} | Role: ${r.role} | Name: ${r.label}${
        r.description ? ` | Notes: ${r.description}` : ''
      }`,
    });
    parts.push({
      inlineData: {
        mimeType: r.mimeType,
        data: r.buffer.toString('base64'),
      },
    });
  }

  parts.push({
    text: [
      `USER PROMPT (PRIMARY AUTHORITY — controls scene, environment, actions, pose, camera angle, lighting, and composition): "${trimmedPrompt}"`,
      `Target Output Aspect Ratio: ${aspectRatio}`,
      `Visual Style: ${style}`,
      style === '3D Pixar-Style Cartoon' || style === '3D Cartoon'
        ? `Visual Quality Benchmark: ${PREMIUM_3D_ANIMATION_BENCHMARK}`
        : style === 'Enchanted Storybook'
        ? `Visual Quality Benchmark: ${ENCHANTED_STORYBOOK_DIRECTIVES}`
        : '',
      `Remove Original Background: ${removeBackground ? 'YES — completely replace original background' : 'NO — seamlessly expand/adapt scene to prompt'}`,
      `RULES:`,
      `1. The uploaded reference image(s) ONLY define character/subject identity and visual appearance (face, hairstyle, skin tone/fur, body proportions, exact clothing, colors, and accessories). NEVER reproduce the reference image unchanged or copy its background/framing.`,
      `2. The USER PROMPT controls 100% of the scene, environment, character actions/pose, camera angle, lighting, and composition.`,
      `3. Preserve EVERY character's entire body cleanly (head, body, clothing, accessories) properly positioned and proportioned inside the full edge-to-edge ${aspectRatio} canvas — synthesize the full surrounding environment across ${aspectRatio} with zero stretching, zero cropping, and zero blank/blurred side margins.`,
      `4. Describe each attached character's exact visual identity in rich detail so their face, hair/braids, eyes, skin tone/fur, outfit, and accessories remain faithful.`,
    ]
      .filter(Boolean)
      .join('\n'),
  });

  for (const model of ['gemini-4-hydrogen', 'gemini-3.1-flash-lite']) {
    try {
      const response = await withTimeout(
        ai.models.generateContent({
          model,
          contents: { parts },
          config: {
            systemInstruction:
              'You are a lead visual development & character-consistency director. Extract exact character identity details from reference images and fuse them with the user prompt to produce two prompts: editPrompt (for image-to-image reference editors) and generationPrompt (standalone self-contained prompt).',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                editPrompt: {
                  type: Type.STRING,
                  description:
                    '70-110 word prompt for Flux Kontext / Flux 2 / Qwen-Image-Edit telling the editor to keep the exact character identity from the input image while posing them in the new scene, camera angle, lighting, and replacing/expanding the background across the full target aspect ratio with no sidebars.',
                },
                generationPrompt: {
                  type: Type.STRING,
                  description:
                    '100-150 word standalone Flux/SDXL visual prompt containing hyper-specific character details (face, hair, skin tone, proportions, outfit, colors, accessories) placed inside the exact user-requested scene, action, camera angle, lighting, and target aspect ratio.',
                },
              },
              required: ['editPrompt', 'generationPrompt'],
            },
          },
        }),
        11000,
        'Image reference prompt analysis timed out.'
      );

      const parsed = JSON.parse((response.text ?? '{}').trim()) as {
        editPrompt?: string;
        generationPrompt?: string;
      };
      const editPrompt = String(parsed.editPrompt ?? '').trim().replace(/\s+/g, ' ');
      const generationPrompt = String(parsed.generationPrompt ?? '').trim().replace(/\s+/g, ' ');
      if (editPrompt.length >= 24 && generationPrompt.length >= 24) {
        return {
          editPrompt: editPrompt.slice(0, 820),
          generationPrompt: generationPrompt.slice(0, 920),
        };
      }
    } catch {
      // Try next model
    }
  }

  return { editPrompt: fallbackEditPrompt, generationPrompt: fallbackGenPrompt };
}

async function tryReferenceEditSpaces(
  spaceId: string,
  inputImageDataUrl: string,
  editPrompt: string,
  aspectRatio: string,
  timeoutMs: number
): Promise<{ imageDataUrl: string }> {
  const resolved = resolveImageInputToBuffer(inputImageDataUrl);
  if (!resolved) {
    throw new Error('Could not decode prepared reference canvas.');
  }
  const blob = new Blob([new Uint8Array(resolved.buffer)], { type: resolved.mimeType });
  const client = await withTimeout(
    Client.connect(spaceId, getHfGradioOptions()),
    11000,
    `${spaceId} connection timed out.`
  );

  let endpoint = '/infer';
  let payload: Record<string, unknown>;
  if (spaceId === 'black-forest-labs/FLUX.2-klein-9B') {
    endpoint = '/generate';
    const f2Dims = FLUX2_DIMENSIONS_BY_RATIO[aspectRatio] ?? FLUX2_DIMENSIONS_BY_RATIO['16:9'];
    payload = {
      prompt: editPrompt,
      input_images: [{ image: handle_file(blob) }],
      mode_choice: 'Distilled (4 steps)',
      seed: 0,
      randomize_seed: true,
      width: f2Dims.w,
      height: f2Dims.h,
      num_inference_steps: 4,
      guidance_scale: 1,
      prompt_upsampling: true,
    };
  } else if (spaceId === 'black-forest-labs/FLUX.2-dev') {
    const f2Dims = FLUX2_DIMENSIONS_BY_RATIO[aspectRatio] ?? FLUX2_DIMENSIONS_BY_RATIO['16:9'];
    payload = {
      prompt: editPrompt,
      input_images: [{ image: handle_file(blob) }],
      seed: 0,
      randomize_seed: true,
      width: f2Dims.w,
      height: f2Dims.h,
      num_inference_steps: 26,
      guidance_scale: 4,
      prompt_upsampling: true,
    };
  } else if (spaceId === 'Qwen/Qwen-Image-Edit') {
    payload = {
      image: handle_file(blob),
      prompt: editPrompt,
      seed: 0,
      randomize_seed: true,
      true_guidance_scale: 4,
      num_inference_steps: 28,
      rewrite_prompt: true,
    };
  } else {
    payload = {
      input_image: handle_file(blob),
      prompt: editPrompt,
      seed: 0,
      randomize_seed: true,
      guidance_scale: 3.5,
      steps: 24,
    };
  }

  const effectiveTimeout =
    spaceId === 'black-forest-labs/FLUX.2-dev' || spaceId === 'black-forest-labs/FLUX.2-klein-9B'
      ? Math.min(timeoutMs, 28000)
      : timeoutMs;

  const pred = await withTimeout(
    client.predict(endpoint, payload),
    effectiveTimeout,
    `${spaceId} inference timed out.`
  );
  const outUrl = extractGradioMediaUrl(pred.data);
  if (!outUrl) {
    throw new Error(`${spaceId} did not return a valid image URL.`);
  }
  const imgRes = await withTimeout(
    fetch(outUrl, { headers: getHfAuthHeadersForUrl(outUrl) }),
    15000,
    `${spaceId} image download timed out.`
  );
  if (!imgRes.ok) {
    throw new Error(`Failed to download image from ${spaceId}.`);
  }
  const outBuf = Buffer.from(await imgRes.arrayBuffer());
  const mime = detectImageBufferMime(outBuf, imgRes.headers.get('content-type') || '') || 'image/png';
  return {
    imageDataUrl: `data:${mime};base64,${outBuf.toString('base64')}`,
  };
}

const HORDE_DIMENSIONS_BY_RATIO: Record<string, { w: number; h: number }> = {
  '16:9': { w: 704, h: 384 },
  '9:16': { w: 384, h: 704 },
  '1:1': { w: 576, h: 576 },
  '21:9': { w: 832, h: 384 },
};

let cachedHordeModels: { ts: number; models: string[] } | null = null;
const HORDE_DEFAULT_MODELS = [
  'Dreamshaper',
  'Deliberate',
  'AAM XL',
  'SDXL 1.0',
  '526Mix-Animated',
  'CamelliaMix 2.5D',
  'Hassaku XL',
  'Comic-Diffusion',
  'Quiet Goodnight XL',
  'stable_diffusion',
];

async function getActiveHordeModels(): Promise<string[]> {
  if (cachedHordeModels && Date.now() - cachedHordeModels.ts < 120_000) {
    return cachedHordeModels.models;
  }
  try {
    const res = await withTimeout(
      fetch('https://stablehorde.net/api/v2/status/models?type=image'),
      4500,
      'Horde model check timed out'
    );
    if (res.ok) {
      const list = (await res.json()) as Array<{
        name?: string;
        count?: number;
        eta?: number;
      }>;
      const safe = list
        .filter(
          (m) =>
            typeof m.name === 'string' &&
            (m.count ?? 0) >= 1 &&
            (m.eta ?? 999) <= 180 &&
            !/inpaint|hentai|nsfw|porn|furry|yiff|babes|boob|nud|sex|ntr|pony|fuster/i.test(m.name)
        )
        .sort((a, b) => (a.eta ?? 999) - (b.eta ?? 999) || (b.count ?? 0) - (a.count ?? 0))
        .map((m) => m.name as string);

      const merged = Array.from(new Set([...HORDE_DEFAULT_MODELS.filter((d) => safe.includes(d)), ...safe])).slice(0, 12);
      if (merged.length > 0) {
        cachedHordeModels = { ts: Date.now(), models: merged };
        return merged;
      }
    }
  } catch {
    // Use defaults
  }
  return HORDE_DEFAULT_MODELS;
}

async function runCommunityHordeImage(options: {
  prompt: string;
  aspectRatio: string;
  referenceBuffer?: Buffer;
  referenceMimeType?: string;
  quality?: ImageQualityTier;
}): Promise<{ imageDataUrl: string; modelUsed: string; elapsedMs: number }> {
  const started = Date.now();
  const hordeDims = HORDE_DIMENSIONS_BY_RATIO[options.aspectRatio] ?? HORDE_DIMENSIONS_BY_RATIO['16:9'];
  const hordeKey = process.env.HORDE_API_KEY?.trim() || '0000000000';
  const isAnonKey = hordeKey === '0000000000';
  const isWarmStorybook = options.prompt.includes('Pro-Mist 1/2');
  const negativePrompt = isWarmStorybook
    ? WARM_STORYBOOK_3D_NEGATIVE_PROMPT
    : 'photorealistic photo, flat 2d cartoon, plastic glossy skin, text, watermark, signature, blurry, stretched, cropped, letterbox bars';

  let sourceImageB64: string | undefined;
  if (options.referenceBuffer) {
    const id = crypto.randomUUID();
    const mime = options.referenceMimeType || 'image/png';
    const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
    const inFile = path.join(os.tmpdir(), `ahi-horde-in-${id}.${ext}`);
    const outFile = path.join(os.tmpdir(), `ahi-horde-prep-${id}.webp`);
    const fgMaxW = Math.round(hordeDims.w * 0.9);
    const fgMaxH = Math.round(hordeDims.h * 0.9);
    try {
      await fs.promises.writeFile(inFile, options.referenceBuffer);
      await execFileAsync('ffmpeg', [
        '-y',
        '-f',
        'lavfi',
        '-i',
        `color=c=#E8ECF2:s=${hordeDims.w}x${hordeDims.h}:d=1`,
        '-i',
        inFile,
        '-filter_complex',
        `[1:v]scale=${fgMaxW}:${fgMaxH}:force_original_aspect_ratio=decrease[fg];[0:v][fg]overlay=(W-w)/2:(H-h)/2`,
        '-frames:v',
        '1',
        outFile,
      ]);
      const prepBuf = await fs.promises.readFile(outFile);
      if (prepBuf.length > 128) {
        sourceImageB64 = prepBuf.toString('base64');
      }
    } catch {
      // Fallback to text-to-image if ffmpeg canvas prep fails
    } finally {
      await fs.promises.unlink(inFile).catch(() => {});
      await fs.promises.unlink(outFile).catch(() => {});
    }
  }

  const rawSteps = options.quality === 'ultra' ? 24 : options.quality === 'standard' ? 14 : 18;
  const hordeSteps = isAnonKey ? Math.min(20, rawSteps) : rawSteps;
  const hordeModels = await getActiveHordeModels();
  const reqBody: Record<string, unknown> = {
    prompt: `${options.prompt.slice(0, 900)} ### ${negativePrompt.slice(0, 320)}`,
    params: {
      width: hordeDims.w,
      height: hordeDims.h,
      steps: hordeSteps,
      n: 1,
      cfg_scale: 7,
      sampler_name: 'k_euler_a',
      ...(sourceImageB64 ? { denoising_strength: 0.74 } : {}),
    },
    ...(sourceImageB64 ? { source_image: sourceImageB64, source_processing: 'img2img' } : {}),
    nsfw: false,
    censor_nsfw: true,
    r2: true,
    models: hordeModels,
  };

  const subRes = await withTimeout(
    fetch('https://stablehorde.net/api/v2/generate/async', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: hordeKey,
        'Client-Agent': 'AHIStudio:1.0:studio',
      },
      body: JSON.stringify(reqBody),
    }),
    10000,
    'Community image queue timed out.'
  );
  if (!subRes.ok) {
    throw new Error(`Community image queue unavailable (${subRes.status}).`);
  }
  const subJson = (await subRes.json()) as { id?: string };
  if (!subJson.id) {
    throw new Error('Community image queue did not return a job ID.');
  }

  const jobId = subJson.id;
  for (let i = 0; i < 48; i++) {
    await new Promise((ok) => setTimeout(ok, 3000));
    const chk = await withTimeout(
      fetch(`https://stablehorde.net/api/v2/generate/check/${encodeURIComponent(jobId)}`),
      6000,
      'Status check timed out.'
    );
    if (!chk.ok) continue;
    const st = (await chk.json()) as { done?: boolean; faulted?: boolean; is_possible?: boolean };
    if (st.faulted || st.is_possible === false) {
      throw new Error('Community image worker faulted.');
    }
    if (st.done) {
      const finRes = await withTimeout(
        fetch(`https://stablehorde.net/api/v2/generate/status/${encodeURIComponent(jobId)}`),
        8000,
        'Result fetch timed out.'
      );
      if (!finRes.ok) break;
      const fin = (await finRes.json()) as {
        generations?: Array<{ img?: string; model?: string }>;
      };
      const gen = fin.generations?.[0];
      if (!gen?.img) break;

      let outBuf: Buffer;
      let outMime = 'image/webp';
      if (/^https?:\/\//i.test(gen.img)) {
        const imgRes = await withTimeout(fetch(gen.img), 15000, 'Image download timed out.');
        if (!imgRes.ok) break;
        outBuf = Buffer.from(await imgRes.arrayBuffer());
        outMime = detectImageBufferMime(outBuf, imgRes.headers.get('content-type') || '') || 'image/webp';
      } else {
        outBuf = Buffer.from(gen.img, 'base64');
        outMime = detectImageBufferMime(outBuf, '') || 'image/webp';
      }
      if (outBuf.length < 128) break;
      return {
        imageDataUrl: `data:${outMime};base64,${outBuf.toString('base64')}`,
        modelUsed: gen.model || 'community-sd',
        elapsedMs: Date.now() - started,
      };
    }
  }

  throw new Error('Community image render timed out.');
}

async function runResilientImageGeneration(
  options: {
    prompt: string;
    style: string;
    aspectRatio: string;
    engine: string;
    quality?: ImageQualityTier;
    spaceId?: string;
    colabUrl?: string;
    allowGradioFallback?: boolean;
    imageDataUrl?: string;
    preparedCanvasDataUrl?: string;
    removeBackground?: boolean;
    referenceImages?: Array<{
      imageUrl?: string;
      role?: string;
      label?: string;
      description?: string;
    }>;
  },
  onStatus?: (evt: {
    space: string;
    nodeLabel: string;
    provider: 'cloudflare' | 'colab-turbo' | 'huggingface';
    attempt: number;
    totalAttempts: number;
    progress: number;
    message: string;
    translatedPrompt: string;
  }) => void
): Promise<ImageGenResult> {
  const safeRatio = ALLOWED_RATIOS.includes(options.aspectRatio as (typeof ALLOWED_RATIOS)[number])
    ? options.aspectRatio
    : '16:9';
  const safeQuality: ImageQualityTier = ALLOWED_QUALITIES.includes(
    options.quality as ImageQualityTier
  )
    ? (options.quality as ImageQualityTier)
    : 'high';
  const dims =
    QUALITY_DIMENSIONS_BY_TIER[safeQuality][safeRatio] ??
    IMAGE_DIMENSIONS_BY_RATIO[safeRatio] ??
    IMAGE_DIMENSIONS_BY_RATIO['16:9'];
  const cfDims = CLOUDFLARE_DIMENSIONS_BY_RATIO[safeRatio] ?? CLOUDFLARE_DIMENSIONS_BY_RATIO['16:9'];
  const useSdxl = options.engine === 'sdxl';

  const normalizedRefs: NormalizedReferenceInput[] = [];
  if (Array.isArray(options.referenceImages)) {
    for (let idx = 0; idx < Math.min(8, options.referenceImages.length); idx++) {
      const item = options.referenceImages[idx];
      if (!item || typeof item.imageUrl !== 'string') continue;
      const resolved = resolveImageInputToBuffer(item.imageUrl);
      if (!resolved) continue;
      normalizedRefs.push({
        imageUrl: item.imageUrl,
        role: typeof item.role === 'string' && item.role.trim() ? item.role.trim() : 'Character',
        label:
          typeof item.label === 'string' && item.label.trim()
            ? item.label.trim().slice(0, 80)
            : `Ref ${idx + 1}`,
        description:
          typeof item.description === 'string' ? item.description.trim().slice(0, 420) : '',
        buffer: resolved.buffer,
        mimeType: resolved.mimeType,
      });
    }
  }
  if (normalizedRefs.length === 0 && typeof options.imageDataUrl === 'string') {
    const single = resolveImageInputToBuffer(options.imageDataUrl);
    if (single) {
      normalizedRefs.push({
        imageUrl: options.imageDataUrl,
        role: 'Character',
        label: 'Reference Character',
        description: '',
        buffer: single.buffer,
        mimeType: single.mimeType,
      });
    }
  }

  let effectiveInputCanvasUrl =
    typeof options.preparedCanvasDataUrl === 'string' && options.preparedCanvasDataUrl.startsWith('data:image/')
      ? options.preparedCanvasDataUrl
      : normalizedRefs[0]?.imageUrl;

  if (
    options.removeBackground &&
    normalizedRefs.length > 0 &&
    !options.preparedCanvasDataUrl
  ) {
    try {
      const bgRemoved = await withTimeout(
        removeBackgroundServer(normalizedRefs[0].imageUrl),
        10000,
        'Background segmentation fast-skip'
      );
      effectiveInputCanvasUrl = bgRemoved.imageDataUrl;
      const updatedBuf = resolveImageInputToBuffer(bgRemoved.imageDataUrl);
      if (updatedBuf) {
        normalizedRefs[0].imageUrl = bgRemoved.imageDataUrl;
        normalizedRefs[0].buffer = updatedBuf.buffer;
        normalizedRefs[0].mimeType = updatedBuf.mimeType;
      }
    } catch {
      // Proceed quickly with original reference + prompt-level background replacement
    }
  }

  // Always prepare a neutral target-aspect-ratio canvas on server if client did not provide one
  // and the reference image's native ratio differs from safeRatio (never pass raw 9:16 canvas for 16:9).
  let contextPreparedCanvasUrl = effectiveInputCanvasUrl;
  if (normalizedRefs.length > 0 && !options.preparedCanvasDataUrl && effectiveInputCanvasUrl) {
    const refBufInfo = resolveImageInputToBuffer(effectiveInputCanvasUrl);
    if (refBufInfo) {
      const refDims = await getImageBufferDimensionsReliable(refBufInfo.buffer);
      if (!refDims || !isDimensionsMatchingRatio(refDims.width, refDims.height, safeRatio, 0.03)) {
        const prepped = await prepareNeutralStudioCanvasServer(
          refBufInfo.buffer,
          refBufInfo.mimeType,
          cfDims.w,
          cfDims.h
        );
        contextPreparedCanvasUrl = `data:${prepped.mimeType};base64,${prepped.buffer.toString('base64')}`;
      }
    }
  }

  let fullPrompt = buildTranslatedImagePrompt(options.prompt, options.style);
  let editPrompt = fullPrompt;

  if (normalizedRefs.length > 0) {
    const enhanced = await enhanceCinemaImagePrompt({
      basePrompt: options.prompt,
      refs: normalizedRefs,
      style: options.style,
      aspectRatio: safeRatio,
      removeBackground: Boolean(options.removeBackground),
    });
    editPrompt = buildTranslatedImagePrompt(enhanced.editPrompt, options.style);
    fullPrompt = buildTranslatedImagePrompt(enhanced.generationPrompt, options.style);
  }

  const cfCreds = !useSdxl ? getCloudflareCredentials() : null;
  const hfToken = getHfToken();
  const validColab = validateColabGradioUrl(options.colabUrl);
  const customSpace =
    typeof options.spaceId === 'string' && SPACE_ID_RE.test(options.spaceId.trim())
      ? options.spaceId.trim()
      : null;

  const shouldUseGradioSpaces =
    !process.env.VERCEL || Boolean(customSpace) || Boolean(options.allowGradioFallback);
  const liveSpaces = shouldUseGradioSpaces ? await discoverRunningImageSpaces(useSdxl) : [];
  const orderedLiveSpaces =
    safeQuality === 'ultra' && liveSpaces.includes('black-forest-labs/FLUX.1-dev')
      ? [
          'black-forest-labs/FLUX.1-dev',
          ...liveSpaces.filter((s) => s !== 'black-forest-labs/FLUX.1-dev'),
        ]
      : liveSpaces;
  const hfCandidates = customSpace
    ? [customSpace, ...orderedLiveSpaces.filter((s) => s !== customSpace)]
    : orderedLiveSpaces;
  const maxGradioAttempts =
    process.env.VERCEL && !customSpace
      ? options.allowGradioFallback
        ? Math.min(2, hfCandidates.length)
        : 0
      : hfCandidates.length;

  const tryRefEdit = Boolean(normalizedRefs.length > 0 && effectiveInputCanvasUrl);
  const totalSteps = Math.max(
    1,
    (validColab ? 1 : 0) +
      (tryRefEdit ? REFERENCE_EDIT_SPACES.length : 0) +
      (cfCreds ? 1 : 0) +
      (hfToken ? 1 : 0) +
      maxGradioAttempts
  );
  let stepNum = 0;
  let lastError = `Primary ${useSdxl ? 'SDXL / SD 3.5' : 'Flux'} nodes unavailable`;
  let hfZeroGpuExhausted = false;

  if (validColab) {
    stepNum++;
    const started = Date.now();
    const nodeLabel = 'Colab Turbo GPU (Private Zero-Queue)';
    onStatus?.({
      space: validColab.host,
      nodeLabel,
      provider: 'colab-turbo',
      attempt: stepNum,
      totalAttempts: totalSteps,
      progress: 20,
      translatedPrompt: fullPrompt,
      message: 'Creating your image...',
    });
    try {
      const resImg = await tryGradioImageEndpoint(
        validColab.url,
        nodeLabel,
        fullPrompt,
        dims,
        useSdxl,
        safeRatio,
        validColab.host,
        safeQuality
      );
      const verified = await enforceServerImageAspectRatio(
        resImg.imageDataUrl,
        safeRatio,
        fullPrompt,
        dims
      );
      return {
        imageDataUrl: verified.imageDataUrl,
        spaceUsed: `colab://${validColab.host}`,
        modelLabel: 'Colab Turbo GPU',
        quality: safeQuality,
        nodeLabel,
        provider: 'colab-turbo',
        elapsedMs: Date.now() - started,
        translatedPrompt: fullPrompt,
        width: verified.width,
        height: verified.height,
      };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  // 1. Primary Image Engine: Cloudflare Workers AI FIRST (10,000 free neurons/day, zero ZeroGPU limits)
  if (cfCreds) {
    stepNum++;
    const nodeLabel = 'Cloudflare Workers AI';
    onStatus?.({
      space: '@cf/black-forest-labs/flux-2-dev',
      nodeLabel,
      provider: 'cloudflare',
      attempt: stepNum,
      totalAttempts: totalSteps,
      progress: 42,
      translatedPrompt: fullPrompt,
      message: 'Creating your image...',
    });

    try {
      const cfRes = await runCloudflareFluxImage(
        fullPrompt,
        safeRatio,
        cfCreds.accountId,
        cfCreds.apiToken,
        normalizedRefs[0] ? { buffer: normalizedRefs[0].buffer, mimeType: normalizedRefs[0].mimeType } : undefined,
        safeQuality
      );
      const verified = await enforceServerImageAspectRatio(
        cfRes.imageDataUrl,
        safeRatio,
        fullPrompt,
        dims
      );
      return {
        imageDataUrl: verified.imageDataUrl,
        spaceUsed: cfRes.modelUsed,
        modelLabel: formatModelDisplayLabel(cfRes.modelUsed),
        quality: safeQuality,
        nodeLabel: `Cloudflare Workers AI (${cfRes.modelUsed})`,
        provider: 'cloudflare',
        elapsedMs: cfRes.elapsedMs,
        translatedPrompt: fullPrompt,
        width: verified.width,
        height: verified.height,
      };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  // 2. Fallback: Official Hugging Face Inference API (authenticated with HF_TOKEN)
  if (hfToken) {
    stepNum++;
    const nodeLabel = 'Hugging Face Inference API';
    onStatus?.({
      space: 'stabilityai/stable-diffusion-3-medium-diffusers',
      nodeLabel,
      provider: 'huggingface',
      attempt: stepNum,
      totalAttempts: totalSteps,
      progress: 65,
      translatedPrompt: fullPrompt,
      message: 'Creating your image...',
    });
    try {
      const hfDirect = await runDirectHuggingFaceImage(fullPrompt, dims, useSdxl, hfToken);
      const verified = await enforceServerImageAspectRatio(
        hfDirect.imageDataUrl,
        safeRatio,
        fullPrompt,
        dims
      );
      return {
        imageDataUrl: verified.imageDataUrl,
        spaceUsed: hfDirect.modelUsed,
        modelLabel: formatModelDisplayLabel(hfDirect.modelUsed),
        quality: safeQuality,
        nodeLabel,
        provider: 'huggingface',
        elapsedMs: hfDirect.elapsedMs,
        translatedPrompt: fullPrompt,
        width: verified.width,
        height: verified.height,
      };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  // 3. Secondary Fallback for reference-conditioned renders if Cloudflare & Inference API unavailable
  if (tryRefEdit && effectiveInputCanvasUrl) {
    const editTimeoutMs = process.env.VERCEL ? 16000 : 22000;
    for (const editSpace of REFERENCE_EDIT_SPACES) {
      stepNum++;
      const started = Date.now();
      const nodeLabel = 'Scene Composer';
      onStatus?.({
        space: editSpace,
        nodeLabel,
        provider: 'huggingface',
        attempt: stepNum,
        totalAttempts: totalSteps,
        progress: Math.min(78, 52 + stepNum * 8),
        translatedPrompt: editPrompt,
        message: 'Creating your image...',
      });
      try {
        const spaceInputUrl =
          editSpace === 'black-forest-labs/FLUX.2-dev' ||
          editSpace === 'black-forest-labs/FLUX.2-klein-9B'
            ? normalizedRefs[0].imageUrl
            : contextPreparedCanvasUrl || effectiveInputCanvasUrl;
        const edited = await tryReferenceEditSpaces(
          editSpace,
          spaceInputUrl,
          editPrompt,
          safeRatio,
          editTimeoutMs
        );
        const verified = await enforceServerImageAspectRatio(
          edited.imageDataUrl,
          safeRatio,
          editPrompt,
          dims
        );
        return {
          imageDataUrl: verified.imageDataUrl,
          spaceUsed: editSpace,
          modelLabel: formatModelDisplayLabel(editSpace),
          quality: safeQuality,
          nodeLabel,
          provider: 'huggingface',
          elapsedMs: Date.now() - started,
          translatedPrompt: editPrompt,
          width: verified.width,
          height: verified.height,
        };
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        if (/zerogpu|quota|exceeded/i.test(lastError)) {
          hfZeroGpuExhausted = true;
          break;
        }
      }
    }
  }

  for (let i = 0; i < maxGradioAttempts; i++) {
    if (hfZeroGpuExhausted) break;
    stepNum++;
    const candidate = hfCandidates[i];
    const nodeLabel = getNodeLabel(candidate);
    const started = Date.now();
    const baseProgress = Math.round(70 + ((i + 0.25) / Math.max(1, maxGradioAttempts)) * 20);

    onStatus?.({
      space: candidate,
      nodeLabel,
      provider: 'huggingface',
      attempt: stepNum,
      totalAttempts: totalSteps,
      progress: Math.min(90, baseProgress),
      translatedPrompt: fullPrompt,
      message: 'Creating your image...',
    });

    try {
      const resImg = await tryGradioImageEndpoint(
        candidate,
        nodeLabel,
        fullPrompt,
        dims,
        useSdxl,
        safeRatio,
        undefined,
        safeQuality
      );
      const verified = await enforceServerImageAspectRatio(
        resImg.imageDataUrl,
        safeRatio,
        fullPrompt,
        dims
      );
      return {
        imageDataUrl: verified.imageDataUrl,
        spaceUsed: candidate,
        modelLabel: formatModelDisplayLabel(candidate),
        quality: safeQuality,
        nodeLabel,
        provider: 'huggingface',
        elapsedMs: Date.now() - started,
        translatedPrompt: fullPrompt,
        width: verified.width,
        height: verified.height,
      };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (/zerogpu|quota|exceeded/i.test(lastError)) {
        hfZeroGpuExhausted = true;
        break;
      }
    }
  }

  // 5. Final Zero-Quota Community GPU Fallback when Cloudflare 10k neurons & HF ZeroGPU limits are both reached
  try {
    stepNum++;
    onStatus?.({
      space: 'community-gpu',
      nodeLabel: 'Community Render Cluster',
      provider: 'huggingface',
      attempt: stepNum,
      totalAttempts: Math.max(stepNum, totalSteps),
      progress: 92,
      translatedPrompt: fullPrompt,
      message: 'Creating your image...',
    });
    const hordeRes = await runCommunityHordeImage({
      prompt: fullPrompt,
      aspectRatio: safeRatio,
      referenceBuffer: normalizedRefs[0]?.buffer,
      referenceMimeType: normalizedRefs[0]?.mimeType,
      quality: safeQuality,
    });
    const verified = await enforceServerImageAspectRatio(
      hordeRes.imageDataUrl,
      safeRatio,
      fullPrompt,
      dims
    );
    return {
      imageDataUrl: verified.imageDataUrl,
      spaceUsed: hordeRes.modelUsed,
      modelLabel: formatModelDisplayLabel(hordeRes.modelUsed),
      quality: safeQuality,
      nodeLabel: 'Community Render Cluster',
      provider: 'huggingface',
      elapsedMs: hordeRes.elapsedMs,
      translatedPrompt: fullPrompt,
      width: verified.width,
      height: verified.height,
    };
  } catch {
    // Throw clean user-friendly error only if all 5 tiers fail
  }

  throw new Error('Image creation is temporarily busy. Please try again in a moment.');
}

function sanitizeSvgMarkup(rawSvg: string, width: number, height: number): string {
  let svg = String(rawSvg || '').trim();
  const startIdx = svg.indexOf('<svg');
  const endIdx = svg.lastIndexOf('</svg>');
  if (startIdx !== -1 && endIdx !== -1) {
    svg = svg.slice(startIdx, endIdx + 6);
  } else {
    svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="#12151E"/><circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(width, height) * 0.22}" fill="#F59E0B" opacity="0.25"/><rect x="${width * 0.15}" y="${height * 0.2}" width="${width * 0.7}" height="${height * 0.6}" rx="8" fill="none" stroke="#38BDF8" stroke-width="2" stroke-dasharray="6 6"/></svg>`;
  }

  svg = svg
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?>[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(?:href|xlink:href)\s*=\s*(?:"\s*javascript:[^"]*"|'\s*javascript:[^']*')/gi, '');

  if (!/xmlns\s*=/.test(svg)) {
    svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  if (!/viewBox\s*=/.test(svg)) {
    svg = svg.replace('<svg', `<svg viewBox="0 0 ${width} ${height}"`);
  }
  return svg;
}

// ---------- Web Fetch API Route Handlers (Zero Express Dependencies) ----------

export async function handleHealthRequest(): Promise<Response> {
  try {
    const hasApiKey = Boolean(process.env.GEMINI_API_KEY?.trim());
    const hasCloudflareAi = Boolean(getCloudflareCredentials());
    const hasHfToken = Boolean(getHfToken());
    return Response.json({
      ok: true,
      hasApiKey,
      hasCloudflareAi,
      hasHfToken,
      missingEnv: getMissingEnvKeys(),
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Health check failed.' },
      { status: 500 }
    );
  }
}

export async function handleTestColabRequest(request: Request): Promise<Response> {
  try {
    const parsedBody = await parseJsonBody(request);
    if (!parsedBody.ok) return parsedBody.response;

    const validated = validateColabGradioUrl(parsedBody.data.colabUrl);
    if (!validated) {
      return Response.json(
        {
          error:
            'Enter a valid HTTPS Gradio live URL (for example, https://abc123.gradio.live from Google Colab share=True).',
        },
        { status: 400 }
      );
    }

    const started = Date.now();
    try {
      const client = await withTimeout(
        Client.connect(validated.url),
        12000,
        'Colab Gradio tunnel connection timed out (verify your Colab cell is still running).'
      );
      const api = await withTimeout(
        client.view_api(),
        8000,
        'Colab Gradio API inspection timed out.'
      );
      const endpoints = Object.keys(api.named_endpoints ?? {});
      return Response.json({
        ok: true,
        normalizedUrl: validated.url,
        host: validated.host,
        endpoints,
        latencyMs: Date.now() - started,
      });
    } catch (err) {
      return Response.json(
        {
          error:
            err instanceof Error
              ? err.message
              : 'Could not reach the Google Colab Gradio URL.',
        },
        { status: 502 }
      );
    }
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Unexpected Colab check error.' },
      { status: 500 }
    );
  }
}

async function generateEpisodeScriptJson(body: Record<string, unknown>): Promise<Response> {
  try {
    const {
      storyIdea,
      style = '3D Pixar-Style Cartoon',
      targetDurationSeconds = 45,
      aspectRatio = '16:9',
      cameraMotion = 'Auto',
      characters = [],
      tone = '',
      showBible = null,
      kidsShowMode = true,
    } = body;

    if (typeof storyIdea !== 'string' || storyIdea.trim().length < 5) {
      return Response.json(
        { error: 'Please provide a story idea of at least 5 characters.' },
        { status: 400 }
      );
    }

    const sb = showBible as {
      visualStyle?: string;
      lockVisualStyle?: boolean;
      showTitle?: string;
      worldSetting?: string;
      targetAgeGroup?: string;
    } | null;

    const bibleStyle =
      sb && typeof sb.visualStyle === 'string' && sb.lockVisualStyle ? sb.visualStyle : String(style);
    const safeStyle = ALLOWED_STYLES.includes(bibleStyle as (typeof ALLOWED_STYLES)[number])
      ? bibleStyle
      : '3D Pixar-Style Cartoon';
    const safeRatio = ALLOWED_RATIOS.includes(aspectRatio as (typeof ALLOWED_RATIOS)[number])
      ? String(aspectRatio)
      : '16:9';
    const safeMotion = ALLOWED_CAMERA_MOTIONS.includes(
      cameraMotion as (typeof ALLOWED_CAMERA_MOTIONS)[number]
    )
      ? String(cameraMotion)
      : 'Auto';
    const safeDuration = Math.min(180, Math.max(15, Number(targetDurationSeconds) || 45));
    const desiredScenes = kidsShowMode
      ? Math.min(8, Math.max(5, Math.round(safeDuration / 7)))
      : Math.min(8, Math.max(3, Math.round(safeDuration / 8)));

    const characterContext =
      Array.isArray(characters) && characters.length > 0
        ? `Cast characters available to assign to scenes (use exact character names & ids):\n${characters
            .slice(0, 8)
            .map(
              (c: {
                id?: string;
                name?: string;
                role?: string;
                appearancePrompt?: string;
                voiceArchetype?: string;
              }) =>
                `- [${String(c.id ?? '')}] ${String(c.name ?? 'Character')} (${String(
                  c.role ?? 'Role'
                )}${c.voiceArchetype ? `, Voice: ${c.voiceArchetype}` : ''}): ${String(
                  c.appearancePrompt ?? ''
                )}`
            )
            .join('\n')}`
        : 'Invent memorable characters appropriate to the story.';

    const showBibleBlock = sb
      ? [
          `SHOW BIBLE MEMORY (Maintain strict series continuity):`,
          `- Series Title: ${String(sb.showTitle || 'A.H.I Animated Series').slice(0, 120)}`,
          `- Visual Style: ${safeStyle}`,
          `- World Setting: ${String(sb.worldSetting || '').slice(0, 800)}`,
          `- Target Age Group: ${String(sb.targetAgeGroup || 'Ages 6-8 (Early Kids)').slice(0, 40)}`,
        ].join('\n')
      : '';

    const ai = getGeminiClient();

    const prompt = [
      `Act as an intelligent Animation Showrunner & Episode Architect.`,
      showBibleBlock,
      `Visual Style: ${safeStyle}`,
      `Aspect Ratio: ${safeRatio}`,
      `Preferred Camera Motion Language: ${safeMotion}`,
      `Target Shots: ${desiredScenes} cinematic shots, each strictly 5 to 8 seconds long.`,
      tone ? `Additional Tone / Audience Notes: ${String(tone).slice(0, 300)}` : '',
      characterContext,
      `Episode Premise:\n${storyIdea.trim().slice(0, 3000)}`,
      `Storytelling & Cinematography Requirements:`,
      `- Structure the shots across the 5-beat animated story arc: Hook -> Adventure -> Funny Moment -> Heartwarming Lesson -> Outro (assign exact storyBeat tag to every shot).`,
      `- Every shot's durationSeconds MUST be between 5 and 8 seconds.`,
      `- Automatically assign the right character IDs (assignedCharacterIds), cameraAngle, cameraMotion (one of: Auto, Zoom In, Zoom Out, Pan Left, Pan Right, Orbit, Drone Flyover, Static), lightingMood, dialogueLines, narration, and sfxPresetId (one of: none, sparkle, boing, footsteps, whoosh, nature, fanfare).`,
      safeStyle === 'Warm Storybook 3D'
        ? `- MANDATORY WARM STORYBOOK 3D VISUAL STYLE: Write every visualPrompt as a wide 16:9 candid full-scene movie frame with foreground and background layers where characters interact naturally in sunlit environments (never close-up portraits), featuring soft-focus vintage cinema lens, dreamy halation, warm sunlit bloom, Pro-Mist 1/2 mist diffusion, low micro-contrast, soft pastel matte clay and felt textures, warm overexposed sunlit sky, and 35mm film softness — strictly avoiding razor-sharp focus, ultra-detailed pores, sharp fabric lines, high-contrast HDR, or glossy studio lighting.`
        : safeStyle === 'Enchanted Storybook'
        ? `- MANDATORY ENCHANTED STORYBOOK VISUAL STYLE: Write every visualPrompt with ${ENCHANTED_STORYBOOK_DIRECTIVES}, blending rich atmospheric fairy-tale depth, golden volumetric sunbeams through ancient mossy trees, floating fireflies/dust motes, and lush botanical foregrounds (wildflowers, ferns, mushrooms).`
        : safeStyle === '3D Pixar-Style Cartoon' || safeStyle === '3D Cartoon'
        ? `- MANDATORY FEATURE-FILM 3D ANIMATION VISUAL BENCHMARK: Write every visualPrompt in theatrical 3D feature animation quality (${PREMIUM_3D_ANIMATION_BENCHMARK}), specifying consistent character faces, sculpted hair braids/strands, tactile woven textiles, global illumination, soft ambient occlusion, shallow depth-of-field bokeh, and lush layered environments (no text overlays or watermarks).`
        : `- Write lush animated cinema visualPrompt descriptions specifying rich materials, lighting depth, expressive character acting, depth-of-field, and smooth camera paths (no text overlays or watermarks).`,
    ]
      .filter(Boolean)
      .join('\n\n');

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: 'Concise, engaging episode title.' },
        logline: { type: Type.STRING, description: '1-2 sentence directorial synopsis.' },
        styleNotes: {
          type: Type.STRING,
          description: 'Visual direction, color palette, and rendering guidance for this style.',
        },
        suggestedMusicMood: {
          type: Type.STRING,
          description: 'Music mood and approximate BPM, e.g. Curious & Playful · 108 BPM.',
        },
        scenes: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              sceneNumber: { type: Type.INTEGER },
              title: { type: Type.STRING },
              storyBeat: {
                type: Type.STRING,
                description: 'One of: Hook, Adventure, Funny Moment, Heartwarming Lesson, Outro',
              },
              durationSeconds: { type: Type.INTEGER },
              cameraAngle: { type: Type.STRING },
              cameraMotion: { type: Type.STRING },
              lightingMood: { type: Type.STRING },
              actionDescription: { type: Type.STRING },
              visualPrompt: { type: Type.STRING },
              narration: { type: Type.STRING },
              assignedCharacterIds: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              dialogueLines: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    speaker: { type: Type.STRING },
                    emotion: { type: Type.STRING },
                    line: { type: Type.STRING },
                  },
                  required: ['speaker', 'emotion', 'line'],
                },
              },
              sfxCue: { type: Type.STRING },
              sfxPresetId: {
                type: Type.STRING,
                description: 'One of: none, sparkle, boing, footsteps, whoosh, nature, fanfare',
              },
              transition: { type: Type.STRING },
            },
            required: [
              'sceneNumber',
              'title',
              'storyBeat',
              'durationSeconds',
              'cameraAngle',
              'cameraMotion',
              'lightingMood',
              'actionDescription',
              'visualPrompt',
              'narration',
              'dialogueLines',
              'sfxCue',
              'sfxPresetId',
              'transition',
            ],
          },
        },
      },
      required: ['title', 'logline', 'styleNotes', 'suggestedMusicMood', 'scenes'],
    };

    let generatedJson: Record<string, unknown> | null = null;
    let lastErr: unknown = null;
    for (const candidate of [
      { model: 'gemini-4-hydrogen', useThinking: true },
      { model: 'gemini-3.1-flash-lite', useThinking: false },
    ]) {
      try {
        const response = await ai.models.generateContent({
          model: candidate.model,
          contents: prompt,
          config: {
            systemInstruction:
              'You are an Emmy-winning 3D Animation Showrunner & Episode Architect. Output structured JSON strictly adhering to the provided schema, keeping episodes engaging, age-appropriate, visually rich, and split into 5-8 second cinematic shots.',
            ...(candidate.useThinking ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
            responseMimeType: 'application/json',
            responseSchema,
          },
        });
        generatedJson = JSON.parse((response.text ?? '{}').trim()) as Record<string, unknown>;
        break;
      } catch (err) {
        lastErr = err;
      }
    }

    if (!generatedJson) {
      throw lastErr ?? new Error('Could not generate episode script.');
    }

    return Response.json(generatedJson);
  } catch (err) {
    const { status, message } = formatGeminiError(err);
    return Response.json({ error: message, missingEnv: getMissingEnvKeys() }, { status });
  }
}

async function refineSceneJson(body: Record<string, unknown>): Promise<Response> {
  try {
    const { scene, instruction, style = '3D Cartoon', projectTitle = '' } = body;
    const typedScene = scene as { sceneNumber?: number } | undefined;
    if (!typedScene || typeof instruction !== 'string' || instruction.trim().length < 2) {
      return Response.json(
        { error: 'Scene data and a refinement instruction are required.' },
        { status: 400 }
      );
    }

    const ai = getGeminiClient();
    const prompt = [
      `Project: "${String(projectTitle).slice(0, 140)}" (${String(style)})`,
      `Current Scene JSON:\n${JSON.stringify(typedScene)}`,
      `Director's Revision Instruction:\n${instruction.trim().slice(0, 1000)}`,
      `Revise this single scene while preserving its sceneNumber (${Number(typedScene.sceneNumber) || 1}) and maintaining visual continuity.`,
    ].join('\n\n');

    let parsed: Record<string, unknown> | null = null;
    let lastErr: unknown = null;
    for (const candidate of [
      { model: 'gemini-4-hydrogen', useThinking: true },
      { model: 'gemini-3.1-flash-lite', useThinking: false },
    ]) {
      try {
        const response = await ai.models.generateContent({
          model: candidate.model,
          contents: prompt,
          config: {
            systemInstruction:
              'You are an animation script doctor. Apply the director instruction precisely and return the updated scene JSON.',
            ...(candidate.useThinking ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                sceneNumber: { type: Type.INTEGER },
                title: { type: Type.STRING },
                durationSeconds: { type: Type.INTEGER },
                cameraAngle: { type: Type.STRING },
                lightingMood: { type: Type.STRING },
                actionDescription: { type: Type.STRING },
                visualPrompt: { type: Type.STRING },
                narration: { type: Type.STRING },
                dialogueLines: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      speaker: { type: Type.STRING },
                      emotion: { type: Type.STRING },
                      line: { type: Type.STRING },
                    },
                    required: ['speaker', 'emotion', 'line'],
                  },
                },
                sfxCue: { type: Type.STRING },
                transition: { type: Type.STRING },
              },
              required: [
                'sceneNumber',
                'title',
                'durationSeconds',
                'cameraAngle',
                'lightingMood',
                'actionDescription',
                'visualPrompt',
                'narration',
                'dialogueLines',
                'sfxCue',
                'transition',
              ],
            },
          },
        });
        parsed = JSON.parse((response.text ?? '{}').trim()) as Record<string, unknown>;
        break;
      } catch (err) {
        lastErr = err;
      }
    }

    if (!parsed) throw lastErr ?? new Error('Failed to refine scene.');
    return Response.json(parsed);
  } catch (err) {
    const { status, message } = formatGeminiError(err);
    return Response.json({ error: message }, { status });
  }
}

async function generateStoryboardJson(body: Record<string, unknown>): Promise<Response> {
  try {
    const {
      scene,
      style = '3D Cartoon',
      aspectRatio = '16:9',
      projectTitle = '',
    } = body;

    const typedScene = scene as {
      sceneNumber?: number;
      title?: string;
      cameraAngle?: string;
      lightingMood?: string;
      actionDescription?: string;
      visualPrompt?: string;
    } | null;

    if (!typedScene || typeof typedScene.visualPrompt !== 'string') {
      return Response.json(
        { error: 'Scene details with a visual description are required.' },
        { status: 400 }
      );
    }

    const safeStyle = ALLOWED_STYLES.includes(style as (typeof ALLOWED_STYLES)[number])
      ? String(style)
      : '3D Cartoon';
    const safeRatio = ALLOWED_RATIOS.includes(aspectRatio as (typeof ALLOWED_RATIOS)[number])
      ? String(aspectRatio)
      : '16:9';
    const dims = SVG_VIEWBOX_BY_RATIO[safeRatio] ?? SVG_VIEWBOX_BY_RATIO['16:9'];
    const ai = getGeminiClient();

    const styleVisualDirective: Record<string, string> = {
      'Warm Storybook 3D':
        'Compose wide 16:9 candid full-scene movie frames with foreground and background layers in sunlit environments rather than close-up portraits. Use soft pastel matte clay and felt tones, warm overexposed sunlit sky, gentle mist halation, low micro-contrast, and soft slightly blurred edges.',
      'Enchanted Storybook':
        'Compose atmospheric fairy-tale woodland frames with golden volumetric sunbeams through mossy trees, glowing fireflies and dust motes, botanical foreground framing with wildflowers, ferns, and mushrooms, soft DOF haze, and warm painterly tones.',
      '3D Pixar-Style Cartoon':
        'Use tactile rounded volumetric forms, soft subsurface radial gradients, expressive hero silhouettes, warm rim lighting, and lush layered foreground/background depth.',
      '3D Cartoon':
        'Use warm rounded shapes, soft radial gradients for 3D volumetric shading, expressive character silhouettes, warm amber rim highlights, and cozy layered foreground/midground/background depth.',
      Anime:
        'Use dramatic cel-shaded flat color planes with crisp dark ink outlines, atmospheric gradient twilight skies, diagonal wind/motion streaks, and dynamic theatrical composition.',
      'Cinematic Film':
        'Use anamorphic widescreen framing, moody chiaroscuro volumetric light shafts, shallow depth-of-field bokeh shapes, and subtle indigo/cyan atmospheric haze.',
      '2D Illustration':
        'Use editorial gouache-like layered flat vector shapes, geometric foliage, warm storybook accents, and crisp graphic silhouettes.',
      Realistic:
        'Use balanced naturalistic three-point lighting, grounded architectural perspective, crisp horizon depth, and clean camera rule-of-thirds composition.',
      Educational:
        'Use clean geometric 2.5D diagramming on a deep obsidian-slate background, crisp dashed orbital/vector paths, numbered focal markers, isometric shapes, and high-contrast indigo/cyan highlights.',
    };

    const prompt = [
      `Generate a 3-keyframe animated storyboard sequence for Scene ${Number(typedScene.sceneNumber) || 1}: "${String(
        typedScene.title || 'Scene'
      )}" from "${String(projectTitle).slice(0, 100)}".`,
      `Animation Style: ${safeStyle}`,
      `Style Visual Rules: ${styleVisualDirective[safeStyle] || styleVisualDirective['3D Cartoon']}`,
      `Aspect Ratio / SVG Canvas: viewBox="0 0 ${dims.w} ${dims.h}"`,
      `Camera Angle: ${String(typedScene.cameraAngle || 'Medium Shot')}`,
      `Lighting Mood: ${String(typedScene.lightingMood || 'Cinematic dusk')}`,
      `Action Description: ${String(typedScene.actionDescription || '').slice(0, 600)}`,
      `Visual Prompt: ${String(typedScene.visualPrompt || '').slice(0, 800)}`,
      `Return 3 sequential keyframes representing: (1) Opening Frame, (2) Peak Action Beat, (3) Closing / Transition Frame.`,
      `Each keyframe's svgMarkup MUST be a complete, self-contained valid <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dims.w} ${dims.h}">...</svg> using rich multi-layered vector art with NO <script> or external image URLs.`,
    ].join('\n\n');

    interface StoryboardParsed {
      sketchNotes?: string;
      paletteHexes?: string[];
      keyframes?: Array<{
        beatLabel?: string;
        caption?: string;
        cameraMotion?: string;
        svgMarkup?: string;
      }>;
    }

    let parsed: StoryboardParsed | null = null;
    let lastErr: unknown = null;

    for (const candidate of [
      { model: 'gemini-4-hydrogen', useThinking: true },
      { model: 'gemini-3.1-flash-lite', useThinking: false },
    ]) {
      try {
        const response = await ai.models.generateContent({
          model: candidate.model,
          contents: prompt,
          config: {
            systemInstruction:
              'You are a senior storyboard artist and visual development director. Craft expressive, clean multi-layered SVG storyboard keyframes that accurately depict the scene action, camera blocking, and chosen animation style.',
            ...(candidate.useThinking ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                sketchNotes: {
                  type: Type.STRING,
                  description: 'Concise director blocking & composition summary for the 3-frame sequence.',
                },
                paletteHexes: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: '4 hex colors defining this scene lighting palette.',
                },
                keyframes: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      beatLabel: { type: Type.STRING },
                      caption: { type: Type.STRING },
                      cameraMotion: { type: Type.STRING },
                      svgMarkup: { type: Type.STRING },
                    },
                    required: ['beatLabel', 'caption', 'cameraMotion', 'svgMarkup'],
                  },
                },
              },
              required: ['sketchNotes', 'paletteHexes', 'keyframes'],
            },
          },
        });
        parsed = JSON.parse((response.text ?? '{}').trim()) as StoryboardParsed;
        break;
      } catch (err) {
        lastErr = err;
      }
    }

    if (!parsed) throw lastErr ?? new Error('Failed to generate storyboard.');

    const rawFrames = Array.isArray(parsed.keyframes) ? parsed.keyframes.slice(0, 3) : [];
    const sanitizedFrames = rawFrames.map((kf, idx) => ({
      id: `kf-${Date.now()}-${idx}`,
      beatLabel: String(kf.beatLabel || `Keyframe ${idx + 1}`),
      caption: String(kf.caption || ''),
      cameraMotion: String(kf.cameraMotion || 'Static Hold'),
      svgMarkup: sanitizeSvgMarkup(String(kf.svgMarkup || ''), dims.w, dims.h),
    }));

    return Response.json({
      sketchNotes: String(parsed.sketchNotes || ''),
      paletteHexes: Array.isArray(parsed.paletteHexes)
        ? parsed.paletteHexes.slice(0, 5)
        : ['#0F172A', '#F59E0B', '#38BDF8', '#E2E8F0'],
      keyframes: sanitizedFrames,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    const { status, message } = formatGeminiError(err);
    return Response.json({ error: message }, { status });
  }
}

export async function handleGenerateScriptRequest(
  request: Request,
  forcedAction?: string
): Promise<Response> {
  try {
    const parsedBody = await parseJsonBody(request);
    if (!parsedBody.ok) return parsedBody.response;

    const body = parsedBody.data;
    const action = forcedAction || (typeof body.action === 'string' ? body.action : 'generate');

    if (action === 'refine-scene') {
      return await refineSceneJson(body);
    }
    if (action === 'storyboard') {
      return await generateStoryboardJson(body);
    }
    return await generateEpisodeScriptJson(body);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Script request failed.' },
      { status: 500 }
    );
  }
}

async function generateCharacterSheetJson(body: Record<string, unknown>): Promise<Response> {
  try {
    const { concept, styleAffinity = '3D Cartoon' } = body;
    if (typeof concept !== 'string' || concept.trim().length < 3) {
      return Response.json({ error: 'Please describe a character concept.' }, { status: 400 });
    }

    const safeStyle = ALLOWED_STYLES.includes(styleAffinity as (typeof ALLOWED_STYLES)[number])
      ? String(styleAffinity)
      : '3D Cartoon';
    const ai = getGeminiClient();

    let parsed: Record<string, unknown> | null = null;
    let lastErr: unknown = null;
    for (const candidate of [
      { model: 'gemini-4-hydrogen', useThinking: true },
      { model: 'gemini-3.1-flash-lite', useThinking: false },
    ]) {
      try {
        const response = await ai.models.generateContent({
          model: candidate.model,
          contents: `Design an animation character sheet in the "${safeStyle}" style (${STYLE_PROMPT_DIRECTIVES[safeStyle] ?? safeStyle}) for this concept:\n${concept
            .trim()
            .slice(0, 1200)}`,
          config: {
            systemInstruction:
              'You are a lead character designer for theatrical 3D animation studios. Produce cohesive character profiles with hyper-specific visual appearance prompts (sculpted face proportions, eye/eyebrow/lash details, hair strands/braids, clothing fabric/material textures, signature props), 3 personality traits, 4 hex colors, and a matching voice preset (one of Kore, Puck, Charon, Fenrir, Zephyr).',
            ...(candidate.useThinking ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                role: { type: Type.STRING },
                appearancePrompt: { type: Type.STRING },
                personalityTraits: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                voiceName: { type: Type.STRING },
                voiceStyle: { type: Type.STRING },
                signatureProps: { type: Type.STRING },
                colorPalette: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
              required: [
                'name',
                'role',
                'appearancePrompt',
                'personalityTraits',
                'voiceName',
                'voiceStyle',
                'signatureProps',
                'colorPalette',
              ],
            },
          },
        });
        parsed = JSON.parse((response.text ?? '{}').trim()) as Record<string, unknown>;
        break;
      } catch (err) {
        lastErr = err;
      }
    }

    if (!parsed) throw lastErr ?? new Error('Could not design character sheet.');

    if (!ALLOWED_VOICES.includes(parsed.voiceName as (typeof ALLOWED_VOICES)[number])) {
      parsed.voiceName = 'Kore';
    }
    return Response.json({ ...parsed, styleAffinity: safeStyle });
  } catch (err) {
    const { status, message } = formatGeminiError(err);
    return Response.json({ error: message }, { status });
  }
}

async function generateExpressionSheetJson(body: Record<string, unknown>): Promise<Response> {
  try {
    const {
      name = 'Character',
      appearancePrompt = '',
      styleAffinity = '3D Pixar-Style Cartoon',
      avatarImageUrl,
      colabUrl,
    } = body;

    const safeStyle = ALLOWED_STYLES.includes(styleAffinity as (typeof ALLOWED_STYLES)[number])
      ? String(styleAffinity)
      : '3D Pixar-Style Cartoon';
    let visualDna = `${String(name).trim()}${
      String(appearancePrompt).trim() ? `, ${String(appearancePrompt).trim()}` : ''
    }`;

    const avatarBuf =
      typeof avatarImageUrl === 'string' ? resolveImageInputToBuffer(avatarImageUrl) : null;
    const apiKey = process.env.GEMINI_API_KEY?.trim();

    if (avatarBuf && apiKey) {
      const ai = getGeminiClient();
      for (const model of ['gemini-4-hydrogen', 'gemini-3.1-flash-lite']) {
        try {
          const visionRes = await withTimeout(
            ai.models.generateContent({
              model,
              contents: {
                parts: [
                  {
                    inlineData: {
                      mimeType: avatarBuf.mimeType,
                      data: avatarBuf.buffer.toString('base64'),
                    },
                  },
                  {
                    text: `Analyze this character portrait (${String(
                      name
                    )}) and write ONE concise visual identity specification (50-80 words) capturing exact hair/fur color & shape, eye color, facial features, accessories, clothing colors, and proportions so 4 consistent expression & turnaround angles preserve the exact same character.`,
                  },
                ],
              },
            }),
            10000,
            'Character DNA analysis timed out.'
          );
          const dnaText = (visionRes.text ?? '').trim().replace(/\s+/g, ' ');
          if (dnaText.length >= 20) {
            visualDna = dnaText.slice(0, 460);
            break;
          }
        } catch {
          // fallback to provided appearancePrompt
        }
      }
    }

    const viewSpecs: Array<{
      expression: 'Happy' | 'Surprised' | 'Determined' | 'Turnaround';
      cue: string;
    }> = [
      {
        expression: 'Happy',
        cue: 'happy joyful beaming smile, sparkling expressive eyes, warm animated character portrait bust facing camera, clean soft neutral studio background',
      },
      {
        expression: 'Surprised',
        cue: 'surprised wide-eyed amazed expression, raised eyebrows, playful open-mouth gasp, matching exact outfit and character features, clean neutral studio background',
      },
      {
        expression: 'Determined',
        cue: 'determined heroic confident expression, focused brow and warm brave smile, matching exact outfit and character features, clean neutral studio background',
      },
      {
        expression: 'Turnaround',
        cue: 'three-quarter side and back character turnaround reference view showing full silhouette, hair/tail/backpack/costume details cleanly, matching exact outfit and proportions, clean neutral studio background',
      },
    ];

    const settled = await Promise.allSettled(
      viewSpecs.map(async (view) => {
        const gen = await runResilientImageGeneration({
          prompt: `${visualDna}, ${view.cue}, consistent character model sheet`,
          style: safeStyle,
          aspectRatio: '1:1',
          engine: 'flux-schnell',
          colabUrl: typeof colabUrl === 'string' ? colabUrl : undefined,
        });
        return {
          expression: view.expression,
          imageUrl: gen.imageDataUrl,
        };
      })
    );

    const expressions = settled
      .filter(
        (r): r is PromiseFulfilledResult<{
          expression: 'Happy' | 'Surprised' | 'Determined' | 'Turnaround';
          imageUrl: string;
        }> => r.status === 'fulfilled'
      )
      .map((r) => r.value);

    if (expressions.length === 0) {
      return Response.json(
        { error: 'Image nodes are currently busy. Please retry generating the 4-view sheet.' },
        { status: 503 }
      );
    }

    return Response.json({ expressions, visualDna });
  } catch (err) {
    return Response.json(
      {
        error:
          err instanceof Error
            ? err.message
            : 'Could not generate 4-view expression & turnaround sheet.',
      },
      { status: 500 }
    );
  }
}

export async function handleCharactersRequest(
  request: Request,
  forcedAction?: string
): Promise<Response> {
  try {
    const parsedBody = await parseJsonBody(request);
    if (!parsedBody.ok) return parsedBody.response;

    const body = parsedBody.data;
    const action = forcedAction || (typeof body.action === 'string' ? body.action : 'generate');

    if (action === 'expression-sheet') {
      return await generateExpressionSheetJson(body);
    }
    return await generateCharacterSheetJson(body);
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Character request failed.' },
      { status: 500 }
    );
  }
}

export async function handleVoiceRequest(request: Request): Promise<Response> {
  try {
    const parsedBody = await parseJsonBody(request);
    if (!parsedBody.ok) return parsedBody.response;

    const {
      text,
      voiceName = 'Kore',
      styleInstruction = 'Clear, expressive animation narrator',
    } = parsedBody.data;

    if (typeof text !== 'string' || text.trim().length < 2) {
      return Response.json(
        { error: 'Please provide dialogue or narration text to synthesize.' },
        { status: 400 }
      );
    }

    const safeVoice = ALLOWED_VOICES.includes(voiceName as (typeof ALLOWED_VOICES)[number])
      ? (voiceName as (typeof ALLOWED_VOICES)[number])
      : 'Kore';

    const synthesized = await synthesizeTalkingVoiceAudio(text, 'female', {
      voiceName: safeVoice,
      voiceStyle: String(styleInstruction),
    });

    return Response.json({
      audioBase64: synthesized.audioBase64,
      mimeType: synthesized.mimeType,
      voiceName: safeVoice,
    });
  } catch (err) {
    const { status, message } = formatGeminiError(err);
    return Response.json({ error: message }, { status });
  }
}

export async function handleRemoveBackgroundRequest(request: Request): Promise<Response> {
  try {
    const parsedBody = await parseJsonBody(request);
    if (!parsedBody.ok) return parsedBody.response;

    const { imageDataUrl, imageUrl } = parsedBody.data;
    const targetInput =
      typeof imageDataUrl === 'string' && imageDataUrl.trim()
        ? imageDataUrl
        : typeof imageUrl === 'string' && imageUrl.trim()
        ? imageUrl
        : '';

    if (!targetInput) {
      return Response.json(
        { error: 'Please provide an image to remove the background from.' },
        { status: 400 }
      );
    }

    const result = await removeBackgroundServer(targetInput);
    return Response.json(result);
  } catch (err) {
    return Response.json(
      {
        error: err instanceof Error ? err.message : 'Background removal failed.',
      },
      { status: 503 }
    );
  }
}

export async function handleGenerateImageRequest(
  request: Request,
  forceStream?: boolean
): Promise<Response> {
  try {
    const parsedBody = await parseJsonBody(request);
    if (!parsedBody.ok) return parsedBody.response;

    const url = new URL(request.url);
    const wantsStream =
      forceStream ??
      (url.searchParams.get('stream') === '1' ||
        parsedBody.data.stream === true ||
        request.headers.get('accept')?.includes('text/event-stream'));

    const {
      prompt,
      style = 'Cinematic Film',
      aspectRatio = '16:9',
      engine = 'flux-schnell',
      quality = 'high',
      spaceId,
      colabUrl,
      imageDataUrl,
      preparedCanvasDataUrl,
      removeBackground,
      referenceImages,
    } = parsedBody.data;

    if (typeof prompt !== 'string' || prompt.trim().length < 4) {
      if (wantsStream) {
        return createSseStreamResponse(async (sendEvent) => {
          sendEvent({
            type: 'error',
            error: 'Please provide an image prompt of at least 4 characters.',
          });
        });
      }
      return Response.json(
        { error: 'Please provide an image prompt of at least 4 characters.' },
        { status: 400 }
      );
    }

    const safeQuality: ImageQualityTier = ALLOWED_QUALITIES.includes(quality as ImageQualityTier)
      ? (quality as ImageQualityTier)
      : 'high';

    const genOptions = {
      prompt,
      style: String(style),
      aspectRatio: String(aspectRatio),
      engine: String(engine),
      quality: safeQuality,
      spaceId: typeof spaceId === 'string' ? spaceId : undefined,
      colabUrl: typeof colabUrl === 'string' ? colabUrl : undefined,
      imageDataUrl: typeof imageDataUrl === 'string' ? imageDataUrl : undefined,
      preparedCanvasDataUrl:
        typeof preparedCanvasDataUrl === 'string' ? preparedCanvasDataUrl : undefined,
      removeBackground: Boolean(removeBackground),
      referenceImages: Array.isArray(referenceImages)
        ? (referenceImages as Array<{
            imageUrl?: string;
            role?: string;
            label?: string;
            description?: string;
          }>)
        : undefined,
    };

    if (wantsStream) {
      return createSseStreamResponse(async (sendEvent) => {
        try {
          const result = await runResilientImageGeneration(genOptions, (statusEvt) => {
            sendEvent({ type: 'status', ...statusEvt });
          });
          sendEvent({ type: 'complete', ...result, imageUrl: result.imageDataUrl });
        } catch (err) {
          sendEvent({
            type: 'error',
            error: err instanceof Error ? err.message : 'All image nodes are temporarily busy.',
          });
        }
      });
    }

    try {
      const result = await runResilientImageGeneration(genOptions);
      return Response.json({ ...result, imageUrl: result.imageDataUrl });
    } catch (err) {
      return Response.json(
        {
          error: err instanceof Error ? err.message : 'Failed to reach image generation node.',
          missingEnv: getMissingEnvKeys(),
        },
        { status: 503 }
      );
    }
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Image generation request failed.' },
      { status: 500 }
    );
  }
}

async function streamStandardVideo(
  body: Record<string, unknown>,
  sendEvent: (event: Record<string, unknown>) => void
): Promise<void> {
  const {
    prompt,
    mode = 'text-to-video',
    imageDataUrl,
    animateExactFrame = false,
    referenceImages = [],
    style = 'Cinematic Film',
    aspectRatio = '16:9',
    cameraMotion = 'Auto',
    spaceId,
    colabUrl,
  } = body;

  if (typeof prompt !== 'string' || prompt.trim().length < 4) {
    sendEvent({
      type: 'error',
      error: 'Please provide a scene visual prompt (at least 4 characters).',
    });
    return;
  }

  const normalizedRefs: NormalizedReferenceInput[] = [];
  if (Array.isArray(referenceImages)) {
    for (let idx = 0; idx < Math.min(8, referenceImages.length); idx++) {
      const item = referenceImages[idx] as {
        imageUrl?: unknown;
        role?: unknown;
        label?: unknown;
        description?: unknown;
      } | null;
      if (!item || typeof item.imageUrl !== 'string') continue;
      const resolved = resolveImageInputToBuffer(item.imageUrl);
      if (!resolved) continue;
      normalizedRefs.push({
        imageUrl: item.imageUrl,
        role: typeof item.role === 'string' && item.role.trim() ? item.role.trim() : 'Character',
        label:
          typeof item.label === 'string' && item.label.trim()
            ? item.label.trim().slice(0, 80)
            : `Ref ${idx + 1}`,
        description:
          typeof item.description === 'string' ? item.description.trim().slice(0, 300) : '',
        buffer: resolved.buffer,
        mimeType: resolved.mimeType,
      });
    }
  }

  if (normalizedRefs.length === 0 && typeof imageDataUrl === 'string') {
    const singleResolved = resolveImageInputToBuffer(imageDataUrl);
    if (singleResolved) {
      normalizedRefs.push({
        imageUrl: imageDataUrl,
        role: animateExactFrame ? 'Background / Scene' : 'Character',
        label: 'Reference Image',
        description: '',
        buffer: singleResolved.buffer,
        mimeType: singleResolved.mimeType,
      });
    }
  }

  const safeRatio = ALLOWED_RATIOS.includes(aspectRatio as (typeof ALLOWED_RATIOS)[number])
    ? String(aspectRatio)
    : '16:9';
  const safeMotion = ALLOWED_CAMERA_MOTIONS.includes(
    cameraMotion as (typeof ALLOWED_CAMERA_MOTIONS)[number]
  )
    ? String(cameraMotion)
    : 'Auto';

  sendEvent({
    type: 'status',
    progress: 8,
    message: 'Creating your video...',
  });

  const { enhancedPrompt, useExactStartFrame } = await enhanceCinemaVideoPrompt({
    basePrompt: prompt,
    refs: normalizedRefs,
    style: String(style),
    cameraMotion: safeMotion,
    animateExactFrame: Boolean(
      animateExactFrame ||
        (mode === 'image-to-video' && normalizedRefs.length === 1 && typeof imageDataUrl === 'string')
    ),
  });

  const refDims = normalizedRefs[0]
    ? await getImageBufferDimensionsReliable(normalizedRefs[0].buffer)
    : null;
  const refMatchesTargetRatio = Boolean(
    refDims && isDimensionsMatchingRatio(refDims.width, refDims.height, safeRatio, 0.04)
  );
  const shouldUseSingleFrameI2v = Boolean(
    useExactStartFrame && normalizedRefs.length === 1 && refMatchesTargetRatio
  );
  const safeMode =
    shouldUseSingleFrameI2v || normalizedRefs.length > 0 ? 'image-to-video' : 'text-to-video';
  let activeImageBlob: Blob | null = shouldUseSingleFrameI2v
    ? new Blob([new Uint8Array(normalizedRefs[0].buffer)], { type: normalizedRefs[0].mimeType })
    : null;
  let autoGeneratedStartFrameUrl: string | undefined;

  const clientMotionFallback = body.clientMotionFallback === true;
  const customSpace =
    typeof spaceId === 'string' && SPACE_ID_RE.test(spaceId.trim()) ? spaceId.trim() : null;
  const fullPrompt = buildTranslatedVideoPrompt(enhancedPrompt, String(style), safeRatio, safeMotion);
  const videoTargetDims = VIDEO_DIMENSIONS_BY_RATIO[safeRatio] ?? VIDEO_DIMENSIONS_BY_RATIO['16:9'];
  const queueTimeoutMs = process.env.VERCEL ? 35_000 : 45_000;
  let lastError = 'External video nodes are temporarily busy.';

  let autoFrameFailed = false;
  const ensureAutoStartingFrame = async (): Promise<Blob | null> => {
    if (activeImageBlob) return activeImageBlob;
    if (autoFrameFailed) {
      throw new Error(lastError || 'Starting scene frame unavailable.');
    }

    sendEvent({
      type: 'status',
      progress: 22,
      translatedPrompt: fullPrompt,
      message: 'Composing scene frame...',
    });

    let startImg: ImageGenResult;
    try {
      startImg = await runResilientImageGeneration({
        prompt: enhancedPrompt,
        style: String(style),
        aspectRatio: safeRatio,
        engine: 'flux-schnell',
        colabUrl: typeof colabUrl === 'string' ? colabUrl : undefined,
        allowGradioFallback: true,
        removeBackground: normalizedRefs.length > 0,
        referenceImages:
          normalizedRefs.length > 0
            ? normalizedRefs.map((r) => ({
                imageUrl: r.imageUrl,
                role: r.role,
                label: r.label,
                description: r.description,
              }))
            : undefined,
      });
    } catch (err) {
      autoFrameFailed = true;
      throw err;
    }

    const resolvedBlob = resolveImageInputToBlob(startImg.imageDataUrl);
    if (!resolvedBlob) {
      autoFrameFailed = true;
      throw new Error('Could not convert generated starting frame into an image blob.');
    }
    activeImageBlob = resolvedBlob;
    autoGeneratedStartFrameUrl = startImg.imageDataUrl;

    sendEvent({
      type: 'status',
      progress: 32,
      imageDataUrl: startImg.imageDataUrl,
      translatedPrompt: fullPrompt,
      message: 'Creating your video...',
    });

    return activeImageBlob;
  };

  // Always compose a verified target-ratio scene frame first when user supplied reference image(s)
  // that do not match safeRatio (e.g., 9:16 ref -> 16:9 video) or multiple references.
  if (normalizedRefs.length > 0 && !activeImageBlob) {
    try {
      await ensureAutoStartingFrame();
    } catch (preFrameErr) {
      lastError = preFrameErr instanceof Error ? preFrameErr.message : String(preFrameErr);
    }
  }

  // TIER 1: Optional Private Colab Turbo GPU (if configured by user) -> Official Hugging Face Inference Router
  const validColab = validateColabGradioUrl(colabUrl);
  const hfToken = getHfToken();
  const startedPipeline = Date.now();

  if (hfToken && !validColab) {
    sendEvent({
      type: 'status',
      progress: 36,
      translatedPrompt: fullPrompt,
      message: 'Creating your video...',
    });
    try {
      const startBuf = activeImageBlob ? Buffer.from(await activeImageBlob.arrayBuffer()) : undefined;
      const routerVideo = await tryHuggingFaceInferenceRouterVideo({
        prompt: fullPrompt,
        aspectRatio: safeRatio,
        hfToken,
        startImageBuffer: startBuf,
        startImageMime: activeImageBlob?.type || 'image/png',
      });
      if (routerVideo) {
        const finalVideoUrl = serializeRenderedVideoUrl(
          routerVideo.buffer,
          routerVideo.mimeType,
          ''
        );
        sendEvent({
          type: 'complete',
          videoUrl: finalVideoUrl,
          ...(autoGeneratedStartFrameUrl ? { imageDataUrl: autoGeneratedStartFrameUrl } : {}),
          spaceUsed: routerVideo.modelUsed,
          nodeLabel: 'Cinema Video Engine',
          provider: 'huggingface',
          elapsedMs: Date.now() - startedPipeline,
          translatedPrompt: fullPrompt,
          width: routerVideo.width,
          height: routerVideo.height,
          aspectRatio: safeRatio,
          progress: 100,
          mode: activeImageBlob ? 'image-to-video' : 'text-to-video',
        });
        return;
      }
    } catch {
      // Tier 2 silent failover
    }
  }

  // TIER 2: Silent backend-authenticated failover (private Colab if provided + live HF nodes with fast quota guard)
  const nodesToTry: Array<{
    target: string;
    displaySpace: string;
    nodeLabel: string;
    provider: 'colab-turbo' | 'huggingface';
    extraAllowedHost?: string;
  }> = [];

  if (validColab) {
    nodesToTry.push({
      target: validColab.url,
      displaySpace: `colab://${validColab.host}`,
      nodeLabel: 'Colab Turbo GPU',
      provider: 'colab-turbo',
      extraAllowedHost: validColab.host,
    });
  }

  if (hfToken || validColab) {
    const liveRunningSpaces = await discoverRunningVideoSpaces(safeMode).catch(() => VIDEO_SPACES_I2V);
    const hfCandidates = customSpace
      ? [customSpace, ...liveRunningSpaces.filter((s) => s !== customSpace)]
      : liveRunningSpaces;
    const maxTier2Spaces = process.env.VERCEL ? 2 : 3;
    for (const s of hfCandidates.slice(0, maxTier2Spaces)) {
      nodesToTry.push({
        target: s,
        displaySpace: s,
        nodeLabel: 'Cinema Video Engine',
        provider: 'huggingface',
      });
    }
  }

  for (let i = 0; i < nodesToTry.length; i++) {
    const node = nodesToTry[i];
    const started = Date.now();
    try {
      if (/cogvideo/i.test(node.target) && safeRatio === '9:16') {
        continue;
      }

      sendEvent({
        type: 'status',
        progress: Math.min(58, Math.round(38 + (i / Math.max(1, nodesToTry.length)) * 18)),
        translatedPrompt: fullPrompt,
        message: 'Creating your video...',
      });

      const clientOptions = node.provider === 'huggingface' ? getHfGradioOptions() : undefined;
      const client = await withTimeout(
        Client.connect(node.target, clientOptions),
        10000,
        'Connection timed out.'
      );
      const api = await withTimeout(client.view_api(), 8000, 'API schema timed out.');

      const namedEntries = Object.entries(api.named_endpoints ?? {}).filter(
        ([k]) => !/^\/?(_|handle_|update_|extract_|fit_|on_)/i.test(k)
      );
      const videoEndpoints = namedEntries.filter(([, ep]) =>
        (ep?.returns ?? []).some((r) => /video/i.test(String(r.component)))
      );
      const candidateEntries = videoEndpoints.length > 0 ? videoEndpoints : namedEntries;

      const isCogVideoSpace = /cogvideo/i.test(node.target);
      const isExplicitI2vSpace =
        /wan2[-_.]?[12]|i2v|img2vid|image-to-video|minimax/i.test(node.target) &&
        !/t2v|text-to-video/i.test(node.target);

      const pickEndpointForCurrentFrame = (hasFrame: boolean): string | number => {
        if (hasFrame) {
          const i2vMatch = candidateEntries.find(([k]) =>
            /i2v|img2vid|image_to_video|generate_video|generate/i.test(k)
          );
          if (i2vMatch) return i2vMatch[0];
        } else {
          const t2vMatch = candidateEntries.find(([k]) =>
            /t2v|txt2vid|text_to_video|generate|predict|infer/i.test(k)
          );
          if (t2vMatch) return t2vMatch[0];
        }
        return candidateEntries[0]?.[0] ?? 0;
      };

      let chosenEndpoint: string | number = pickEndpointForCurrentFrame(Boolean(activeImageBlob));
      let epInfo =
        typeof chosenEndpoint === 'string'
          ? api.named_endpoints?.[chosenEndpoint]
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
        !isCogVideoSpace && paramsMeta.some((p) => !p.parameter_has_default && isPrimaryImageParam(p));
      const endpointIsI2v = /i2v|img2vid|image_to_video/i.test(String(chosenEndpoint));

      if (!activeImageBlob && (requiresMandatoryImage || isExplicitI2vSpace || endpointIsI2v)) {
        if (autoFrameFailed) continue;
        try {
          await ensureAutoStartingFrame();
          chosenEndpoint = pickEndpointForCurrentFrame(Boolean(activeImageBlob));
          epInfo =
            typeof chosenEndpoint === 'string'
              ? api.named_endpoints?.[chosenEndpoint]
              : api.unnamed_endpoints?.[0];
          paramsMeta = epInfo?.parameters ?? [];
        } catch {
          continue;
        }
      }

      const stillRequiresPrimaryImage = paramsMeta.some(
        (p) => !p.parameter_has_default && isPrimaryImageParam(p)
      );
      if (!activeImageBlob && stillRequiresPrimaryImage) {
        continue;
      }

      const isDistilled = /ltx|fast|turbo|fp8/i.test(node.target);
      const isWan22 = /wan2[-_.]?2/i.test(node.target);
      const isWarmStorybookVideo = String(style) === 'Warm Storybook 3D';
      const needsPositional = paramsMeta.some((p) => !p.parameter_name || p.parameter_name === 'null');

      let attachedPrimary = false;
      const resolveParamValue = (p: (typeof paramsMeta)[number]): unknown => {
        const name = p.parameter_name ?? '';
        const lower = name.toLowerCase();
        if (lower.includes('prompt') && !lower.includes('negative')) return fullPrompt;
        if (lower.includes('negative')) {
          return isWarmStorybookVideo
            ? WARM_STORYBOOK_3D_NEGATIVE_PROMPT
            : p.parameter_has_default
            ? p.parameter_default
            : 'text, watermark, signature, blurry, low quality, stretched, artifacts';
        }
        if (lower === 'mode') return activeImageBlob ? 'image-to-video' : 'text-to-video';
        if (lower === 'generation_mode') return activeImageBlob ? 'Image-to-Video' : 'Text-to-Video';
        if (lower === 'width_ui' || lower === 'width') return videoTargetDims.w;
        if (lower === 'height_ui' || lower === 'height') return videoTargetDims.h;
        if (activeImageBlob && !attachedPrimary && isPrimaryImageParam(p)) {
          attachedPrimary = true;
          return handle_file(activeImageBlob);
        }
        if (isWan22 && (lower === 'quality' || lower === 'steps')) return 8;
        if ((lower === 'num_inference_steps' || lower === 'steps') && isDistilled && !p.parameter_has_default) {
          return 8;
        }
        if ((lower === 'duration' || lower === 'seconds') && !p.parameter_has_default) return 3;
        if (p.parameter_has_default) return p.parameter_default;
        return null;
      };

      const positionalValues = paramsMeta.map((p) => resolveParamValue(p));
      const namedPayload: Record<string, unknown> = {};
      paramsMeta.forEach((p, idx) => {
        if (p.parameter_name && p.parameter_name !== 'null') {
          namedPayload[p.parameter_name] = positionalValues[idx];
        }
      });

      const submitArgs: unknown[] | Record<string, unknown> = needsPositional
        ? positionalValues
        : Object.keys(namedPayload).length > 0
        ? namedPayload
        : [fullPrompt];

      const effectiveMode: 'text-to-video' | 'image-to-video' = activeImageBlob
        ? 'image-to-video'
        : 'text-to-video';

      const job = client.submit(chosenEndpoint, submitArgs, null, null, true);
      let videoUrl: string | null = null;
      let hitZeroGpuLimit = false;
      const jobStart = Date.now();
      for await (const msg of job) {
        if (Date.now() - jobStart > queueTimeoutMs && !videoUrl) {
          break;
        }
        if (msg.type === 'status') {
          const pct =
            msg.stage === 'generating'
              ? 72
              : typeof msg.position === 'number'
              ? Math.max(44, 64 - Math.min(20, msg.position * 2))
              : 54;
          sendEvent({
            type: 'status',
            progress: pct,
            translatedPrompt: fullPrompt,
            message: 'Creating your video...',
          });
          if (msg.stage === 'error') {
            const errTxt =
              typeof msg.message === 'string' ? msg.message : JSON.stringify(msg.message ?? '');
            if (/zerogpu|quota|exceeded|limit|429/i.test(errTxt)) {
              hitZeroGpuLimit = true;
            }
            break;
          }
        } else if (msg.type === 'data') {
          videoUrl = extractGradioMediaUrl(msg.data, node.extraAllowedHost);
          if (videoUrl) break;
        }
      }

      if (hitZeroGpuLimit) {
        // Immediately drop out of HF ZeroGPU Space loop into Tier 3 Cinema Motion
        break;
      }
      if (!videoUrl) continue;

      const vidRes = await withTimeout(
        fetch(videoUrl, {
          headers: node.provider === 'huggingface' ? getHfAuthHeadersForUrl(videoUrl) : undefined,
        }),
        25000,
        'Video download timed out.'
      );
      if (!vidRes.ok) continue;

      const rawMime = vidRes.headers.get('content-type') || 'video/mp4';
      const rawBuf = Buffer.from(await vidRes.arrayBuffer());
      const verifiedVideo = await inspectAndNormalizeVideoBuffer(rawBuf, safeRatio);
      const finalVideoUrl = serializeRenderedVideoUrl(
        verifiedVideo.buffer,
        verifiedVideo.mimeType || rawMime,
        videoUrl
      );

      sendEvent({
        type: 'complete',
        videoUrl: finalVideoUrl,
        ...(autoGeneratedStartFrameUrl ? { imageDataUrl: autoGeneratedStartFrameUrl } : {}),
        spaceUsed: node.displaySpace,
        nodeLabel: 'Cinema Video Engine',
        provider: node.provider,
        elapsedMs: Date.now() - started,
        translatedPrompt: fullPrompt,
        width: verifiedVideo.width,
        height: verifiedVideo.height,
        aspectRatio: safeRatio,
        progress: 100,
        mode: effectiveMode,
      });
      return;
    } catch {
      // Silent Tier 2 failover
    }
  }

  // TIER 3: Guaranteed Zero-Error Instant Cinema Motion Fallback (Cloudflare Workers AI scene frame + FFmpeg motion MP4)
  try {
    let fallbackImageDataUrl = autoGeneratedStartFrameUrl;
    if (!fallbackImageDataUrl && shouldUseSingleFrameI2v && normalizedRefs[0]) {
      fallbackImageDataUrl = `data:${normalizedRefs[0].mimeType};base64,${normalizedRefs[0].buffer.toString('base64')}`;
    }
    if (!fallbackImageDataUrl) {
      sendEvent({
        type: 'status',
        progress: 58,
        translatedPrompt: fullPrompt,
        message: 'Creating your video...',
      });
      if (autoFrameFailed) {
        fallbackImageDataUrl = await composeGuaranteedFallbackSceneFrame({
          aspectRatio: safeRatio,
          referenceBuffer: normalizedRefs[0]?.buffer,
          referenceMimeType: normalizedRefs[0]?.mimeType,
        });
      } else {
        try {
          const cfFrame = await runResilientImageGeneration({
            prompt: enhancedPrompt,
            style: String(style),
            aspectRatio: safeRatio,
            engine: 'flux-schnell',
            colabUrl: typeof colabUrl === 'string' ? colabUrl : undefined,
            allowGradioFallback: true,
            removeBackground: normalizedRefs.length > 0,
            referenceImages:
              normalizedRefs.length > 0
                ? normalizedRefs.map((r) => ({
                    imageUrl: r.imageUrl,
                    role: r.role,
                    label: r.label,
                    description: r.description,
                  }))
                : undefined,
          });
          fallbackImageDataUrl = cfFrame.imageDataUrl;
        } catch {
          fallbackImageDataUrl = await composeGuaranteedFallbackSceneFrame({
            aspectRatio: safeRatio,
            referenceBuffer: normalizedRefs[0]?.buffer,
            referenceMimeType: normalizedRefs[0]?.mimeType,
          });
        }
      }
    }

    const outDims =
      safeRatio === '9:16'
        ? { w: 720, h: 1280 }
        : safeRatio === '1:1'
        ? { w: 1024, h: 1024 }
        : safeRatio === '21:9'
        ? { w: 1344, h: 576 }
        : { w: 1280, h: 720 };

    if (clientMotionFallback) {
      sendEvent({
        type: 'complete',
        fallbackMotion: true,
        imageDataUrl: fallbackImageDataUrl,
        aspectRatio: safeRatio,
        width: outDims.w,
        height: outDims.h,
        cameraMotion: safeMotion,
        style: String(style),
        spaceUsed: 'cinema-motion-wasm',
        nodeLabel: 'Cinema Motion Engine',
        provider: 'cloudflare',
        elapsedMs: Date.now() - startedPipeline,
        translatedPrompt: fullPrompt,
        progress: 100,
        mode: normalizedRefs.length > 0 ? 'image-to-video' : 'text-to-video',
      });
      return;
    }

    sendEvent({
      type: 'status',
      progress: 82,
      translatedPrompt: fullPrompt,
      message: 'Creating your video...',
    });
    const renderedMotion = await renderServerCinemaMotionMp4({
      imageDataUrl: fallbackImageDataUrl,
      aspectRatio: safeRatio,
      cameraMotion: safeMotion,
      durationSeconds: 5,
    });
    const motionVideoUrl = serializeRenderedVideoUrl(
      renderedMotion.buffer,
      renderedMotion.mimeType,
      ''
    );
    sendEvent({
      type: 'complete',
      videoUrl: motionVideoUrl,
      imageDataUrl: fallbackImageDataUrl,
      fallbackMotion: true,
      spaceUsed: 'cinema-motion-server',
      nodeLabel: 'Cinema Motion Engine',
      provider: 'cloudflare',
      elapsedMs: Date.now() - startedPipeline,
      translatedPrompt: fullPrompt,
      width: renderedMotion.width,
      height: renderedMotion.height,
      aspectRatio: safeRatio,
      progress: 100,
      mode: normalizedRefs.length > 0 ? 'image-to-video' : 'text-to-video',
    });
    return;
  } catch {
    sendEvent({
      type: 'error',
      error: 'Video creation is temporarily busy. Please try again in a moment.',
    });
  }
}

async function streamLipsyncVideo(
  body: Record<string, unknown>,
  sendEvent: (event: Record<string, unknown>) => void
): Promise<void> {
  const { imageDataUrl, audioBase64, spaceId } = body;
  const imageBlob = typeof imageDataUrl === 'string' ? resolveImageInputToBlob(imageDataUrl) : null;
  const audioBlob = typeof audioBase64 === 'string' ? resolveAudioBase64ToBlob(audioBase64) : null;

  if (!imageBlob) {
    sendEvent({ type: 'error', error: 'Select or upload a character portrait first.' });
    return;
  }
  if (!audioBlob) {
    sendEvent({
      type: 'error',
      error: 'Record microphone audio or synthesize a WAV take to drive SadTalker lip-sync.',
    });
    return;
  }

  const customSpace =
    typeof spaceId === 'string' && SPACE_ID_RE.test(spaceId.trim()) ? spaceId.trim() : null;
  const liveLipsync = await discoverRunningLipsyncSpaces();
  const candidates = customSpace
    ? [customSpace, ...liveLipsync.filter((s) => s !== customSpace)]
    : liveLipsync;

  for (const candidate of candidates) {
    try {
      sendEvent({
        type: 'status',
        message: 'Creating your video...',
      });

      const client = await withTimeout(
        Client.connect(candidate, getHfGradioOptions()),
        12000,
        'Connection timed out.'
      );
      const api = await withTimeout(client.view_api(), 8000, 'API timed out.');
      const namedKeys = Object.keys(api.named_endpoints ?? {});
      const endpoint = namedKeys.find((k) => /test|talk|predict|run/i.test(k)) ?? namedKeys[0] ?? 0;
      const epInfo =
        typeof endpoint === 'string'
          ? api.named_endpoints?.[endpoint]
          : api.unnamed_endpoints?.[0];
      const paramsMeta = epInfo?.parameters ?? [];

      const payload: Record<string, unknown> = {};
      let attachedImg = false;
      let attachedAudio = false;

      for (const p of paramsMeta) {
        const name = p.parameter_name;
        if (!name || name === 'null') continue;
        const lower = name.toLowerCase();
        if (!attachedImg && (lower.includes('image') || p.component === 'Image')) {
          payload[name] = handle_file(imageBlob);
          attachedImg = true;
        } else if (!attachedAudio && (lower.includes('audio') || p.component === 'Audio')) {
          payload[name] = handle_file(audioBlob);
          attachedAudio = true;
        } else if (p.parameter_has_default) {
          payload[name] = p.parameter_default;
        }
      }

      const job = client.submit(
        endpoint,
        Object.keys(payload).length > 0 ? payload : [handle_file(imageBlob), handle_file(audioBlob)],
        null,
        null,
        true
      );

      let videoUrl: string | null = null;
      let hitZeroGpuLimit = false;
      const jobStart = Date.now();
      for await (const msg of job) {
        if (Date.now() - jobStart > 36000 && !videoUrl) {
          break;
        }
        if (msg.type === 'status') {
          sendEvent({
            type: 'status',
            message: 'Creating your video...',
          });
          if (msg.stage === 'error') {
            const errTxt =
              typeof msg.message === 'string' ? msg.message : JSON.stringify(msg.message ?? '');
            if (/zerogpu|quota|exceeded|limit|429/i.test(errTxt)) {
              hitZeroGpuLimit = true;
            }
            break;
          }
        } else if (msg.type === 'data') {
          videoUrl = extractGradioMediaUrl(msg.data);
          if (videoUrl) break;
        }
      }

      if (hitZeroGpuLimit) break;
      if (!videoUrl) continue;

      const vidRes = await withTimeout(
        fetch(videoUrl, { headers: getHfAuthHeadersForUrl(videoUrl) }),
        20000,
        'Lip-sync video download timed out.'
      );
      if (!vidRes.ok) {
        continue;
      }

      const mime = vidRes.headers.get('content-type') || 'video/mp4';
      const buf = Buffer.from(await vidRes.arrayBuffer());
      const finalVideoUrl = serializeRenderedVideoUrl(buf, mime, videoUrl);

      sendEvent({
        type: 'complete',
        videoUrl: finalVideoUrl,
        spaceUsed: candidate,
        nodeLabel: 'Cinema Voice Engine',
        mode: 'lipsync',
      });
      return;
    } catch {
      // Silent failover to next node or Tier 3
    }
  }

  // Tier 3 zero-error Cinema Motion fallback with synced voice audio
  const clientMotionFallback = body.clientMotionFallback === true;
  const fallbackAudioUrl =
    typeof audioBase64 === 'string' && audioBase64.startsWith('data:')
      ? audioBase64
      : typeof audioBase64 === 'string'
      ? `data:audio/wav;base64,${audioBase64}`
      : undefined;

  if (clientMotionFallback && typeof imageDataUrl === 'string') {
    sendEvent({
      type: 'complete',
      fallbackMotion: true,
      imageDataUrl,
      audioDataUrl: fallbackAudioUrl,
      aspectRatio: '16:9',
      cameraMotion: 'Slow Dolly In',
      spaceUsed: 'cinema-motion-wasm',
      nodeLabel: 'Cinema Motion Engine',
      provider: 'cloudflare',
      progress: 100,
      mode: 'lipsync',
    });
    return;
  }

  try {
    const rendered = await renderServerCinemaMotionMp4({
      imageDataUrl: String(imageDataUrl),
      aspectRatio: '16:9',
      cameraMotion: 'Slow Dolly In',
      audioDataUrl: fallbackAudioUrl,
      durationSeconds: 5,
    });
    sendEvent({
      type: 'complete',
      videoUrl: serializeRenderedVideoUrl(rendered.buffer, rendered.mimeType, ''),
      fallbackMotion: true,
      spaceUsed: 'cinema-motion-server',
      nodeLabel: 'Cinema Motion Engine',
      provider: 'cloudflare',
      progress: 100,
      mode: 'lipsync',
    });
  } catch {
    sendEvent({
      type: 'error',
      error: 'Video creation is temporarily busy. Please try again in a moment.',
    });
  }
}

async function streamTalkingSceneVideo(
  body: Record<string, unknown>,
  sendEvent: (event: Record<string, unknown>) => void
): Promise<void> {
  const {
    characterImageUrl,
    characterLabel = 'Character',
    coStarCharacters = [],
    shotAngle = 'close-up',
    backgroundImageUrl,
    backgroundPrompt = '',
    dialogue = '',
    voicePreset = 'female',
    voiceName,
    voiceStyleInstruction,
    voicePitch,
    voiceSpeed,
    customAudioBase64,
    actionPrompt = 'smiles warmly and gestures while speaking, slow zoom in',
    style = '3D Pixar-Style Cartoon',
    aspectRatio = '16:9',
    spaceId,
    colabUrl,
  } = body;

  const charBuf =
    typeof characterImageUrl === 'string' ? resolveImageInputToBuffer(characterImageUrl) : null;

  if (!charBuf) {
    sendEvent({
      type: 'error',
      error: 'Please upload or select a Character Image for Talking Scene mode.',
    });
    return;
  }

  const trimmedDialogue = typeof dialogue === 'string' ? dialogue.trim() : '';
  const hasCustomAudio = typeof customAudioBase64 === 'string' && customAudioBase64.trim().length > 32;

  if (!hasCustomAudio && trimmedDialogue.length < 2) {
    sendEvent({
      type: 'error',
      error: 'Type what the character should say (or upload/record a voice clip).',
    });
    return;
  }

  const safeShotAngle: TalkingShotAngle =
    shotAngle === 'two-shot' || shotAngle === 'over-shoulder' ? shotAngle : 'close-up';

  const normalizedCoStars: Array<{
    buffer: { buffer: Buffer; mimeType: string };
    label: string;
  }> = [];
  if (Array.isArray(coStarCharacters)) {
    for (const item of coStarCharacters.slice(0, 3)) {
      const typedItem = item as { imageUrl?: unknown; label?: unknown } | null;
      if (!typedItem || typeof typedItem.imageUrl !== 'string') continue;
      const b = resolveImageInputToBuffer(typedItem.imageUrl);
      if (b) {
        normalizedCoStars.push({
          buffer: b,
          label:
            typeof typedItem.label === 'string' && typedItem.label.trim()
              ? typedItem.label.trim()
              : 'Partner',
        });
      }
    }
  }

  const bgBuf =
    typeof backgroundImageUrl === 'string' && backgroundImageUrl.trim()
      ? resolveImageInputToBuffer(backgroundImageUrl)
      : null;

  let finalSceneImageUrl = String(characterImageUrl);
  const shouldComposite = Boolean(
    bgBuf ||
      (typeof backgroundPrompt === 'string' && backgroundPrompt.trim().length > 3) ||
      (safeShotAngle !== 'close-up' && normalizedCoStars.length > 0)
  );

  if (shouldComposite) {
    sendEvent({
      type: 'status',
      progress: 12,
      message: 'Creating your video...',
    });

    try {
      const compositePrompt = await buildTalkingSceneCompositingPrompt({
        characterBuffer: charBuf,
        characterLabel: String(characterLabel),
        coStarCharacters: normalizedCoStars,
        shotAngle: safeShotAngle,
        backgroundBuffer: bgBuf,
        backgroundPrompt: typeof backgroundPrompt === 'string' ? backgroundPrompt : '',
        actionPrompt: typeof actionPrompt === 'string' ? actionPrompt : '',
        style: String(style),
      });

      const compositeImg = await runResilientImageGeneration(
        {
          prompt: compositePrompt,
          style: String(style),
          aspectRatio: String(aspectRatio),
          engine: 'flux-schnell',
          colabUrl: typeof colabUrl === 'string' ? colabUrl : undefined,
        },
        (statusEvt) => {
          sendEvent({
            type: 'status',
            progress: Math.min(34, Math.max(16, Math.round(16 + (statusEvt.progress ?? 0) * 0.18))),
            message: 'Creating your video...',
          });
        }
      );

      finalSceneImageUrl = compositeImg.imageDataUrl;
    } catch (compErr) {
      console.warn(
        '[TalkingScene] Compositing fallback to character portrait:',
        compErr instanceof Error ? compErr.message : String(compErr)
      );
    }
  } else {
    sendEvent({
      type: 'status',
      progress: 28,
      message: 'Creating your video...',
    });
  }

  let audioBlob: Blob | null = null;
  let generatedAudioDataUrl: string | undefined;

  if (hasCustomAudio) {
    sendEvent({
      type: 'status',
      progress: 45,
      message: 'Creating your video...',
    });
    audioBlob = resolveAudioBase64ToBlob(String(customAudioBase64));
    generatedAudioDataUrl = String(customAudioBase64).startsWith('data:')
      ? String(customAudioBase64)
      : `data:audio/wav;base64,${String(customAudioBase64)}`;
  } else {
    const safeVoicePreset: TalkingVoicePreset =
      voicePreset === 'male' ||
      voicePreset === 'cartoon' ||
      voicePreset === 'mentor' ||
      voicePreset === 'bright'
        ? voicePreset
        : 'female';
    sendEvent({
      type: 'status',
      progress: 42,
      message: 'Creating your video...',
    });

    const ttsRes = await synthesizeTalkingVoiceAudio(trimmedDialogue, safeVoicePreset, {
      voiceName: typeof voiceName === 'string' ? voiceName : undefined,
      voiceStyle: typeof voiceStyleInstruction === 'string' ? voiceStyleInstruction : undefined,
      voicePitch: typeof voicePitch === 'number' ? voicePitch : undefined,
      voiceSpeed: typeof voiceSpeed === 'number' ? voiceSpeed : undefined,
    });
    audioBlob = resolveAudioBase64ToBlob(ttsRes.audioBase64);
    generatedAudioDataUrl = `data:${ttsRes.mimeType};base64,${ttsRes.audioBase64}`;
  }

  if (!audioBlob) {
    sendEvent({
      type: 'error',
      error: 'Could not prepare spoken audio track for lip-sync.',
    });
    return;
  }

  const finalImageBlob =
    resolveImageInputToBlob(finalSceneImageUrl) ?? resolveImageInputToBlob(String(characterImageUrl));
  if (!finalImageBlob) {
    sendEvent({
      type: 'error',
      error: 'Could not read composited character scene image.',
    });
    return;
  }

  sendEvent({
    type: 'status',
    progress: 60,
    message: 'Creating your video...',
  });

  const customSpace =
    typeof spaceId === 'string' && SPACE_ID_RE.test(spaceId.trim()) ? spaceId.trim() : null;
  const liveLipsync = await discoverRunningLipsyncSpaces();
  const candidates = customSpace
    ? [customSpace, ...liveLipsync.filter((s) => s !== customSpace)]
    : liveLipsync;

  const started = Date.now();

  for (let i = 0; i < Math.min(2, candidates.length); i++) {
    const candidate = candidates[i];
    try {
      sendEvent({
        type: 'status',
        progress: Math.min(72, 62 + i * 3),
        message: 'Creating your video...',
      });

      const client = await withTimeout(
        Client.connect(candidate, getHfGradioOptions()),
        10000,
        'Connection timed out.'
      );
      const api = await withTimeout(client.view_api(), 8000, 'API timed out.');
      const namedKeys = Object.keys(api.named_endpoints ?? {});
      const endpoint =
        namedKeys.find((k) => /test|talk|predict|run|infer/i.test(k)) ?? namedKeys[0] ?? 0;
      const epInfo =
        typeof endpoint === 'string'
          ? api.named_endpoints?.[endpoint]
          : api.unnamed_endpoints?.[0];
      const paramsMeta = epInfo?.parameters ?? [];

      const payload: Record<string, unknown> = {};
      let attachedImg = false;
      let attachedAudio = false;

      for (const p of paramsMeta) {
        const name = p.parameter_name;
        if (!name || name === 'null') continue;
        const lower = name.toLowerCase();
        if (!attachedImg && (lower.includes('image') || p.component === 'Image')) {
          payload[name] = handle_file(finalImageBlob);
          attachedImg = true;
        } else if (!attachedAudio && (lower.includes('audio') || p.component === 'Audio')) {
          payload[name] = handle_file(audioBlob);
          attachedAudio = true;
        } else if (lower === 'still' || lower === 'still_mode') {
          payload[name] = false;
        } else if (lower === 'preprocess') {
          payload[name] = shouldComposite ? 'full' : 'crop';
        } else if (lower.includes('expression')) {
          payload[name] = 1.15;
        } else if (p.parameter_has_default) {
          payload[name] = p.parameter_default;
        }
      }

      const job = client.submit(
        endpoint,
        Object.keys(payload).length > 0
          ? payload
          : [handle_file(finalImageBlob), handle_file(audioBlob)],
        null,
        null,
        true
      );

      let videoUrl: string | null = null;
      let hitZeroGpuLimit = false;
      const jobStart = Date.now();
      for await (const msg of job) {
        if (Date.now() - jobStart > 36000 && !videoUrl) {
          break;
        }
        if (msg.type === 'status') {
          sendEvent({
            type: 'status',
            progress: msg.stage === 'generating' ? 84 : 74,
            message: 'Creating your video...',
          });
          if (msg.stage === 'error') {
            const errTxt =
              typeof msg.message === 'string' ? msg.message : JSON.stringify(msg.message ?? '');
            if (/zerogpu|quota|exceeded|limit|429/i.test(errTxt)) {
              hitZeroGpuLimit = true;
            }
            break;
          }
        } else if (msg.type === 'data') {
          videoUrl = extractGradioMediaUrl(msg.data);
          if (videoUrl) break;
        }
      }

      if (hitZeroGpuLimit) break;
      if (!videoUrl) continue;

      sendEvent({
        type: 'status',
        progress: 94,
        message: 'Creating your video...',
      });

      const vidRes = await withTimeout(
        fetch(videoUrl, { headers: getHfAuthHeadersForUrl(videoUrl) }),
        20000,
        'Talking video download timed out.'
      );
      if (!vidRes.ok) {
        continue;
      }

      const mime = vidRes.headers.get('content-type') || 'video/mp4';
      const buf = Buffer.from(await vidRes.arrayBuffer());
      const finalVideoUrl = serializeRenderedVideoUrl(buf, mime, videoUrl);

      sendEvent({
        type: 'complete',
        videoUrl: finalVideoUrl,
        compositedImageDataUrl: finalSceneImageUrl,
        audioDataUrl: generatedAudioDataUrl,
        spaceUsed: candidate,
        nodeLabel: 'Cinema Voice Engine',
        elapsedMs: Date.now() - started,
        progress: 100,
        mode: 'lipsync',
      });
      return;
    } catch {
      // Silent failover to next node or Tier 3
    }
  }

  // Tier 3 zero-error Cinema Motion fallback with composited scene frame & synthesized voice audio
  const clientMotionFallback = body.clientMotionFallback === true;
  const safeTalkRatio = ALLOWED_RATIOS.includes(aspectRatio as (typeof ALLOWED_RATIOS)[number])
    ? String(aspectRatio)
    : '16:9';
  if (clientMotionFallback) {
    sendEvent({
      type: 'complete',
      fallbackMotion: true,
      imageDataUrl: finalSceneImageUrl,
      compositedImageDataUrl: finalSceneImageUrl,
      audioDataUrl: generatedAudioDataUrl,
      aspectRatio: safeTalkRatio,
      cameraMotion: 'Slow Dolly In',
      style: String(style),
      spaceUsed: 'cinema-motion-wasm',
      nodeLabel: 'Cinema Motion Engine',
      provider: 'cloudflare',
      elapsedMs: Date.now() - started,
      progress: 100,
      mode: 'lipsync',
    });
    return;
  }

  try {
    const rendered = await renderServerCinemaMotionMp4({
      imageDataUrl: finalSceneImageUrl,
      aspectRatio: safeTalkRatio,
      cameraMotion: 'Slow Dolly In',
      audioDataUrl: generatedAudioDataUrl,
      durationSeconds: 5,
    });
    sendEvent({
      type: 'complete',
      videoUrl: serializeRenderedVideoUrl(rendered.buffer, rendered.mimeType, ''),
      compositedImageDataUrl: finalSceneImageUrl,
      audioDataUrl: generatedAudioDataUrl,
      fallbackMotion: true,
      spaceUsed: 'cinema-motion-server',
      nodeLabel: 'Cinema Motion Engine',
      provider: 'cloudflare',
      elapsedMs: Date.now() - started,
      progress: 100,
      mode: 'lipsync',
    });
  } catch {
    sendEvent({
      type: 'error',
      error: 'Video creation is temporarily busy. Please try again in a moment.',
    });
  }
}

export async function handleGenerateVideoRequest(
  request: Request,
  forcedPipeline?: 'video' | 'lipsync' | 'talking-scene'
): Promise<Response> {
  try {
    const parsedBody = await parseJsonBody(request);
    if (!parsedBody.ok) return parsedBody.response;

    const body = parsedBody.data;
    const pipeline =
      forcedPipeline ||
      (body.action === 'lipsync'
        ? 'lipsync'
        : body.action === 'talking-scene'
        ? 'talking-scene'
        : 'video');

    return createSseStreamResponse(async (sendEvent) => {
      if (pipeline === 'lipsync') {
        await streamLipsyncVideo(body, sendEvent);
      } else if (pipeline === 'talking-scene') {
        await streamTalkingSceneVideo(body, sendEvent);
      } else {
        await streamStandardVideo(body, sendEvent);
      }
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Video generation request failed.' },
      { status: 500 }
    );
  }
}

export function handleGetClipRequest(request: Request, explicitClipId?: string): Response {
  try {
    const url = new URL(request.url);
    const clipId =
      explicitClipId ||
      url.pathname.split('/').filter(Boolean).pop() ||
      '';
    const entry = generatedClipCache.get(clipId);
    if (!entry) {
      return Response.json(
        { error: 'Generated video clip expired or not found.' },
        { status: 404 }
      );
    }

    const total = entry.buffer.length;
    const range = request.headers.get('range');
    const headers = new Headers({
      'Content-Type': entry.mimeType,
      'Accept-Ranges': 'bytes',
    });

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10) || 0;
      const end = parts[1] ? Math.min(total - 1, parseInt(parts[1], 10)) : total - 1;
      const chunk = entry.buffer.subarray(start, end + 1);
      headers.set('Content-Range', `bytes ${start}-${end}/${total}`);
      headers.set('Content-Length', String(chunk.length));
      return new Response(new Uint8Array(chunk), { status: 206, headers });
    }

    headers.set('Content-Length', String(total));
    return new Response(new Uint8Array(entry.buffer), { status: 200, headers });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Failed to serve video clip.' },
      { status: 500 }
    );
  }
}

export async function handleApiRoute(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/+$/, '') || '/';
    const method = request.method.toUpperCase();

    if (method === 'GET' && pathname === '/api/health') {
      return await handleHealthRequest();
    }

    if (method === 'GET' && pathname.startsWith('/api/hf/clip/')) {
      const clipId = pathname.slice('/api/hf/clip/'.length);
      return handleGetClipRequest(request, clipId);
    }

    if (method === 'POST') {
      switch (pathname) {
        case '/api/test-colab':
        case '/api/turbo/test-colab':
          return await handleTestColabRequest(request);
        case '/api/generate-script':
        case '/api/scripts/generate':
          return await handleGenerateScriptRequest(request);
        case '/api/scripts/refine-scene':
          return await handleGenerateScriptRequest(request, 'refine-scene');
        case '/api/storyboard/generate':
          return await handleGenerateScriptRequest(request, 'storyboard');
        case '/api/characters':
        case '/api/characters/generate':
          return await handleCharactersRequest(request);
        case '/api/characters/expression-sheet':
          return await handleCharactersRequest(request, 'expression-sheet');
        case '/api/voice':
        case '/api/voice/synthesize':
          return await handleVoiceRequest(request);
        case '/api/generate-image':
        case '/api/hf/generate-image':
          return await handleGenerateImageRequest(request);
        case '/api/remove-background':
        case '/api/hf/remove-background':
          return await handleRemoveBackgroundRequest(request);
        case '/api/hf/generate-image-stream':
          return await handleGenerateImageRequest(request, true);
        case '/api/generate-video':
        case '/api/hf/generate-video':
          return await handleGenerateVideoRequest(request);
        case '/api/hf/lipsync':
          return await handleGenerateVideoRequest(request, 'lipsync');
        case '/api/hf/talking-scene':
          return await handleGenerateVideoRequest(request, 'talking-scene');
        default:
          break;
      }
    }

    return Response.json(
      { error: `API endpoint not found: ${method} ${pathname}` },
      { status: 404 }
    );
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : 'Unexpected server error in API route.' },
      { status: 500 }
    );
  }
}
