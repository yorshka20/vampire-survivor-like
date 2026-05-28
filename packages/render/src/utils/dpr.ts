/**
 * Active cap on device pixel ratio. Mutable at runtime so the in-game UI can
 * trade visual fidelity for fill-rate (a 2x display rendering at maxDpr=1
 * is ~4x cheaper per frame at the cost of pixelation).
 *
 * Persisted in localStorage so the preference survives reloads — the in-game
 * toggle calls `window.location.reload()` after writing the new value, so the
 * fresh module load picks it up before any renderer is constructed.
 */
const STORAGE_KEY = 'vampire.maxDpr';
const DEFAULT_MAX_DPR = 2;

function readStoredMaxDpr(): number {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (raw === null) return DEFAULT_MAX_DPR;
    const parsed = parseFloat(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_DPR;
  } catch {
    return DEFAULT_MAX_DPR;
  }
}

let maxDpr = readStoredMaxDpr();

export function getMaxDpr(): number {
  return maxDpr;
}

export function setMaxDpr(value: number): void {
  maxDpr = value;
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // ignore; storage may be blocked (private browsing, etc.)
  }
}

export function getCappedDevicePixelRatio(): number {
  return Math.min(window.devicePixelRatio || 1, maxDpr);
}
