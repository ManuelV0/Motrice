import { App } from '@capacitor/app';
import { Camera, CameraDirection } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { safeStorageGet, safeStorageRemove, safeStorageSet } from '../utils/safeStorage';

const PENDING_CAPTURE_KEY = 'motrice.profile-verification-camera-pending';
const RESTORED_CAPTURE_EVENT = 'motrice-profile-camera-restored';
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

let restoredCapture = null;
let restoreListenerPromise = null;

function normalizeKind(value) {
  return value === 'challenge' ? 'challenge' : 'profile';
}

function cameraError(message, code = 'CAMERA_UNAVAILABLE') {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isCancelledError(error) {
  const value = `${error?.code || ''} ${error?.message || ''}`.toLowerCase();
  return value.includes('cancel') || value.includes('user cancelled') || value.includes('user canceled');
}

function mimeFromFormat(format) {
  const value = String(format || '').toLowerCase();
  if (value === 'png') return 'image/png';
  if (value === 'webp') return 'image/webp';
  if (value === 'heic' || value === 'heif') return `image/${value}`;
  return 'image/jpeg';
}

function extensionFromMime(mime) {
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('heic')) return 'heic';
  if (mime.includes('heif')) return 'heif';
  return 'jpg';
}

function base64ToBlob(value, mime) {
  const binary = globalThis.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mime });
}

export async function cameraResultToFile(result, kind = 'profile') {
  if (!result) throw cameraError('La fotocamera non ha restituito alcuna immagine. Riprova.');

  const metadataMime = mimeFromFormat(result?.metadata?.format);
  let blob = null;

  const readablePath = result.webPath || (result.uri ? Capacitor.convertFileSrc(result.uri) : '');
  if (readablePath) {
    const response = await fetch(readablePath);
    if (!response.ok) throw cameraError('Non riesco a leggere la foto acquisita. Riprova.');
    blob = await response.blob();
  } else if (result.thumbnail) {
    blob = base64ToBlob(result.thumbnail, metadataMime);
  }

  if (!blob) throw cameraError('Foto non disponibile. Riapri la fotocamera e riprova.');
  if (blob.size > MAX_IMAGE_BYTES) {
    throw cameraError('La foto supera 8 MB. Riduci la qualità oppure usa la galleria.', 'IMAGE_TOO_LARGE');
  }

  const mime = blob.type?.startsWith('image/') ? blob.type : metadataMime;
  const filename = `motrice-${normalizeKind(kind)}-${Date.now()}.${extensionFromMime(mime)}`;
  return new File([blob], filename, { type: mime, lastModified: Date.now() });
}

export async function captureProfileVerificationPhoto(kind) {
  const captureKind = normalizeKind(kind);
  if (!Capacitor.isNativePlatform()) return null;

  const currentPermissions = await Camera.checkPermissions();
  let cameraPermission = currentPermissions.camera;
  if (cameraPermission === 'prompt' || cameraPermission === 'prompt-with-rationale') {
    const requested = await Camera.requestPermissions({ permissions: ['camera'] });
    cameraPermission = requested.camera;
  }
  if (cameraPermission !== 'granted') {
    throw cameraError(
      'Permesso fotocamera negato. Abilitalo nelle impostazioni del telefono oppure usa la galleria.',
      'CAMERA_PERMISSION_DENIED'
    );
  }

  safeStorageSet(PENDING_CAPTURE_KEY, captureKind);
  try {
    const result = await Camera.takePhoto({
      quality: 82,
      targetWidth: 1280,
      targetHeight: 1280,
      correctOrientation: true,
      saveToGallery: false,
      cameraDirection: CameraDirection.Front,
      editable: 'no',
      includeMetadata: true
    });
    safeStorageRemove(PENDING_CAPTURE_KEY);
    return cameraResultToFile(result, captureKind);
  } catch (error) {
    safeStorageRemove(PENDING_CAPTURE_KEY);
    if (isCancelledError(error)) return null;
    throw cameraError(
      error?.message || 'Fotocamera non disponibile. Riprova oppure usa la galleria.',
      error?.code || 'CAMERA_UNAVAILABLE'
    );
  }
}

export function consumeRestoredProfileCameraCapture() {
  const current = restoredCapture;
  restoredCapture = null;
  return current;
}

export function initializeProfileVerificationCamera() {
  if (!Capacitor.isNativePlatform()) return Promise.resolve(null);
  if (restoreListenerPromise) return restoreListenerPromise;

  restoreListenerPromise = App.addListener('appRestoredResult', (event) => {
    if (String(event?.pluginId || '').toLowerCase() !== 'camera') return;
    if (!['takePhoto', 'getPhoto'].includes(String(event?.methodName || ''))) return;

    const pendingKind = safeStorageGet(PENDING_CAPTURE_KEY);
    if (!pendingKind) return;
    const kind = normalizeKind(pendingKind);
    safeStorageRemove(PENDING_CAPTURE_KEY);
    restoredCapture = {
      kind,
      result: event?.success ? event?.data : null,
      error: event?.success ? '' : 'La fotocamera è stata interrotta. Riprova.'
    };

    if (typeof window !== 'undefined') {
      window.history.replaceState(window.history.state, '', '/verify-profile');
      window.dispatchEvent(new PopStateEvent('popstate'));
      window.dispatchEvent(new CustomEvent(RESTORED_CAPTURE_EVENT, { detail: restoredCapture }));
    }
  });

  return restoreListenerPromise;
}

export const profileCameraRestoredEvent = RESTORED_CAPTURE_EVENT;
