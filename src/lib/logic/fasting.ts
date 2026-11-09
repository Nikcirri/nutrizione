import type { Fast } from '../types';

/** "16:8" = 16 ore di digiuno e 8 ore in cui si mangia (insieme fanno 24). */
export const FAST_PLANS: readonly { hours: number; label: string; hint: string }[] = [
  { hours: 12, label: '12:12', hint: 'Per iniziare' },
  { hours: 14, label: '14:10', hint: 'Facile' },
  { hours: 16, label: '16:8', hint: 'Il più usato' },
  { hours: 18, label: '18:6', hint: 'Impegnativo' },
  { hours: 20, label: '20:4', hint: 'Difficile' },
];

/** Ore in cui si mangia con un piano di `hours` ore di digiuno. */
export function eatingHours(hours: number): number {
  return Math.max(0, 24 - hours);
}

export interface FastStatus {
  elapsedMs: number;
  remainingMs: number;
  /** Da 0 a 1 (resta 1 anche oltre l'obiettivo). */
  progress: number;
  reached: boolean;
  targetEnd: Date;
}

export function fastStatus(fast: Fast, now: Date = new Date()): FastStatus {
  const start = new Date(fast.start).getTime();
  const end = fast.end ? new Date(fast.end).getTime() : now.getTime();
  const elapsedMs = Math.max(0, end - start);
  const targetMs = fast.targetHours * 3_600_000;
  return {
    elapsedMs,
    remainingMs: Math.max(0, targetMs - elapsedMs),
    progress: targetMs > 0 ? Math.min(1, elapsedMs / targetMs) : 0,
    reached: elapsedMs >= targetMs,
    targetEnd: new Date(start + targetMs),
  };
}

/** "15:42:07" */
export function formatClock(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** "15 h 42 min" */
export function formatHours(ms: number): string {
  const totalMin = Math.round(Math.max(0, ms) / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export interface FastStats {
  completed: number;
  reached: number;
  averageMs: number;
  longestMs: number;
  /** Digiuni consecutivi (dal più recente) che hanno raggiunto l'obiettivo. */
  streak: number;
}

/** Statistiche sui digiuni conclusi (in qualsiasi ordine). */
export function fastStats(fasts: Fast[]): FastStats {
  const done = fasts.filter((f) => f.end).sort((a, b) => b.start.localeCompare(a.start));
  const durations = done.map((f) => fastStatus(f).elapsedMs);
  let streak = 0;
  for (const f of done) {
    if (fastStatus(f).reached) streak++;
    else break;
  }
  return {
    completed: done.length,
    reached: done.filter((f) => fastStatus(f).reached).length,
    averageMs: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
    longestMs: durations.length ? Math.max(...durations) : 0,
    streak,
  };
}
