// Collegamento al plugin Android "AppUpdater" (android/app/src/main/java/.../AppUpdaterPlugin.java).
import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { isNative } from '../platform';

interface AppUpdaterPlugin {
  canInstall(): Promise<{ allowed: boolean }>;
  openInstallSettings(): Promise<void>;
  downloadAndInstall(options: { url: string }): Promise<void>;
  addListener(event: 'progress', handler: (e: { percent: number }) => void): Promise<PluginListenerHandle>;
}

const AppUpdater = registerPlugin<AppUpdaterPlugin>('AppUpdater');

/** L'app può scaricare e installare da sola (solo nell'app Android, con un APK nella Release). */
export function canSelfUpdate(apkUrl: string | null): apkUrl is string {
  return isNative() && !!apkUrl;
}

export async function installAllowed(): Promise<boolean> {
  return (await AppUpdater.canInstall()).allowed;
}

export async function openInstallSettings(): Promise<void> {
  await AppUpdater.openInstallSettings();
}

/** Scarica l'APK e apre l'installazione di Android; `onProgress` riceve la percentuale. */
export async function downloadAndInstall(url: string, onProgress: (percent: number) => void): Promise<void> {
  const handle = await AppUpdater.addListener('progress', (e) => onProgress(e.percent));
  try {
    await AppUpdater.downloadAndInstall({ url });
  } finally {
    await handle.remove();
  }
}
