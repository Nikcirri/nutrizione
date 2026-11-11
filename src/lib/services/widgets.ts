// Collegamento al plugin Android "Widgets" (android/app/src/main/java/.../widgets/WidgetsPlugin.java):
// - passa al widget "Calorie" i numeri di oggi;
// - legge e cambia il contatore di sigarette, che vive sul telefono insieme al suo widget;
// - avvisa quando l'app viene aperta toccando un widget.
import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { MAX_PER_DAY, sanitizeCigDays, type CigDays } from '../logic/cigarettes';
import type { CaloriesSnapshot } from '../logic/widget';
import { isNative } from '../platform';

/** Cosa è stato toccato sul widget: il + delle calorie, oppure il widget delle sigarette. */
export type WidgetAction = 'addMeal' | 'cigarettes';

interface WidgetsPlugin {
  setCalories(snapshot: CaloriesSnapshot): Promise<void>;
  getCigarettes(): Promise<{ days: Record<string, number> }>;
  changeCigarettes(options: { date: string; delta: number }): Promise<{ count: number }>;
  setCigarettes(options: { days: Record<string, number> }): Promise<void>;
  addListener(event: 'widgetAction', handler: (e: { action: string }) => void): Promise<PluginListenerHandle>;
}

const Widgets = registerPlugin<WidgetsPlugin>('Widgets');

/** Aggiorna il widget "Calorie" (solo nell'app Android). */
export async function pushCalories(snapshot: CaloriesSnapshot): Promise<void> {
  if (!isNative()) return;
  await Widgets.setCalories(snapshot);
}

/**
 * Chiama `handler` quando l'app viene aperta da un widget.
 * Se il tocco è arrivato prima (app ancora chiusa), Android lo consegna appena ci si mette in ascolto.
 */
export function onWidgetAction(handler: (action: WidgetAction) => void): void {
  if (!isNative()) return;
  void Widgets.addListener('widgetAction', (e) => {
    if (e.action === 'addMeal' || e.action === 'cigarettes') handler(e.action);
  }).catch(() => undefined);
}

// ---------- Sigarette ----------
// Fuori dall'app Android (anteprima nel browser) il contatore sta nella memoria del browser:
// serve solo a provare la schermata, sul telefono i numeri sono quelli del widget.
const WEB_KEY = 'nutrizione.cigarettes';

function webRead(): CigDays {
  try {
    return sanitizeCigDays(JSON.parse(localStorage.getItem(WEB_KEY) ?? '{}'));
  } catch {
    return {};
  }
}

function webWrite(days: CigDays): void {
  try {
    localStorage.setItem(WEB_KEY, JSON.stringify(days));
  } catch {
    // Anteprima senza memoria del browser: il conteggio resta solo finché la pagina è aperta.
  }
}

/** Tutti i conteggi salvati, giorno per giorno. */
export async function cigaretteDays(): Promise<CigDays> {
  if (!isNative()) return webRead();
  return sanitizeCigDays((await Widgets.getCigarettes()).days);
}

/** Aggiunge o toglie sigarette a un giorno (mai sotto zero) e restituisce il nuovo numero. */
export async function changeCigarettes(date: string, delta: number): Promise<number> {
  if (!isNative()) {
    const days = webRead();
    const count = Math.max(0, Math.min(MAX_PER_DAY, (days[date] ?? 0) + delta));
    webWrite({ ...days, [date]: count });
    return count;
  }
  return (await Widgets.changeCigarettes({ date, delta })).count;
}

/** Sostituisce tutti i conteggi (ripristino di un backup). */
export async function replaceCigarettes(days: CigDays): Promise<void> {
  const clean = sanitizeCigDays(days);
  if (!isNative()) {
    webWrite(clean);
    return;
  }
  await Widgets.setCigarettes({ days: clean });
}
