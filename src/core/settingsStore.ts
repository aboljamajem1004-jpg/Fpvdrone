import { DEFAULT_SETTINGS, type Settings } from '../config/physics';

const KEY = 'skyrush.settings';
const BEST_KEY = 'skyrush.bestTime';

function storageAvailable(): boolean {
  try {
    localStorage.setItem('__t', '1');
    localStorage.removeItem('__t');
    return true;
  } catch {
    return false;
  }
}

const hasStorage = storageAvailable();
let memorySettings: Settings | null = null;
let memoryBest: number | null = null;

export function loadSettings(): Settings {
  if (!hasStorage) return { ...(memorySettings ?? DEFAULT_SETTINGS) };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  if (!hasStorage) {
    memorySettings = { ...s };
    return;
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* quota / private mode — ignore */
  }
}

export function loadBestTime(): number | null {
  if (!hasStorage) return memoryBest;
  const raw = localStorage.getItem(BEST_KEY);
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : null;
}

export function saveBestTime(seconds: number): void {
  if (!hasStorage) {
    memoryBest = seconds;
    return;
  }
  try {
    localStorage.setItem(BEST_KEY, String(seconds));
  } catch {
    /* ignore */
  }
}
