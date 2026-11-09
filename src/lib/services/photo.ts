// Foto del piatto: fotocamera o galleria, poi rimpicciolita (max 768 px) per mandarla velocemente all'AI.
import { Camera, CameraDirection, MediaTypeSelection } from '@capacitor/camera';
import { isNative } from '../platform';

/** Per riconoscere il cibo basta: una foto più piccola parte e viene analizzata prima. */
const MAX_SIDE = 768;

function isCancel(e: unknown): boolean {
  const text = `${(e as { code?: string })?.code ?? ''} ${(e as Error)?.message ?? e}`;
  return /cancel|annull|OS-PLUG-CAMR-0006|OS-PLUG-CAMR-0020/i.test(text);
}

async function webPathToBlob(webPath: string): Promise<Blob> {
  const res = await fetch(webPath);
  if (!res.ok) throw new Error('Impossibile leggere la foto');
  return res.blob();
}

function pickFromInput(capture: boolean): Promise<Blob | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (capture) input.setAttribute('capture', 'environment');
    input.style.display = 'none';
    let done = false;
    const finish = (file: Blob | null) => {
      if (done) return;
      done = true;
      input.remove();
      resolve(file);
    };
    input.addEventListener('change', () => finish(input.files?.[0] ?? null));
    input.addEventListener('cancel', () => finish(null));
    document.body.append(input);
    input.click();
  });
}

/** Scatta una foto con la fotocamera posteriore. null se l'utente annulla. */
export async function takeMealPhoto(): Promise<Blob | null> {
  if (!isNative()) return pickFromInput(true);
  try {
    const res = await Camera.takePhoto({
      quality: 85,
      correctOrientation: true,
      cameraDirection: CameraDirection.Rear,
      editable: 'no',
      saveToGallery: false,
    });
    return res.webPath ? await webPathToBlob(res.webPath) : null;
  } catch (e) {
    if (isCancel(e)) return null;
    throw e;
  }
}

/** Sceglie una foto dalla galleria. null se l'utente annulla. */
export async function chooseMealPhoto(): Promise<Blob | null> {
  if (!isNative()) return pickFromInput(false);
  try {
    const res = await Camera.chooseFromGallery({
      mediaType: MediaTypeSelection.Photo,
      allowMultipleSelection: false,
      limit: 1,
      correctOrientation: true,
      quality: 85,
    });
    const path = res.results[0]?.webPath;
    return path ? await webPathToBlob(path) : null;
  } catch (e) {
    if (isCancel(e)) return null;
    throw e;
  }
}

export interface PreparedImage {
  base64: string;
  mime: string;
  dataUrl: string;
}

/** Rimpicciolisce la foto e la trasforma in JPEG (base64). */
export async function prepareImage(blob: Blob): Promise<PreparedImage> {
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas non disponibile');
    ctx.drawImage(bitmap, 0, 0, w, h);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.75);
    return { dataUrl, mime: 'image/jpeg', base64: dataUrl.slice(dataUrl.indexOf(',') + 1) };
  } finally {
    bitmap.close();
  }
}
