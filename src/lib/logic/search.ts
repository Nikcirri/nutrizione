import type { Food } from '../types';

/** Minuscolo, senza accenti e simboli: "Caffè-latte" → "caffe latte". */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function words(s: string): string[] {
  return normalize(s).split(' ').filter(Boolean);
}

/**
 * Punteggio di un alimento per la ricerca (0 = non trovato).
 * Ogni parola cercata deve comparire all'inizio di una parola del nome, della marca o dei sinonimi.
 */
export function matchScore(food: Pick<Food, 'name' | 'brand' | 'aliases' | 'useCount' | 'favorite'>, query: string): number {
  const q = words(query);
  if (!q.length) return 0;
  const nameWords = words(food.name);
  const otherWords = [...words(food.brand ?? ''), ...(food.aliases ?? []).flatMap(words)];
  let score = 0;
  for (const w of q) {
    const inName = nameWords.findIndex((n) => n.startsWith(w));
    if (inName >= 0) {
      score += nameWords[inName] === w ? 12 : 8;
      if (inName === 0) score += 6;
      continue;
    }
    if (otherWords.some((n) => n.startsWith(w))) {
      score += 5;
      continue;
    }
    return 0;
  }
  if (normalize(food.name) === normalize(query)) score += 8;
  score += Math.min(12, (food.useCount ?? 0) * 2);
  if (food.favorite) score += 5;
  // A parità di parole, i nomi più corti sono più vicini a ciò che si cerca.
  score -= Math.min(6, Math.max(0, nameWords.length - q.length));
  return score;
}

/** Cerca negli alimenti, i migliori per primi. Gli id duplicati tengono la prima versione (quella salvata). */
export function searchFoods(lists: Food[][], query: string, limit = 40): Food[] {
  const seen = new Set<string>();
  const scored: { food: Food; score: number }[] = [];
  for (const list of lists) {
    for (const food of list) {
      if (seen.has(food.id)) continue;
      seen.add(food.id);
      const score = matchScore(food, query);
      if (score > 0) scored.push({ food, score });
    }
  }
  scored.sort((a, b) => b.score - a.score || a.food.name.localeCompare(b.food.name, 'it'));
  return scored.slice(0, limit).map((s) => s.food);
}
