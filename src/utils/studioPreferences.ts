import type { AspectRatio } from '../types/studio';

export interface StudioPreferences {
  playStartupIntro: boolean;
  defaultAspectRatio: AspectRatio;
}

const PREFS_STORAGE_KEY = 'ahi_studio_prefs_v1';

const DEFAULT_PREFERENCES: StudioPreferences = {
  playStartupIntro: true,
  defaultAspectRatio: '16:9',
};

const VALID_RATIOS: AspectRatio[] = ['16:9', '9:16', '1:1'];

export function loadStudioPreferences(): StudioPreferences {
  try {
    const raw = localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES };
    const parsed = JSON.parse(raw) as Partial<StudioPreferences>;
    return {
      playStartupIntro:
        typeof parsed.playStartupIntro === 'boolean' ? parsed.playStartupIntro : true,
      defaultAspectRatio: VALID_RATIOS.includes(parsed.defaultAspectRatio as AspectRatio)
        ? (parsed.defaultAspectRatio as AspectRatio)
        : '16:9',
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function saveStudioPreferences(next: StudioPreferences): void {
  try {
    localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage quota errors
  }
}
