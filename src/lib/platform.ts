import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

export const APP_VERSION: string = __APP_VERSION__;

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

/** Vibrazione leggera sulle azioni principali (se il telefono la supporta). */
export async function tapFeedback(style: 'light' | 'medium' = 'light'): Promise<void> {
  if (!isNative()) return;
  try {
    await Haptics.impact({ style: style === 'light' ? ImpactStyle.Light : ImpactStyle.Medium });
  } catch {
    // La vibrazione è un extra: se non c'è si continua senza.
  }
}

/** Apre un link fuori dall'app (nel browser del telefono). */
export function openExternal(url: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
}

/** Tasto Indietro di Android: `handler` restituisce true se ha chiuso qualcosa. */
export function onBackButton(handler: () => boolean): void {
  if (!isNative()) return;
  void App.addListener('backButton', () => {
    if (!handler()) void App.minimizeApp().catch(() => App.exitApp());
  });
}

/** L'app torna in primo piano (per aggiornare i dati di Health Connect). */
export function onResume(handler: () => void): void {
  if (!isNative()) return;
  void App.addListener('resume', handler);
}

export async function requestPersistentStorage(): Promise<void> {
  try {
    await navigator.storage?.persist?.();
  } catch {
    // Non disponibile: nessun problema.
  }
}
