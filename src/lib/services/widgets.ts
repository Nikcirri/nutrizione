// Collegamento al plugin Android "Widgets" (android/app/src/main/java/.../widgets/WidgetsPlugin.java):
// passa al widget "Calorie" i numeri di oggi e avvisa quando si tocca il suo pulsante +.
import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { CaloriesSnapshot } from '../logic/widget';
import { isNative } from '../platform';

interface WidgetsPlugin {
  setCalories(snapshot: CaloriesSnapshot): Promise<void>;
  addListener(event: 'widgetAction', handler: (e: { action: string }) => void): Promise<PluginListenerHandle>;
}

const Widgets = registerPlugin<WidgetsPlugin>('Widgets');

/** Aggiorna il widget "Calorie" (solo nell'app Android). */
export async function pushCalories(snapshot: CaloriesSnapshot): Promise<void> {
  if (!isNative()) return;
  await Widgets.setCalories(snapshot);
}

/**
 * Chiama `handler` quando l'app viene aperta dal + del widget "Calorie".
 * Se il tocco è arrivato prima (app ancora chiusa), Android lo consegna appena ci si mette in ascolto.
 */
export function onAddMealFromWidget(handler: () => void): void {
  if (!isNative()) return;
  void Widgets.addListener('widgetAction', (e) => {
    if (e.action === 'addMeal') handler();
  }).catch(() => undefined);
}
