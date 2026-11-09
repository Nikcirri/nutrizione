// Notifica locale quando il digiuno raggiunge l'obiettivo.
import { LocalNotifications } from '@capacitor/local-notifications';
import { formatHours } from '../logic/fasting';
import { isNative } from '../platform';
import type { Fast } from '../types';

const FAST_END_ID = 701;
const CHANNEL_ID = 'digiuno';
let channelReady = false;

async function ensureChannel(): Promise<void> {
  if (channelReady) return;
  await LocalNotifications.createChannel({
    id: CHANNEL_ID,
    name: 'Digiuno',
    description: 'Avviso quando raggiungi l’obiettivo del digiuno',
    importance: 4,
    visibility: 1,
  });
  channelReady = true;
}

export async function askNotificationPermission(): Promise<boolean> {
  if (!isNative()) return false;
  const current = await LocalNotifications.checkPermissions();
  if (current.display === 'granted') return true;
  const asked = await LocalNotifications.requestPermissions();
  return asked.display === 'granted';
}

export async function cancelFastNotification(): Promise<void> {
  if (!isNative()) return;
  await LocalNotifications.cancel({ notifications: [{ id: FAST_END_ID }] });
}

/** Programma (o toglie) l'avviso di fine digiuno. */
export async function scheduleFastNotification(fast: Fast | undefined, enabled: boolean): Promise<void> {
  if (!isNative()) return;
  await cancelFastNotification();
  if (!enabled || !fast || fast.end) return;
  const at = new Date(new Date(fast.start).getTime() + fast.targetHours * 3_600_000);
  if (at.getTime() <= Date.now() + 5_000) return;
  if (!(await askNotificationPermission())) return;
  await ensureChannel();
  await LocalNotifications.schedule({
    notifications: [
      {
        id: FAST_END_ID,
        title: 'Digiuno completato',
        body: `Hai raggiunto ${formatHours(fast.targetHours * 3_600_000)} di digiuno. Ricordati di fermare il timer quando mangi.`,
        schedule: { at, allowWhileIdle: true },
        channelId: CHANNEL_ID,
      },
    ],
  });
}
