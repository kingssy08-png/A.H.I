export interface TurboGpuConfig {
  enabled: boolean;
  colabUrl: string;
  lastVerifiedHost?: string;
  lastLatencyMs?: number;
}

const TURBO_STORAGE_KEY = 'ahi_turbo_colab_v1';

export function normalizeColabGradioUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') return null;
    if (parsed.username || parsed.password) return null;
    const host = parsed.hostname.toLowerCase();
    if (!host.endsWith('.gradio.live') && !host.endsWith('.hf.space')) {
      return null;
    }
    return `${parsed.origin}${parsed.pathname === '/' ? '' : parsed.pathname}`.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

export function loadTurboGpuConfig(): TurboGpuConfig {
  try {
    const raw = localStorage.getItem(TURBO_STORAGE_KEY);
    if (!raw) return { enabled: false, colabUrl: '' };
    const parsed = JSON.parse(raw) as Partial<TurboGpuConfig>;
    return {
      enabled: Boolean(parsed.enabled && parsed.colabUrl),
      colabUrl: typeof parsed.colabUrl === 'string' ? parsed.colabUrl : '',
      lastVerifiedHost:
        typeof parsed.lastVerifiedHost === 'string' ? parsed.lastVerifiedHost : undefined,
      lastLatencyMs: typeof parsed.lastLatencyMs === 'number' ? parsed.lastLatencyMs : undefined,
    };
  } catch {
    return { enabled: false, colabUrl: '' };
  }
}

export function saveTurboGpuConfig(config: TurboGpuConfig): void {
  try {
    localStorage.setItem(TURBO_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // ignore storage quota errors
  }
}

export function getActiveColabUrl(): string | undefined {
  const cfg = loadTurboGpuConfig();
  if (!cfg.enabled) return undefined;
  return normalizeColabGradioUrl(cfg.colabUrl) ?? undefined;
}
