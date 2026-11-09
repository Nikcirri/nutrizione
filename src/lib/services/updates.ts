import { RELEASES_API, isNewer, parseRelease, shouldAutoCheck, type ReleaseInfo } from '../logic/updates';
import { APP_VERSION } from '../platform';
import type { UpdateState } from '../types';

export type UpdateResult =
  | { kind: 'available'; release: ReleaseInfo }
  | { kind: 'current'; release: ReleaseInfo }
  | { kind: 'offline' }
  | { kind: 'error' };

const TIMEOUT_MS = 10_000;

async function fetchLatestRelease(): Promise<ReleaseInfo | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(RELEASES_API, {
      headers: { Accept: 'application/vnd.github+json' },
      cache: 'no-store',
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return parseRelease(await res.json());
  } finally {
    clearTimeout(timer);
  }
}

/** Chiede a GitHub l'ultima versione. `save` riceve lo stato da ricordare. */
export async function checkForUpdates(save: (s: UpdateState) => void, now: Date = new Date()): Promise<UpdateResult> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return { kind: 'offline' };
  let release: ReleaseInfo | null;
  try {
    release = await fetchLatestRelease();
  } catch {
    return { kind: navigator.onLine === false ? 'offline' : 'error' };
  }
  if (!release) return { kind: 'error' };
  save({ lastCheck: now.toISOString(), latestVersion: release.version, apkUrl: release.apkUrl, pageUrl: release.pageUrl });
  return isNewer(release.version, APP_VERSION) ? { kind: 'available', release } : { kind: 'current', release };
}

/** Controllo silenzioso (all'apertura e al ritorno nell'app): al massimo ogni 10 minuti. */
export async function autoCheckForUpdates(state: UpdateState, save: (s: UpdateState) => void): Promise<ReleaseInfo | null> {
  const now = new Date();
  if (!shouldAutoCheck(state.lastCheck, now)) {
    if (state.latestVersion && isNewer(state.latestVersion, APP_VERSION) && state.pageUrl) {
      return { version: state.latestVersion, apkUrl: state.apkUrl, pageUrl: state.pageUrl, notes: [] };
    }
    return null;
  }
  const result = await checkForUpdates(save, now);
  return result.kind === 'available' ? result.release : null;
}
