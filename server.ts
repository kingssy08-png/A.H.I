import express from 'express';
import type { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { Client, handle_file } from '@gradio/client';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    const error = new Error(
      'GEMINI_API_KEY is not configured. Add it in the Settings > Secrets panel to enable Gemini generation.'
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
  const maybeStatus = (err as { statusCode?: number; status?: number })?.statusCode ??
    (err as { status?: number })?.status;

  if (maybeStatus === 503) {
    return { status: 503, message: raw };
  }
  if (raw.includes('API_KEY_INVALID') || raw.includes('PERMISSION_DENIED') || raw.includes('403')) {
    return {
      status: 403,
      message: 'Gemini API authentication failed. Please verify GEMINI_API_KEY in Settings > Secrets.',
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

const ALLOWED_STYLES = [
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

const SPACE_ID_RE = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/;
const FLUX_SPACES = [
  'black-forest-labs/FLUX.1-schnell',
  'stabilityai/stable-diffusion-3.5-large-turbo',
  'prodia/fast-stable-diffusion',
];
const SDXL_SPACES = [
  'stabilityai/stable-diffusion-3.5-large-turbo',
  'prodia/fast-stable-diffusion',
  'stabilityai/stable-diffusion-xl-base-1.0',
  'black-forest-labs/FLUX.1-schnell',
];
const VIDEO_SPACES_T2V = [
  'Lightricks/ltx-video-distilled',
  'alexnasa/ltx-2-TURBO',
  'zai-org/CogVideoX-5B-Space',
];
const VIDEO_SPACES_I2V = [
  'multimodalart/wan2-1-fast',
  'ysharma/wan2-1-fast',
  'Lightricks/ltx-video-distilled',
  'zerogpu-aoti/wan2-2-fp8da-aoti-faster',
  'r3gm/wan2-2-fp8da-aoti-preview',
  'zai-org/CogVideoX-5B-Space',
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
  'black-forest-labs/FLUX.1-schnell': 'Flux.1 HF Node',
  'stabilityai/stable-diffusion-3.5-large-turbo': 'SD 3.5 Turbo HF Node',
  'prodia/fast-stable-diffusion': 'Prodia Fast SD HF Node',
  'stabilityai/stable-diffusion-xl-base-1.0': 'SDXL Base HF Node',
  'Lightricks/ltx-video-distilled': 'LTX-Video Distilled (Fast 10–25s)',
  'multimodalart/wan2-1-fast': 'Wan 2.1 Fast Turbo (4-Step)',
  'ysharma/wan2-1-fast': 'Wan 2.1 Fast I2V (4-Step)',
  'alexnasa/ltx-2-TURBO': 'LTX-2 Turbo Fast Node',
  'zerogpu-aoti/wan2-2-fp8da-aoti-faster': 'Wan 2.2 Fast ZeroGPU Node',
  'r3gm/wan2-2-fp8da-aoti-preview': 'Wan 2.2 Preview ZeroGPU Node',
  'zai-org/CogVideoX-5B-Space': 'CogVideoX-5B Community Node',
  'KwaiVGI/LivePortrait': 'LivePortrait Expression Node',
  'vinthony/SadTalker': 'SadTalker Talking-Head Node',
  'fffiloni/SadTalker': 'SadTalker Mirror Node',
  'BadToBest/EchoMimic': 'EchoMimic Portrait Node',
  'fudan-generative-ai/hallo': 'Hallo Portrait Lip-Sync Node',
};

function getNodeLabel(space: string): string {
  return SPACE_NODE_LABELS[space] ?? space;
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
  if (/upscaler|lora|trainer|extract|caption|demo-blank|bench|dataset/i.test(id)) return false;
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

  const curatedPriority = mode === 'image-to-video' ? VIDEO_SPACES_I2V : VIDEO_SPACES_T2V;
  const searchTerms =
    mode === 'image-to-video'
      ? ['wan2-1', 'wan2-2', 'ltx-video', 'image-to-video']
      : ['ltx-video', 'cogvideo', 'text-to-video', 'wan2'];

  try {
    const [searchResults, curatedStatuses] = await Promise.all([
      Promise.allSettled(searchTerms.map((term) => queryHfHubSpaces(term, 12))),
      Promise.allSettled(curatedPriority.map((id) => fetchSingleHfSpaceStatus(id))),
    ]);

    const discoveredMap = new Map<string, { id: string; likes: number; hasGpu: boolean; curatedRank: number }>();

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
        if (a.curatedRank !== b.curatedRank) return a.curatedRank - b.curatedRank;
        if (a.hasGpu !== b.hasGpu) return a.hasGpu ? -1 : 1;
        return b.likes - a.likes;
      })
      .map((entry) => entry.id)
      .slice(0, 8);

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
    ? ['stable-diffusion-3.5', 'stable-diffusion-xl']
    : ['FLUX.1-schnell', 'flux'];

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
      if (/video|i2v|t2v|upscaler|lora|trainer/i.test(id)) return;
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

const STYLE_PROMPT_DIRECTIVES: Record<string, string> = {
  '3D Pixar-Style Cartoon':
    '3D Pixar-style animated feature film aesthetic, tactile subsurface skin and fur scattering, expressive eyes with crisp catchlights, warm studio rim lighting, shallow 35mm depth-of-field',
  '3D Cartoon':
    '3D animated cartoon feature aesthetic, subsurface shader softness, expressive silhouettes, vibrant color grading, warm rim highlights',
  Anime:
    'high-budget theatrical anime animation, crisp cel-shaded linework, luminous atmospheric sky, expressive motion streaks',
  'Cinematic Film':
    '35mm anamorphic cinema film look, moody chiaroscuro volumetric light shafts, rich contrast, subtle filmic bokeh',
  '2D Illustration':
    'hand-crafted 2D editorial illustration aesthetic, rich gouache brushwork, layered storybook depth',
  'Music Video':
    'high-energy stylized music video cinematography, kinetic gimbal choreography, vibrant neon & rim lighting, anamorphic lens flare',
  'Product Ad':
    'luxury commercial product studio macro photography, sleek brushed metal & glass specular highlights, obsidian pedestal reflections, shallow depth of field',
  Realistic:
    'photorealistic live-action cinema camera aesthetic, physically accurate reflections, natural lens clarity',
  Educational:
    'clean 2.5D educational motion graphics explainer aesthetic, crisp geometric clarity, high visual contrast',
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

function buildTranslatedImagePrompt(prompt: string, style: string): string {
  const styleCue = STYLE_PROMPT_DIRECTIVES[style] ?? `${style} visual aesthetic`;
  return `${prompt.trim().slice(0, 720)}, ${styleCue}, razor-sharp detail, balanced studio lighting, clean framing, no text, no watermark`;
}

function buildTranslatedVideoPrompt(
  prompt: string,
  style: string,
  aspectRatio: string,
  cameraMotion: string
): string {
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

async function runCloudflareFluxImage(
  fullPrompt: string,
  aspectRatio: string,
  accountId: string,
  apiToken: string
): Promise<{ imageDataUrl: string; elapsedMs: number }> {
  const started = Date.now();
  const ratioCue =
    aspectRatio === '1:1'
      ? ''
      : aspectRatio === '9:16'
      ? ', vertical 9:16 portrait composition'
      : aspectRatio === '21:9'
      ? ', ultra-wide 21:9 anamorphic framing'
      : ', widescreen 16:9 cinema composition';
  const promptText = `${fullPrompt}${ratioCue}`.slice(0, 2000);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 18000);

  try {
    const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(
      accountId
    )}/ai/run/@cf/black-forest-labs/flux-1-schnell`;

    const cfRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: promptText,
        steps: 4,
      }),
      signal: controller.signal,
    });

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
          : `Cloudflare Workers AI returned HTTP ${cfRes.status}${errBody ? `: ${errBody.slice(0, 140)}` : ''}`
      );
    }

    const rawBuf = Buffer.from(await cfRes.arrayBuffer());
    const binaryMime = detectImageBufferMime(rawBuf, contentType);
    if (binaryMime && rawBuf.length > 64) {
      return {
        imageDataUrl: `data:${binaryMime};base64,${rawBuf.toString('base64')}`,
        elapsedMs: Date.now() - started,
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
      throw new Error('Unexpected non-image response from Cloudflare Workers AI');
    }

    const rawImage = json.result?.image ?? json.image;
    if (!rawImage || json.success === false) {
      const errMsg = json.errors?.[0]?.message || 'Empty response from Cloudflare Workers AI';
      throw new Error(errMsg);
    }

    const imageDataUrl = rawImage.startsWith('data:image/')
      ? rawImage
      : `data:${detectBase64ImageMime(rawImage)};base64,${rawImage}`;
    return {
      imageDataUrl,
      elapsedMs: Date.now() - started,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function runDirectHuggingFaceImage(
  fullPrompt: string,
  dims: { w: number; h: number },
  useSdxl: boolean,
  hfToken: string
): Promise<{ imageDataUrl: string; modelUsed: string; elapsedMs: number }> {
  const started = Date.now();
  const models = useSdxl
    ? ['stabilityai/stable-diffusion-xl-base-1.0', 'black-forest-labs/FLUX.1-schnell']
    : ['black-forest-labs/FLUX.1-schnell', 'stabilityai/stable-diffusion-xl-base-1.0'];

  let lastErr = 'Hugging Face Inference API unavailable';
  for (const modelId of models) {
    const endpoints = [
      `https://router.huggingface.co/hf-inference/models/${modelId}`,
      `https://api-inference.huggingface.co/models/${modelId}`,
    ];

    for (const url of endpoints) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 18000);
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${hfToken}`,
            'Content-Type': 'application/json',
            Accept: 'image/png',
          },
          body: JSON.stringify({
            inputs: fullPrompt.slice(0, 1500),
            parameters: {
              width: dims.w,
              height: dims.h,
              num_inference_steps: modelId.includes('FLUX.1-schnell') ? 4 : 20,
            },
            options: { wait_for_model: true },
          }),
          signal: controller.signal,
        });

        const rawBuf = Buffer.from(await res.arrayBuffer());
        if (!res.ok) {
          const textErr = rawBuf.toString('utf-8').slice(0, 160);
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
  }

  throw new Error(lastErr);
}

async function runPollinationsFreeImage(
  fullPrompt: string,
  dims: { w: number; h: number }
): Promise<{ imageDataUrl: string; elapsedMs: number }> {
  const started = Date.now();
  const clampedW = Math.min(1280, Math.max(512, dims.w));
  const clampedH = Math.min(1280, Math.max(512, dims.h));
  const seed = Math.floor(Math.random() * 1_000_000_000);
  const encodedPrompt = encodeURIComponent(fullPrompt.slice(0, 900));

  const urls = [
    `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${clampedW}&height=${clampedH}&nologo=true&seed=${seed}&model=flux`,
    `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&nologo=true&seed=${seed}`,
  ];

  let lastErr = 'Free open-source image endpoint unavailable';
  for (const url of urls) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 22000);
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'image/*' },
        signal: controller.signal,
      });
      if (!res.ok) {
        lastErr = `Pollinations returned HTTP ${res.status}`;
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      const mime = detectImageBufferMime(buf, res.headers.get('content-type') || '');
      if (mime && buf.length > 100) {
        return {
          imageDataUrl: `data:${mime};base64,${buf.toString('base64')}`,
          elapsedMs: Date.now() - started,
        };
      }
      lastErr = 'Pollinations returned invalid image data';
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
    const assetsDir = path.resolve(__dirname, 'src/assets/images');
    const fileName = imageInput.slice('/src/assets/images/'.length);
    const resolved = path.resolve(assetsDir, fileName);
    if (resolved.startsWith(assetsDir + path.sep) && fs.existsSync(resolved)) {
      const buffer = fs.readFileSync(resolved);
      const ext = path.extname(resolved).toLowerCase();
      const mimeType =
        ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
      return { buffer, mimeType };
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

  const expandedFallback = expandPlainEnglishCameraDirections(trimmedPrompt);
  const fallbackPrompt =
    refs.length > 0
      ? `${expandedFallback}. Visual identity & environment details: ${metadataSummary}`
      : expandedFallback;

  // Multi-image references (2+) or non-exact-frame uploads strictly use prompt-driven camera & action
  const allowExactSingleFrame = Boolean(animateExactFrame && refs.length === 1);

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return {
      enhancedPrompt: fallbackPrompt,
      useExactStartFrame: allowExactSingleFrame,
    };
  }

  const ai = getGeminiClient();
  const parts: Array<
    { inlineData: { mimeType: string; data: string } } | { text: string }
  > = [];

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
      `1. Expand the user's plain-English camera & acting directions into rich 3D animation direction prompts (for example, "camera moves from the back to the front" -> "smooth 180-degree camera orbit starting behind the subject and sweeping smoothly around to the front with shallow 35mm depth-of-field", or "looks around in wonder" -> "expressive eye movement scanning the glowing horizon with subtle brow raises, gentle breathing motion, and warm subsurface skin/fur scattering").`,
      `2. Specify cinema depth-of-field, subsurface skin/fur scattering (when animated), expressive facial/eye acting, warm rim lighting, and smooth continuous camera trajectories.`,
      `3. Keep EVERY detail, action, subject, and angle the user wrote intact — never override or soften their camera trajectory.`,
      refs.length > 0
        ? `4. Treat ALL ${refs.length} uploaded reference image(s) strictly as visual identity, character, outfit, prop, and environment/style references (NEVER do start-to-end frame interpolation). Extract exact facial features, hair, outfit colors/fabrics, props, and background/lighting details from them directly into the text description so Wan 2.1 / CogVideoX preserves complete visual consistency.`
        : `4. Add rich lighting, motion continuity, and atmospheric clarity matching the ${style} aesthetic.`,
      `5. Set canStartFromSingleImageFrame to true ONLY if there is 1 reference image AND the user's prompt starts directly from that exact composition without requesting a different starting angle (like from behind, back-to-front, aerial, or different framing). For multi-image references or differing starting angles, set it to false.`,
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
            systemInstruction:
              'You are a Smart 3D Cinematography & Acting Director for AI video generators (Wan 2.1, CogVideoX, LTX-Video). Preserve 100% of the user prompt intent, expand plain-English camera and acting cues into lush animation direction specifying depth-of-field, subsurface skin/fur scattering, expressive eye movement, and smooth camera paths, while weaving visual identity details from all reference images into one cohesive prompt.',
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

type TalkingShotAngle = 'two-shot' | 'close-up' | 'over-shoulder';
type TalkingVoicePreset = 'male' | 'female' | 'cartoon' | 'mentor' | 'bright';

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

  const shotFramingDirective =
    shotAngle === 'two-shot' && coStarCharacters.length > 0
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

  const fallbackComposite = [
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
  const parts: Array<
    { inlineData: { mimeType: string; data: string } } | { text: string }
  > = [
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
        : `Background Setting: Cinematic atmospheric studio matching the scene`,
      `Visual Style: ${style}`,
      `Action / Expression / Camera Direction: ${
        actionPrompt?.trim() || 'speaks warmly with natural expressive face'
      }`,
      `LIGHTING & SHADOW RULE: Seamlessly composite the character(s) into the background with matching 3D rim-lighting, warm ambient bounce, and grounded contact shadows.`,
      `CRITICAL LIP-SYNC RULE: Keep ONLY the ACTIVE SPEAKING CHARACTER's face sharp, unobstructed, well-lit, and oriented toward the camera so portrait lip-sync animates their mouth cleanly.`,
      `Preserve EVERY visual identity detail (hair, eyes, skin tone, outfit colors, accessories). Output plain prompt text only.`,
    ].join('\n'),
  });

  for (const model of ['gemini-4-hydrogen', 'gemini-3.1-flash-lite']) {
    try {
      const response = await withTimeout(
        ai.models.generateContent({
          model,
          contents: { parts },
          config: {
            systemInstruction:
              'You are a lead visual compositing and cinema shot-reverse-shot supervisor. Write one clean Flux/SDXL image prompt blending the speaker(s) into the shared background with matching 3D rim-lighting, contact shadows, and sharp speaker facial framing.',
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
          voiceLabel: spec.voiceName,
        };
      }
    } catch (err) {
      console.warn(
        '[TalkingSceneTTS] Gemini TTS unavailable, trying open-source HF TTS:',
        err instanceof Error ? err.message.slice(0, 140) : String(err)
      );
    }
  }

  // Fallback to free public Hugging Face TTS Space via @gradio/client
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
        client.predict(endpoint, Object.keys(payload).length > 0 ? payload : [dialogue.trim().slice(0, 400)]),
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

export function createApiApp() {
  const app = express();
  app.use(express.json({ limit: '25mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    const hasApiKey = Boolean(process.env.GEMINI_API_KEY?.trim());
    const hasCloudflareAi = Boolean(getCloudflareCredentials());
    const hasHfToken = Boolean(getHfToken());
    const missingEnv: string[] = [];
    if (!hasApiKey) missingEnv.push('GEMINI_API_KEY');
    if (!hasHfToken) missingEnv.push('HF_TOKEN');
    if (!hasCloudflareAi) missingEnv.push('CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN');

    res.json({
      ok: true,
      hasApiKey,
      hasCloudflareAi,
      hasHfToken,
      missingEnv,
    });
  });

  // Verify a user-supplied private Google Colab Gradio URL (Turbo GPU Mode)
  app.post('/api/turbo/test-colab', async (req: Request, res: Response) => {
    const validated = validateColabGradioUrl(req.body?.colabUrl);
    if (!validated) {
      res.status(400).json({
        error:
          'Enter a valid HTTPS Gradio live URL (for example, https://abc123.gradio.live from Google Colab share=True).',
      });
      return;
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
      res.json({
        ok: true,
        normalizedUrl: validated.url,
        host: validated.host,
        endpoints,
        latencyMs: Date.now() - started,
      });
    } catch (err) {
      res.status(502).json({
        error:
          err instanceof Error
            ? err.message
            : 'Could not reach the Google Colab Gradio URL.',
      });
    }
  });

  app.post('/api/scripts/generate', async (req: Request, res: Response) => {
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
      } = req.body ?? {};

      if (typeof storyIdea !== 'string' || storyIdea.trim().length < 5) {
        res.status(400).json({ error: 'Please provide a story idea of at least 5 characters.' });
        return;
      }

      const bibleStyle =
        showBible && typeof showBible.visualStyle === 'string' && showBible.lockVisualStyle
          ? showBible.visualStyle
          : style;
      const safeStyle = ALLOWED_STYLES.includes(bibleStyle) ? bibleStyle : '3D Pixar-Style Cartoon';
      const safeRatio = ALLOWED_RATIOS.includes(aspectRatio) ? aspectRatio : '16:9';
      const safeMotion = ALLOWED_CAMERA_MOTIONS.includes(cameraMotion) ? cameraMotion : 'Auto';
      const safeDuration = Math.min(180, Math.max(15, Number(targetDurationSeconds) || 45));
      const desiredScenes = kidsShowMode
        ? Math.min(8, Math.max(5, Math.round(safeDuration / 7)))
        : Math.min(8, Math.max(3, Math.round(safeDuration / 8)));

      const characterContext = Array.isArray(characters) && characters.length > 0
        ? `Cast characters available to assign to scenes (use exact character names & ids):\n${characters
            .slice(0, 8)
            .map((c: { id?: string; name?: string; role?: string; appearancePrompt?: string; voiceArchetype?: string }) =>
              `- [${String(c.id ?? '')}] ${String(c.name ?? 'Character')} (${String(c.role ?? 'Role')}${c.voiceArchetype ? `, Voice: ${c.voiceArchetype}` : ''}): ${String(c.appearancePrompt ?? '')}`
            )
            .join('\n')}`
        : 'Invent memorable characters appropriate to the story.';

      const showBibleBlock = showBible
        ? [
            `SHOW BIBLE MEMORY (Maintain strict series continuity):`,
            `- Series Title: ${String(showBible.showTitle || 'A.H.I Animated Series').slice(0, 120)}`,
            `- Visual Style: ${safeStyle}`,
            `- World Setting: ${String(showBible.worldSetting || '').slice(0, 800)}`,
            `- Target Age Group: ${String(showBible.targetAgeGroup || 'Ages 6-8 (Early Kids)').slice(0, 40)}`,
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
        `- Write lush 3D animation visualPrompt descriptions specifying subsurface skin/fur scattering, expressive eye movement, warm rim lighting, depth-of-field, and smooth camera paths (no text overlays or watermarks).`,
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

      res.json(generatedJson);
    } catch (err) {
      const { status, message } = formatGeminiError(err);
      res.status(status).json({ error: message });
    }
  });

  app.post('/api/scripts/refine-scene', async (req: Request, res: Response) => {
    try {
      const { scene, instruction, style = '3D Cartoon', projectTitle = '' } = req.body ?? {};
      if (!scene || typeof instruction !== 'string' || instruction.trim().length < 2) {
        res.status(400).json({ error: 'Scene data and a refinement instruction are required.' });
        return;
      }

      const ai = getGeminiClient();
      const prompt = [
        `Project: "${String(projectTitle).slice(0, 140)}" (${String(style)})`,
        `Current Scene JSON:\n${JSON.stringify(scene)}`,
        `Director's Revision Instruction:\n${instruction.trim().slice(0, 1000)}`,
        `Revise this single scene while preserving its sceneNumber (${Number(scene.sceneNumber) || 1}) and maintaining visual continuity.`,
      ].join('\n\n');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction:
            'You are an animation script doctor. Apply the director instruction precisely and return the updated scene JSON.',
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
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

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json(parsed);
    } catch (err) {
      const { status, message } = formatGeminiError(err);
      res.status(status).json({ error: message });
    }
  });

  app.post('/api/characters/generate', async (req: Request, res: Response) => {
    try {
      const { concept, styleAffinity = '3D Cartoon' } = req.body ?? {};
      if (typeof concept !== 'string' || concept.trim().length < 3) {
        res.status(400).json({ error: 'Please describe a character concept.' });
        return;
      }

      const safeStyle = ALLOWED_STYLES.includes(styleAffinity) ? styleAffinity : '3D Cartoon';
      const ai = getGeminiClient();

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: `Design an animation character sheet in the "${safeStyle}" style for this concept:\n${concept.trim().slice(0, 1200)}`,
        config: {
          systemInstruction:
            'You are a lead character designer for animation studios. Produce cohesive character profiles with vivid visual prompts, 3 personality traits, 4 hex colors, and a matching voice preset (one of Kore, Puck, Charon, Fenrir, Zephyr).',
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
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

      const parsed = JSON.parse((response.text ?? '{}').trim());
      if (!ALLOWED_VOICES.includes(parsed.voiceName)) {
        parsed.voiceName = 'Kore';
      }
      res.json({ ...parsed, styleAffinity: safeStyle });
    } catch (err) {
      const { status, message } = formatGeminiError(err);
      res.status(status).json({ error: message });
    }
  });

  // 4-View Character Consistency & Turnaround Sheet Generator (Happy, Surprised, Determined, Side/Back)
  app.post('/api/characters/expression-sheet', async (req: Request, res: Response) => {
    try {
      const {
        name = 'Character',
        appearancePrompt = '',
        styleAffinity = '3D Pixar-Style Cartoon',
        avatarImageUrl,
        colabUrl,
      } = req.body ?? {};

      const safeStyle = ALLOWED_STYLES.includes(styleAffinity)
        ? styleAffinity
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
        res.status(503).json({
          error: 'Image nodes are currently busy. Please retry generating the 4-view sheet.',
        });
        return;
      }

      res.json({ expressions, visualDna });
    } catch (err) {
      res.status(500).json({
        error:
          err instanceof Error
            ? err.message
            : 'Could not generate 4-view expression & turnaround sheet.',
      });
    }
  });

  app.post('/api/voice/synthesize', async (req: Request, res: Response) => {
    try {
      const {
        text,
        voiceName = 'Kore',
        styleInstruction = 'Clear, expressive animation narrator',
      } = req.body ?? {};

      if (typeof text !== 'string' || text.trim().length < 2) {
        res.status(400).json({ error: 'Please provide dialogue or narration text to synthesize.' });
        return;
      }

      const safeVoice = ALLOWED_VOICES.includes(voiceName) ? voiceName : 'Kore';
      const ai = getGeminiClient();

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash-lite-tts',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: text.trim().slice(0, 1500),
                speechMetadata: {
                  style: String(styleInstruction).slice(0, 200),
                },
              },
            ],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: safeVoice },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        res.status(502).json({ error: 'Gemini TTS returned an empty audio payload.' });
        return;
      }

      res.json({
        audioBase64: base64Audio,
        mimeType: 'audio/wav',
        voiceName: safeVoice,
      });
    } catch (err) {
      const { status, message } = formatGeminiError(err);
      res.status(status).json({ error: message });
    }
  });

const SVG_VIEWBOX_BY_RATIO: Record<string, { w: number; h: number }> = {
  '16:9': { w: 640, h: 360 },
  '9:16': { w: 360, h: 640 },
  '1:1': { w: 480, h: 480 },
  '21:9': { w: 756, h: 324 },
};

function sanitizeSvgMarkup(rawSvg: string, width: number, height: number): string {
  let svg = String(rawSvg || '').trim();
  const startIdx = svg.indexOf('<svg');
  const endIdx = svg.lastIndexOf('</svg>');
  if (startIdx !== -1 && endIdx !== -1) {
    svg = svg.slice(startIdx, endIdx + 6);
  } else {
    svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="#12151E"/><circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(width, height) * 0.22}" fill="#F59E0B" opacity="0.25"/><rect x="${width * 0.15}" y="${height * 0.2}" width="${width * 0.7}" height="${height * 0.6}" rx="8" fill="none" stroke="#38BDF8" stroke-width="2" stroke-dasharray="6 6"/></svg>`;
  }

  // Strip dangerous tags, inline event handlers, and scriptable URIs
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

  app.post('/api/storyboard/generate', async (req: Request, res: Response) => {
    try {
      const {
        scene,
        style = '3D Cartoon',
        aspectRatio = '16:9',
        projectTitle = '',
      } = req.body ?? {};

      if (!scene || typeof scene.visualPrompt !== 'string') {
        res.status(400).json({ error: 'Scene details with a visual description are required.' });
        return;
      }

      const safeStyle = ALLOWED_STYLES.includes(style) ? style : '3D Cartoon';
      const safeRatio = ALLOWED_RATIOS.includes(aspectRatio) ? aspectRatio : '16:9';
      const dims = SVG_VIEWBOX_BY_RATIO[safeRatio] ?? SVG_VIEWBOX_BY_RATIO['16:9'];
      const ai = getGeminiClient();

      const styleVisualDirective: Record<string, string> = {
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
        `Generate a 3-keyframe animated storyboard sequence for Scene ${Number(scene.sceneNumber) || 1}: "${String(scene.title || 'Scene')}" from "${String(projectTitle).slice(0, 100)}".`,
        `Animation Style: ${safeStyle}`,
        `Style Visual Rules: ${styleVisualDirective[safeStyle] || styleVisualDirective['3D Cartoon']}`,
        `Aspect Ratio / SVG Canvas: viewBox="0 0 ${dims.w} ${dims.h}"`,
        `Camera Angle: ${String(scene.cameraAngle || 'Medium Shot')}`,
        `Lighting Mood: ${String(scene.lightingMood || 'Cinematic dusk')}`,
        `Action Description: ${String(scene.actionDescription || '').slice(0, 600)}`,
        `Visual Prompt: ${String(scene.visualPrompt || '').slice(0, 800)}`,
        `Return 3 sequential keyframes representing: (1) Opening Frame, (2) Peak Action Beat, (3) Closing / Transition Frame.`,
        `Each keyframe's svgMarkup MUST be a complete, self-contained valid <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dims.w} ${dims.h}">...</svg> using rich multi-layered vector art (defs linearGradient/radialGradient, sky/backdrop, midground architecture/environment, stylized character silhouettes/poses, lighting glows, subtle camera framing brackets or motion arrows—with NO <script> or external image URLs). Make each keyframe visibly distinct to show shot progression!`,
      ].join('\n\n');

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction:
            'You are a senior storyboard artist and visual development director. Craft expressive, clean multi-layered SVG storyboard keyframes that accurately depict the scene action, camera blocking, and chosen animation style.',
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
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
                    beatLabel: { type: Type.STRING, description: 'e.g. Opening Frame, Action Beat, Closing Beat' },
                    caption: { type: Type.STRING, description: 'Brief visual caption of what happens in this keyframe.' },
                    cameraMotion: { type: Type.STRING, description: 'e.g. Slow Dolly In, Pan Right, Static Hold' },
                    svgMarkup: { type: Type.STRING, description: 'Complete self-contained SVG markup.' },
                  },
                  required: ['beatLabel', 'caption', 'cameraMotion', 'svgMarkup'],
                },
              },
            },
            required: ['sketchNotes', 'paletteHexes', 'keyframes'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      const rawFrames = Array.isArray(parsed.keyframes) ? parsed.keyframes.slice(0, 3) : [];
      const sanitizedFrames = rawFrames.map(
        (kf: { beatLabel?: string; caption?: string; cameraMotion?: string; svgMarkup?: string }, idx: number) => ({
          id: `kf-${Date.now()}-${idx}`,
          beatLabel: String(kf.beatLabel || `Keyframe ${idx + 1}`),
          caption: String(kf.caption || ''),
          cameraMotion: String(kf.cameraMotion || 'Static Hold'),
          svgMarkup: sanitizeSvgMarkup(String(kf.svgMarkup || ''), dims.w, dims.h),
        })
      );

      res.json({
        sketchNotes: String(parsed.sketchNotes || ''),
        paletteHexes: Array.isArray(parsed.paletteHexes) ? parsed.paletteHexes.slice(0, 5) : ['#0F172A', '#F59E0B', '#38BDF8', '#E2E8F0'],
        keyframes: sanitizedFrames,
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      const { status, message } = formatGeminiError(err);
      res.status(status).json({ error: message });
    }
  });

  // Serve cached Hugging Face video clips with Range support for <video> and FFmpeg.wasm
  app.get('/api/hf/clip/:clipId', (req: Request, res: Response) => {
    const clipId = String(req.params.clipId || '');
    const entry = generatedClipCache.get(clipId);
    if (!entry) {
      res.status(404).json({ error: 'Generated video clip expired or not found.' });
      return;
    }

    const total = entry.buffer.length;
    const range = req.headers.range;
    res.setHeader('Content-Type', entry.mimeType);
    res.setHeader('Accept-Ranges', 'bytes');

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10) || 0;
      const end = parts[1] ? Math.min(total - 1, parseInt(parts[1], 10)) : total - 1;
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
      res.setHeader('Content-Length', String(end - start + 1));
      res.end(entry.buffer.subarray(start, end + 1));
      return;
    }

    res.setHeader('Content-Length', String(total));
    res.end(entry.buffer);
  });

  interface ImageGenResult {
    imageDataUrl: string;
    spaceUsed: string;
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
    extraAllowedHost?: string
  ): Promise<{ imageDataUrl: string }> {
    const clientOptions = extraAllowedHost ? undefined : getHfGradioOptions();
    const client = await withTimeout(
      Client.connect(target, clientOptions),
      13000,
      `${nodeLabel} connection timed out.`
    );
    const api = await withTimeout(
      client.view_api(),
      9000,
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

    // If a private Colab node is running a video-only Gradio app, skip immediately for image requests
    const returnsMeta = epInfo?.returns ?? [];
    if (
      extraAllowedHost &&
      returnsMeta.some((r) => /video/i.test(String(r.component))) &&
      !returnsMeta.some((r) => /image/i.test(String(r.component)))
    ) {
      throw new Error('Colab GPU node is configured for video generation.');
    }

    const paramsMeta = epInfo?.parameters ?? [];

    const isTurboOrSd =
      target.includes('stable-diffusion-3.5') || target.includes('prodia');
    const payload: Record<string, unknown> = {};

    for (const p of paramsMeta) {
      const name = p.parameter_name;
      if (!name) continue;
      const lower = name.toLowerCase();
      if (
        (lower === 'prompt' || lower === 'positive_prompt' || lower === 'text') &&
        !lower.includes('negative')
      ) {
        payload[name] = fullPrompt;
      } else if (lower.includes('negative')) {
        payload[name] = 'text, watermark, signature, blurry, low quality, artifacts';
      } else if (lower === 'randomize_seed') {
        payload[name] = true;
      } else if (lower === 'width') {
        payload[name] = dims.w;
      } else if (lower === 'height') {
        payload[name] = dims.h;
      } else if (lower === 'num_inference_steps' || lower === 'steps') {
        payload[name] = isTurboOrSd ? 8 : useSdxl ? 25 : 4;
      } else if (lower === 'guidance_scale' || lower === 'cfg' || lower === 'cfg_scale') {
        payload[name] = isTurboOrSd ? 1.5 : useSdxl ? 7 : 0;
      } else if (p.parameter_has_default) {
        payload[name] = p.parameter_default;
      }
    }

    const result = await withTimeout(
      client.predict(endpoint, Object.keys(payload).length > 0 ? payload : [fullPrompt]),
      35000,
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

  async function runResilientImageGeneration(
    options: {
      prompt: string;
      style: string;
      aspectRatio: string;
      engine: string;
      spaceId?: string;
      colabUrl?: string;
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
    const dims = IMAGE_DIMENSIONS_BY_RATIO[safeRatio] ?? IMAGE_DIMENSIONS_BY_RATIO['16:9'];
    const useSdxl = options.engine === 'sdxl';
    const liveSpaces = await discoverRunningImageSpaces(useSdxl);

    const customSpace =
      typeof options.spaceId === 'string' && SPACE_ID_RE.test(options.spaceId.trim())
        ? options.spaceId.trim()
        : null;
    const hfCandidates = customSpace
      ? [customSpace, ...liveSpaces.filter((s) => s !== customSpace)]
      : liveSpaces;

    const fullPrompt = buildTranslatedImagePrompt(options.prompt, options.style);
    const cfCreds = !useSdxl ? getCloudflareCredentials() : null;
    const hfToken = getHfToken();
    const validColab = validateColabGradioUrl(options.colabUrl);

    const totalSteps =
      (validColab ? 1 : 0) +
      (cfCreds ? 1 : 0) +
      (hfToken ? 1 : 0) +
      hfCandidates.length +
      1;
    let stepNum = 0;
    let lastError = `All free ${useSdxl ? 'SDXL / SD 3.5' : 'Flux.1'} nodes are currently busy.`;

    // Priority 0: Optional Private Google Colab Turbo GPU URL
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
        message: `Connected to Private Colab Turbo GPU (${validColab.host}) · Rendering zero-queue...`,
      });
      try {
        const resImg = await tryGradioImageEndpoint(
          validColab.url,
          nodeLabel,
          fullPrompt,
          dims,
          useSdxl,
          validColab.host
        );
        return {
          imageDataUrl: resImg.imageDataUrl,
          spaceUsed: `colab://${validColab.host}`,
          nodeLabel,
          provider: 'colab-turbo',
          elapsedMs: Date.now() - started,
          translatedPrompt: fullPrompt,
          width: dims.w,
          height: dims.h,
        };
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }

    // Priority 1: Cloudflare Workers AI Instant Engine (@cf/black-forest-labs/flux-1-schnell)
    if (cfCreds) {
      stepNum++;
      const nodeLabel = 'Cloudflare Workers AI (Instant 1–3s)';
      onStatus?.({
        space: '@cf/black-forest-labs/flux-1-schnell',
        nodeLabel,
        provider: 'cloudflare',
        attempt: stepNum,
        totalAttempts: totalSteps,
        progress: 35,
        translatedPrompt: fullPrompt,
        message:
          validColab
            ? `Colab node offline — instant rendering via Cloudflare Workers AI (@cf/black-forest-labs/flux-1-schnell)...`
            : `Instant zero-queue render via Cloudflare Workers AI (@cf/black-forest-labs/flux-1-schnell)...`,
      });

      try {
        const cfRes = await runCloudflareFluxImage(
          fullPrompt,
          safeRatio,
          cfCreds.accountId,
          cfCreds.apiToken
        );
        return {
          imageDataUrl: cfRes.imageDataUrl,
          spaceUsed: '@cf/black-forest-labs/flux-1-schnell',
          nodeLabel,
          provider: 'cloudflare',
          elapsedMs: cfRes.elapsedMs,
          translatedPrompt: fullPrompt,
          width: 1024,
          height: 1024,
        };
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }

    // Priority 2: Direct Hugging Face Inference API (Serverless HTTPS — no Gradio WebSocket overhead)
    if (hfToken) {
      stepNum++;
      const nodeLabel = 'Hugging Face Inference API';
      onStatus?.({
        space: 'black-forest-labs/FLUX.1-schnell',
        nodeLabel,
        provider: 'huggingface',
        attempt: stepNum,
        totalAttempts: totalSteps,
        progress: 50,
        translatedPrompt: fullPrompt,
        message: cfCreds
          ? `${lastError} — falling back to Direct Hugging Face Inference API...`
          : `Rendering via Direct Hugging Face Inference API...`,
      });
      try {
        const hfDirect = await runDirectHuggingFaceImage(fullPrompt, dims, useSdxl, hfToken);
        return {
          imageDataUrl: hfDirect.imageDataUrl,
          spaceUsed: hfDirect.modelUsed,
          nodeLabel,
          provider: 'huggingface',
          elapsedMs: hfDirect.elapsedMs,
          translatedPrompt: fullPrompt,
          width: dims.w,
          height: dims.h,
        };
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }

    // Priority 3: Automatic Free Hugging Face Spaces Failover (bounded on serverless)
    const maxGradioAttempts = process.env.VERCEL ? Math.min(2, hfCandidates.length) : hfCandidates.length;
    for (let i = 0; i < maxGradioAttempts; i++) {
      stepNum++;
      const candidate = hfCandidates[i];
      const nodeLabel = getNodeLabel(candidate);
      const started = Date.now();
      const baseProgress = Math.round(55 + ((i + 0.25) / Math.max(1, maxGradioAttempts)) * 25);

      onStatus?.({
        space: candidate,
        nodeLabel,
        provider: 'huggingface',
        attempt: stepNum,
        totalAttempts: totalSteps,
        progress: Math.min(82, baseProgress),
        translatedPrompt: fullPrompt,
        message:
          stepNum > 1
            ? `${lastError} — failing over to ${nodeLabel} (${candidate})...`
            : `Connecting to ${nodeLabel} (${candidate})...`,
      });

      try {
        const resImg = await tryGradioImageEndpoint(
          candidate,
          nodeLabel,
          fullPrompt,
          dims,
          useSdxl
        );
        return {
          imageDataUrl: resImg.imageDataUrl,
          spaceUsed: candidate,
          nodeLabel,
          provider: 'huggingface',
          elapsedMs: Date.now() - started,
          translatedPrompt: fullPrompt,
          width: dims.w,
          height: dims.h,
        };
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }

    // Priority 4: Zero-Failure Free Open-Source Fallback (Pollinations)
    stepNum++;
    onStatus?.({
      space: 'pollinations/flux',
      nodeLabel: 'Open-Source Free Fallback',
      provider: 'huggingface',
      attempt: stepNum,
      totalAttempts: totalSteps,
      progress: 88,
      translatedPrompt: fullPrompt,
      message: `Primary GPU nodes busy (${lastError}) — routing to free open-source fallback...`,
    });
    try {
      const freeRes = await runPollinationsFreeImage(fullPrompt, dims);
      return {
        imageDataUrl: freeRes.imageDataUrl,
        spaceUsed: 'pollinations/flux',
        nodeLabel: 'Open-Source Free Fallback',
        provider: 'huggingface',
        elapsedMs: freeRes.elapsedMs,
        translatedPrompt: fullPrompt,
        width: dims.w,
        height: dims.h,
      };
    } catch (err) {
      lastError = `${lastError}; fallback: ${err instanceof Error ? err.message : String(err)}`;
    }

    throw new Error(
      `All image generation providers failed (${lastError}). Please retry shortly.`
    );
  }

  // Instant Cloudflare Workers AI + HF Flux.1/SD3.5 Image Generation (JSON) with Automatic Fallback
  app.post('/api/hf/generate-image', async (req: Request, res: Response) => {
    try {
      const {
        prompt,
        style = 'Cinematic Film',
        aspectRatio = '16:9',
        engine = 'flux-schnell',
        spaceId,
        colabUrl,
      } = req.body ?? {};

      if (typeof prompt !== 'string' || prompt.trim().length < 4) {
        res.status(400).json({ error: 'Please provide an image prompt of at least 4 characters.' });
        return;
      }

      const result = await runResilientImageGeneration({
        prompt,
        style: String(style),
        aspectRatio: String(aspectRatio),
        engine: String(engine),
        spaceId: typeof spaceId === 'string' ? spaceId : undefined,
        colabUrl: typeof colabUrl === 'string' ? colabUrl : undefined,
      });

      res.json(result);
    } catch (err) {
      res.status(503).json({
        error: err instanceof Error ? err.message : 'Failed to reach image generation node.',
      });
    }
  });

  // Instant Cloudflare Workers AI + HF Image Generation (SSE live failover updates)
  app.post('/api/hf/generate-image-stream', async (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const sendEvent = (event: Record<string, unknown>) => {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    };

    try {
      const {
        prompt,
        style = 'Cinematic Film',
        aspectRatio = '16:9',
        engine = 'flux-schnell',
        spaceId,
        colabUrl,
      } = req.body ?? {};

      if (typeof prompt !== 'string' || prompt.trim().length < 4) {
        sendEvent({
          type: 'error',
          error: 'Please provide an image prompt of at least 4 characters.',
        });
        res.end();
        return;
      }

      const result = await runResilientImageGeneration(
        {
          prompt,
          style: String(style),
          aspectRatio: String(aspectRatio),
          engine: String(engine),
          spaceId: typeof spaceId === 'string' ? spaceId : undefined,
          colabUrl: typeof colabUrl === 'string' ? colabUrl : undefined,
        },
        (statusEvt) => {
          sendEvent({ type: 'status', ...statusEvt });
        }
      );

      sendEvent({
        type: 'complete',
        ...result,
      });
      res.end();
    } catch (err) {
      sendEvent({
        type: 'error',
        error: err instanceof Error ? err.message : 'All image nodes are temporarily busy.',
      });
      res.end();
    }
  });

  // Fast Distilled Video & Animation Router (Colab Turbo GPU -> LTX-Video / Wan 2.1 Fast -> Backup HF)
  app.post('/api/hf/generate-video', async (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const sendEvent = (event: Record<string, unknown>) => {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    };

    try {
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
      } = req.body ?? {};

      if (typeof prompt !== 'string' || prompt.trim().length < 4) {
        sendEvent({ type: 'error', error: 'Please provide a scene visual prompt (at least 4 characters).' });
        res.end();
        return;
      }

      const normalizedRefs: NormalizedReferenceInput[] = [];
      if (Array.isArray(referenceImages)) {
        for (let idx = 0; idx < Math.min(8, referenceImages.length); idx++) {
          const item = referenceImages[idx];
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

      // If caller passed only imageDataUrl (legacy single-image path) and no referenceImages array, include it
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

      const safeRatio = ALLOWED_RATIOS.includes(aspectRatio) ? aspectRatio : '16:9';
      const safeMotion = ALLOWED_CAMERA_MOTIONS.includes(cameraMotion) ? cameraMotion : 'Auto';

      sendEvent({
        type: 'status',
        progress: 8,
        message:
          normalizedRefs.length > 0
            ? `Enhancing cinematography & blending ${normalizedRefs.length} reference image${
                normalizedRefs.length > 1 ? 's' : ''
              } with Gemini...`
            : 'Enhancing camera directions with Gemini Cinema Prompt Enhancer...',
      });

      const { enhancedPrompt, useExactStartFrame } = await enhanceCinemaVideoPrompt({
        basePrompt: prompt,
        refs: normalizedRefs,
        style: String(style),
        cameraMotion: safeMotion,
        animateExactFrame: Boolean(animateExactFrame || (mode === 'image-to-video' && normalizedRefs.length === 1 && typeof imageDataUrl === 'string')),
      });

      // Multi-image references (2+) or custom camera angles use prompt-driven T2V routing so Frame 1 is never forced
      const shouldUseSingleFrameI2v = Boolean(useExactStartFrame && normalizedRefs.length === 1);
      const safeMode = shouldUseSingleFrameI2v ? 'image-to-video' : 'text-to-video';
      const imageBlob = shouldUseSingleFrameI2v
        ? new Blob([new Uint8Array(normalizedRefs[0].buffer)], { type: normalizedRefs[0].mimeType })
        : null;

      const customSpace =
        typeof spaceId === 'string' && SPACE_ID_RE.test(spaceId.trim()) ? spaceId.trim() : null;

      sendEvent({
        type: 'status',
        progress: 11,
        message: 'Finding live running free GPU video Spaces...',
      });

      const liveRunningSpaces = await discoverRunningVideoSpaces(safeMode);
      const hfCandidates = customSpace
        ? [customSpace, ...liveRunningSpaces.filter((s) => s !== customSpace)]
        : liveRunningSpaces;

      const validColab = validateColabGradioUrl(colabUrl);
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
          nodeLabel: 'Colab Turbo GPU (Private Zero-Queue)',
          provider: 'colab-turbo',
          extraAllowedHost: validColab.host,
        });
      }

      for (const s of hfCandidates) {
        nodesToTry.push({
          target: s,
          displaySpace: s,
          nodeLabel: getNodeLabel(s),
          provider: 'huggingface',
        });
      }

      const fullPrompt = buildTranslatedVideoPrompt(
        enhancedPrompt,
        String(style),
        safeRatio,
        safeMotion
      );
      let lastError = 'Live running video Spaces are currently queued.';

      for (let i = 0; i < nodesToTry.length; i++) {
        const node = nodesToTry[i];
        const started = Date.now();
        try {
          sendEvent({
            type: 'status',
            space: node.displaySpace,
            nodeLabel: node.nodeLabel,
            provider: node.provider,
            attempt: i + 1,
            totalAttempts: nodesToTry.length,
            progress: Math.round(12 + (i / nodesToTry.length) * 20),
            translatedPrompt: fullPrompt,
            message:
              i === 0
                ? node.provider === 'colab-turbo'
                  ? `Connecting to Private Colab Turbo GPU (${validColab?.host})...`
                  : `Connecting to running GPU node ${node.nodeLabel} (${node.displaySpace})...`
                : `Primary queue busy — failing over to ${node.nodeLabel} (${node.displaySpace})...`,
          });

          const clientOptions =
            node.provider === 'huggingface' ? getHfGradioOptions() : undefined;
          const client = await withTimeout(
            Client.connect(node.target, clientOptions),
            12000,
            `${node.nodeLabel} connection timed out.`
          );
          const api = await withTimeout(
            client.view_api(),
            8000,
            `${node.nodeLabel} API schema timed out.`
          );

          const namedEntries = Object.entries(api.named_endpoints ?? {});
          const videoEndpoints = namedEntries.filter(([, ep]) =>
            (ep?.returns ?? []).some((r) => /video/i.test(String(r.component)))
          );
          const candidateEntries = videoEndpoints.length > 0 ? videoEndpoints : namedEntries;

          let chosenEndpoint: string | number = candidateEntries[0]?.[0] ?? 0;
          if (safeMode === 'image-to-video') {
            const i2vMatch = candidateEntries.find(([k]) => /i2v|img2vid|image/i.test(k));
            if (i2vMatch) chosenEndpoint = i2vMatch[0];
          } else {
            const t2vMatch = candidateEntries.find(([k]) =>
              /t2v|txt2vid|text_to_video|text|generate|predict|infer/i.test(k)
            );
            if (t2vMatch) chosenEndpoint = t2vMatch[0];
          }

          const epInfo =
            typeof chosenEndpoint === 'string'
              ? api.named_endpoints?.[chosenEndpoint]
              : api.unnamed_endpoints?.[0];
          const paramsMeta = epInfo?.parameters ?? [];

          // Skip I2V-only endpoints cleanly when in text-to-video mode
          const requiresMandatoryImage = paramsMeta.some(
            (p) =>
              (p.component === 'Image' ||
                (p.parameter_name?.toLowerCase().includes('image') &&
                  !p.parameter_name?.toLowerCase().includes('last'))) &&
              !p.parameter_has_default
          );
          if (!imageBlob && requiresMandatoryImage) {
            lastError = `${node.nodeLabel} requires a starting image frame`;
            continue;
          }

          const isDistilled = /ltx|fast|turbo|fp8/i.test(node.target);
          const payload: Record<string, unknown> = {};
          let attachedPrimary = false;
          for (const p of paramsMeta) {
            const name = p.parameter_name;
            if (!name) continue;
            const lower = name.toLowerCase();
            if (lower.includes('prompt') && !lower.includes('negative')) {
              payload[name] = fullPrompt;
            } else if (
              imageBlob &&
              !attachedPrimary &&
              !lower.includes('last') &&
              !lower.includes('end') &&
              (lower.includes('image') || p.component === 'Image')
            ) {
              payload[name] = handle_file(imageBlob);
              attachedPrimary = true;
            } else if (
              (lower === 'num_inference_steps' || lower === 'steps') &&
              isDistilled &&
              !p.parameter_has_default
            ) {
              payload[name] = 8;
            } else if ((lower === 'duration' || lower === 'seconds') && !p.parameter_has_default) {
              payload[name] = 3;
            } else if (p.parameter_has_default) {
              payload[name] = p.parameter_default;
            }
          }

          sendEvent({
            type: 'status',
            space: node.displaySpace,
            nodeLabel: node.nodeLabel,
            provider: node.provider,
            attempt: i + 1,
            totalAttempts: nodesToTry.length,
            progress: 34,
            translatedPrompt: fullPrompt,
            message:
              node.provider === 'colab-turbo'
                ? `Connected to Colab Turbo GPU · Rendering zero-queue...`
                : `Connected to ${node.nodeLabel} · Submitting fast clip...`,
          });

          const job = client.submit(
            chosenEndpoint,
            Object.keys(payload).length > 0 ? payload : [fullPrompt]
          );

          let videoUrl: string | null = null;
          const jobStart = Date.now();
          for await (const msg of job) {
            if (Date.now() - jobStart > 48000 && !videoUrl) {
              lastError = `${node.nodeLabel} queue wait exceeded 48s fast limit.`;
              break;
            }
            if (msg.type === 'status') {
              const queueInfo =
                typeof msg.position === 'number'
                  ? `Queue #${msg.position + 1}`
                  : msg.stage;
              const etaInfo =
                typeof msg.eta === 'number' && msg.eta > 0
                  ? ` · Est. ${Math.round(msg.eta)}s`
                  : '';
              const pct =
                msg.stage === 'generating'
                  ? 68
                  : typeof msg.position === 'number'
                  ? Math.max(36, 58 - Math.min(20, msg.position * 2))
                  : 48;

              sendEvent({
                type: 'status',
                space: node.displaySpace,
                nodeLabel: node.nodeLabel,
                provider: node.provider,
                attempt: i + 1,
                totalAttempts: nodesToTry.length,
                progress: pct,
                queuePosition: msg.position,
                eta: msg.eta,
                translatedPrompt: fullPrompt,
                message: `Connected to ${node.nodeLabel} · ${queueInfo}${etaInfo}`,
              });

              if (msg.stage === 'error') {
                lastError =
                  typeof msg.message === 'string'
                    ? msg.message
                    : Array.isArray(msg.message)
                    ? msg.message.map((e) => e.message).join('; ')
                    : `${node.nodeLabel} reported an error.`;
                break;
              }
            } else if (msg.type === 'data') {
              videoUrl = extractGradioMediaUrl(msg.data, node.extraAllowedHost);
              if (videoUrl) break;
            }
          }

          if (!videoUrl) {
            continue;
          }

          sendEvent({
            type: 'status',
            space: node.displaySpace,
            nodeLabel: node.nodeLabel,
            provider: node.provider,
            attempt: i + 1,
            totalAttempts: nodesToTry.length,
            progress: 90,
            translatedPrompt: fullPrompt,
            message: `Downloading rendered MP4 from ${node.nodeLabel}...`,
          });

          const vidRes = await withTimeout(
            fetch(videoUrl, {
              headers:
                node.provider === 'huggingface' ? getHfAuthHeadersForUrl(videoUrl) : undefined,
            }),
            20000,
            `Video download from ${node.nodeLabel} timed out.`
          );
          if (!vidRes.ok) {
            lastError = `Could not download video output from ${node.nodeLabel}.`;
            continue;
          }

          const mime = vidRes.headers.get('content-type') || 'video/mp4';
          const buf = Buffer.from(await vidRes.arrayBuffer());
          const clipId = cacheGeneratedClip(buf, mime);

          sendEvent({
            type: 'complete',
            videoUrl: `/api/hf/clip/${clipId}`,
            spaceUsed: node.displaySpace,
            nodeLabel: node.nodeLabel,
            provider: node.provider,
            elapsedMs: Date.now() - started,
            translatedPrompt: fullPrompt,
            progress: 100,
            mode: safeMode,
          });
          res.end();
          return;
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err);
        }
      }

      sendEvent({
        type: 'error',
        error: `All live running video Spaces (${hfCandidates.slice(0, 3).join(', ')}) are currently queued (${lastError}). Try again shortly or connect your free Colab GPU Notebook.`,
      });
      res.end();
    } catch (err) {
      sendEvent({
        type: 'error',
        error: err instanceof Error ? err.message : 'Unexpected error connecting to video engine.',
      });
      res.end();
    }
  });

  // Free Hugging Face SadTalker Lip-Sync Animation via @gradio/client (SSE queue status)
  app.post('/api/hf/lipsync', async (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const sendEvent = (event: Record<string, unknown>) => {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    };

    try {
      const { imageDataUrl, audioBase64, spaceId } = req.body ?? {};
      const imageBlob =
        typeof imageDataUrl === 'string' ? resolveImageInputToBlob(imageDataUrl) : null;
      const audioBlob =
        typeof audioBase64 === 'string' ? resolveAudioBase64ToBlob(audioBase64) : null;

      if (!imageBlob) {
        sendEvent({ type: 'error', error: 'Select or upload a character portrait first.' });
        res.end();
        return;
      }
      if (!audioBlob) {
        sendEvent({
          type: 'error',
          error: 'Record microphone audio or synthesize a WAV take to drive SadTalker lip-sync.',
        });
        res.end();
        return;
      }

      const customSpace =
        typeof spaceId === 'string' && SPACE_ID_RE.test(spaceId.trim()) ? spaceId.trim() : null;
      const liveLipsync = await discoverRunningLipsyncSpaces();
      const candidates = customSpace
        ? [customSpace, ...liveLipsync.filter((s) => s !== customSpace)]
        : liveLipsync;

      let lastError = 'Public SadTalker Spaces are currently queued or sleeping.';

      for (const candidate of candidates) {
        try {
          sendEvent({
            type: 'status',
            space: candidate,
            message: `Connecting to free SadTalker GPU (${candidate})...`,
          });

          const client = await Client.connect(candidate, getHfGradioOptions());
          const api = await client.view_api();
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
            if (!name) continue;
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
            Object.keys(payload).length > 0 ? payload : [handle_file(imageBlob), handle_file(audioBlob)]
          );

          let videoUrl: string | null = null;
          for await (const msg of job) {
            if (msg.type === 'status') {
              const queueInfo =
                typeof msg.position === 'number'
                  ? `Queue #${msg.position + 1}`
                  : msg.stage;
              const etaInfo =
                typeof msg.eta === 'number' && msg.eta > 0
                  ? ` · Est. ${Math.round(msg.eta)}s`
                  : '';
              sendEvent({
                type: 'status',
                space: candidate,
                queuePosition: msg.position,
                eta: msg.eta,
                message: `SadTalker (${candidate}): ${queueInfo}${etaInfo}`,
              });
              if (msg.stage === 'error') {
                lastError =
                  typeof msg.message === 'string'
                    ? msg.message
                    : Array.isArray(msg.message)
                    ? msg.message.map((e) => e.message).join('; ')
                    : `Space ${candidate} reported an error.`;
                break;
              }
            } else if (msg.type === 'data') {
              videoUrl = extractGradioMediaUrl(msg.data);
              if (videoUrl) break;
            }
          }

          if (!videoUrl) continue;

          const vidRes = await fetch(videoUrl, {
            headers: getHfAuthHeadersForUrl(videoUrl),
          });
          if (!vidRes.ok) {
            lastError = `Failed to download lip-sync output from ${candidate}.`;
            continue;
          }

          const mime = vidRes.headers.get('content-type') || 'video/mp4';
          const buf = Buffer.from(await vidRes.arrayBuffer());
          const clipId = cacheGeneratedClip(buf, mime);

          sendEvent({
            type: 'complete',
            videoUrl: `/api/hf/clip/${clipId}`,
            spaceUsed: candidate,
            mode: 'lipsync',
          });
          res.end();
          return;
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err);
        }
      }

      sendEvent({
        type: 'error',
        error: `Public SadTalker lip-sync Spaces are currently unavailable (${lastError}).`,
      });
      res.end();
    } catch (err) {
      sendEvent({
        type: 'error',
        error: err instanceof Error ? err.message : 'Unexpected SadTalker lip-sync error.',
      });
      res.end();
    }
  });

  // All-in-One "Talking Scene" 4-Step Pipeline (Compositing -> Voice TTS -> Lip-Sync -> Final Video)
  app.post('/api/hf/talking-scene', async (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const sendEvent = (event: Record<string, unknown>) => {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    };

    try {
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
      } = req.body ?? {};

      const charBuf =
        typeof characterImageUrl === 'string' ? resolveImageInputToBuffer(characterImageUrl) : null;

      if (!charBuf) {
        sendEvent({
          type: 'error',
          error: 'Please upload or select a Character Image for Talking Scene mode.',
        });
        res.end();
        return;
      }

      const trimmedDialogue = typeof dialogue === 'string' ? dialogue.trim() : '';
      const hasCustomAudio =
        typeof customAudioBase64 === 'string' && customAudioBase64.trim().length > 32;

      if (!hasCustomAudio && trimmedDialogue.length < 2) {
        sendEvent({
          type: 'error',
          error: 'Type what the character should say (or upload/record a voice clip).',
        });
        res.end();
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
          if (!item || typeof item.imageUrl !== 'string') continue;
          const b = resolveImageInputToBuffer(item.imageUrl);
          if (b) {
            normalizedCoStars.push({
              buffer: b,
              label: typeof item.label === 'string' && item.label.trim() ? item.label.trim() : 'Partner',
            });
          }
        }
      }

      const bgBuf =
        typeof backgroundImageUrl === 'string' && backgroundImageUrl.trim()
          ? resolveImageInputToBuffer(backgroundImageUrl)
          : null;

      // STEP 1: Scene Compositing (Character(s) + Background via Gemini + Flux/SDXL)
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
          message: `Step 1 · Compositing ${String(characterLabel)} (${safeShotAngle}) inside scene...`,
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
                message: `Step 1 · Compositing ${String(characterLabel)} on ${statusEvt.nodeLabel}...`,
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
          message: `Step 1 · Framing ${String(characterLabel)} portrait for talking animation...`,
        });
      }

      // STEP 2: Spoken Voice Track Generation
      let audioBlob: Blob | null = null;
      let generatedAudioDataUrl: string | undefined;

      if (hasCustomAudio) {
        sendEvent({
          type: 'status',
          progress: 45,
          message: `Step 2 · Preparing ${String(characterLabel)}'s recorded voice track...`,
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
          message: `Step 2 · Generating ${String(characterLabel)}'s voice track (${safeVoicePreset})...`,
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
        res.end();
        return;
      }

      const finalImageBlob = resolveImageInputToBlob(finalSceneImageUrl) ?? resolveImageInputToBlob(String(characterImageUrl));
      if (!finalImageBlob) {
        sendEvent({
          type: 'error',
          error: 'Could not read composited character scene image.',
        });
        res.end();
        return;
      }

      // STEP 3: Lip-Sync & Facial Motion via Hugging Face SadTalker / EchoMimic / LivePortrait
      sendEvent({
        type: 'status',
        progress: 60,
        message: 'Step 3 · Connecting to free Hugging Face lip-sync GPU...',
      });

      const customSpace =
        typeof spaceId === 'string' && SPACE_ID_RE.test(spaceId.trim()) ? spaceId.trim() : null;
      const liveLipsync = await discoverRunningLipsyncSpaces();
      const candidates = customSpace
        ? [customSpace, ...liveLipsync.filter((s) => s !== customSpace)]
        : liveLipsync;

      let lastError = 'Public lip-sync GPUs are currently busy.';
      const started = Date.now();

      for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i];
        const nodeLabel = getNodeLabel(candidate);
        try {
          sendEvent({
            type: 'status',
            space: candidate,
            nodeLabel,
            progress: Math.min(72, 62 + i * 3),
            message: `Step 3 · Animating lip-sync & expressions on ${nodeLabel} (${candidate})...`,
          });

          const client = await withTimeout(
            Client.connect(candidate, getHfGradioOptions()),
            12000,
            `${candidate} connection timed out.`
          );
          const api = await withTimeout(client.view_api(), 8000, `${candidate} API timed out.`);
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
            if (!name) continue;
            const lower = name.toLowerCase();
            if (!attachedImg && (lower.includes('image') || p.component === 'Image')) {
              payload[name] = handle_file(finalImageBlob);
              attachedImg = true;
            } else if (!attachedAudio && (lower.includes('audio') || p.component === 'Audio')) {
              payload[name] = handle_file(audioBlob);
              attachedAudio = true;
            } else if (lower === 'still' || lower === 'still_mode') {
              payload[name] = false; // enable natural head motion
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
              : [handle_file(finalImageBlob), handle_file(audioBlob)]
          );

          let videoUrl: string | null = null;
          const jobStart = Date.now();
          for await (const msg of job) {
            if (Date.now() - jobStart > 55000 && !videoUrl) {
              lastError = `${candidate} queue wait exceeded fast timeout.`;
              break;
            }
            if (msg.type === 'status') {
              const queueInfo =
                typeof msg.position === 'number'
                  ? `Queue #${msg.position + 1}`
                  : msg.stage;
              const etaInfo =
                typeof msg.eta === 'number' && msg.eta > 0
                  ? ` · Est. ${Math.round(msg.eta)}s`
                  : '';
              sendEvent({
                type: 'status',
                space: candidate,
                nodeLabel,
                progress: msg.stage === 'generating' ? 84 : 74,
                queuePosition: msg.position,
                eta: msg.eta,
                message: `Step 3 · Lip-syncing character on ${candidate}: ${queueInfo}${etaInfo}`,
              });
              if (msg.stage === 'error') {
                lastError =
                  typeof msg.message === 'string'
                    ? msg.message
                    : Array.isArray(msg.message)
                    ? msg.message.map((e) => e.message).join('; ')
                    : `${candidate} reported an error.`;
                break;
              }
            } else if (msg.type === 'data') {
              videoUrl = extractGradioMediaUrl(msg.data);
              if (videoUrl) break;
            }
          }

          if (!videoUrl) continue;

          // STEP 4: Finalizing Output
          sendEvent({
            type: 'status',
            progress: 94,
            message: 'Step 4 · Finalizing talking video clip...',
          });

          const vidRes = await withTimeout(
            fetch(videoUrl, { headers: getHfAuthHeadersForUrl(videoUrl) }),
            20000,
            'Talking video download timed out.'
          );
          if (!vidRes.ok) {
            lastError = `Failed to download rendered video from ${candidate}.`;
            continue;
          }

          const mime = vidRes.headers.get('content-type') || 'video/mp4';
          const buf = Buffer.from(await vidRes.arrayBuffer());
          const clipId = cacheGeneratedClip(buf, mime);

          sendEvent({
            type: 'complete',
            videoUrl: `/api/hf/clip/${clipId}`,
            compositedImageDataUrl: finalSceneImageUrl,
            audioDataUrl: generatedAudioDataUrl,
            spaceUsed: candidate,
            nodeLabel,
            elapsedMs: Date.now() - started,
            progress: 100,
            mode: 'lipsync',
          });
          res.end();
          return;
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err);
        }
      }

      sendEvent({
        type: 'error',
        error: `Public lip-sync Spaces are currently busy (${lastError}). Try again shortly.`,
      });
      res.end();
    } catch (err) {
      sendEvent({
        type: 'error',
        error: err instanceof Error ? err.message : 'Unexpected Talking Scene pipeline error.',
      });
      res.end();
    }
  });

  // Explicit JSON 404 for unknown /api/* paths so API requests never fall back to HTML
  app.all('/api/*', (req: Request, res: Response) => {
    res.status(404).json({
      error: `API endpoint not found: ${req.method} ${req.originalUrl || req.path}`,
    });
  });

  // Structured JSON Error Handler for all /api/* routes (prevents unhandled HTML 500 crashes)
  app.use(
    (
      err: unknown,
      _req: Request,
      res: Response,
      _next: express.NextFunction
    ) => {
      if (res.headersSent) return;
      const message =
        err instanceof Error ? err.message : 'Unexpected server error in API route.';
      res.status(500).json({ error: message });
    }
  );

  return app;
}

async function createServer() {
  const app = createApiApp();

  if (process.env.NODE_ENV !== 'production') {
    app.use(
      '/ffmpeg-core',
      express.static(path.resolve(__dirname, 'node_modules/@ffmpeg/core/dist/esm'))
    );
    const viteModule = 'vite';
    const { createServer: createViteServer } = await import(viteModule);
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use('/ffmpeg-core', express.static(path.join(distPath, 'ffmpeg-core')));
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`A.H.I Studio listening on http://localhost:${PORT}`);
  });
}

if (!process.env.VERCEL) {
  createServer().catch((err) => {
    console.error('Failed to start A.H.I Studio server:', err);
    process.exit(1);
  });
}
