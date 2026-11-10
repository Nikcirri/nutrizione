// Dati che l'app passa al widget "Calorie" della schermata Home (numeri interi, pronti da mostrare).
import { dayBudget } from './goals';

export interface CaloriesSnapshot {
  /** Giorno a cui si riferiscono i numeri (AAAA-MM-GG). */
  date: string;
  /** Obiettivo della giornata, senza l'attività. */
  goal: number;
  /** Calorie mangiate. */
  eaten: number;
  /** Calorie dell'attività aggiunte all'obiettivo (0 se l'utente non le vuole contare). */
  burned: number;
  /** Calorie ancora da mangiare: negative se si è andati oltre. Lo stesso numero del Diario. */
  remaining: number;
}

/** Arrotonda e toglie lo zero negativo (così due fotografie uguali si confrontano uguali). */
const int = (n: number) => Math.round(n) || 0;

export function caloriesSnapshot(date: string, targetKcal: number, eatenKcal: number, burnedKcal: number, addActivity: boolean): CaloriesSnapshot {
  const budget = dayBudget(targetKcal, burnedKcal, addActivity);
  return {
    date,
    goal: int(targetKcal),
    eaten: int(eatenKcal),
    burned: int(budget - targetKcal),
    remaining: int(budget - eatenKcal),
  };
}
