import { App } from '@capacitor/app';
import { Capacitor, registerPlugin } from '@capacitor/core';
import {
  checkNativeProfileCameraPermission,
  requestNativeProfileCameraPermission
} from '../utils/profileCameraPermission';
import { safeStorageGet, safeStorageRemove, safeStorageSet } from '../utils/safeStorage';

const PENDING_CAPTURE_KEY = 'motrice.profile-verification-camera-pending';
const RESTORED_CAPTURE_EVENT = 'motrice-profile-camera-restored';
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

let restoredCapture = null;
let restoreListenerPromise = null;

const ProfileVerificationCamera = registerPlugin('ProfileVerificationCamera');

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

function isSafeNativeCameraResult(result) {
  return result?.provider === 'motrice-native-safe-camera' && result?.temporary === true;
}

async function removeTemporaryNativePhoto(result) {
  if (!Capacitor.isNativePlatform() || !isSafeNativeCameraResult(result) || !result?.uri) return;
  try {
    await ProfileVerificationCamera.deleteTemporaryPhoto({ uri: result.uri });
  } catch {
    // Android also clears stale verification photos automatically. Failure to
    // delete a cache file must never block the user's verification flow.
  }
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

  const metadataMime = result?.mimeType || mimeFromFormat(result?.format || result?.metadata?.format);
  let blob = null;

  try {
    const readablePath = result.webPath || (result.uri ? Capacitor.convertFileSrc(result.uri) : '');
    if (readablePath) {
      const response = await fetch(readablePath);
      if (!response.ok) throw cameraError('Non riesco a leggere la foto acquisita. Riprova.');
      blob = await response.blob();
    } else if (result.thumbnail) {
      blob = base64ToBlob(result.thumbnail, metadataMime);
    }
  } finally {
    await removeTemporaryNativePhoto(result);
  }

  if (!blob) throw cameraError('Foto non disponibile. Riapri la fotocamera e riprova.');
  if (blob.size > MAX_IMAGE_BYTES) {
    throw cameraError('La foto supera 8 MB. Riduci la qualità oppure usa la galleria.', 'IMAGE_TOO_LARGE');
  }

  const mime = blob.type?.startsWith('image/') ? blob.type : metadataMime;
  const filename = `motrice-${normalizeKind(kind)}-${Date.now()}.${extensionFromMime(mime)}`;
  return new File([blob], filename, { type: mime, lastModified: Date.now() });
}

export async function getProfileCameraPermission() {
  if (!Capacitor.isNativePlatform()) return 'web';
  try {
    // The Motrice plugin owns an explicit permission callback. Do not replace
    // this with Capacitor's generic checkPermissions/requestPermissions bridge:
    // on some Android devices that inherited bridge can dereference a missing
    // callback and terminate the native process.
    return await checkNativeProfileCameraPermission(ProfileVerificationCamera);
  } catch {
    return 'unavailable';
  }
}

export async function requestProfileCameraPermission() {
  if (!Capacitor.isNativePlatform()) return 'web';

  let cameraPermission = await getProfileCameraPermission();
  if (cameraPermission === 'granted') return cameraPermission;

  try {
    // Request again even when Android reports "denied": after a first refusal
    // the system can still show its native prompt. Only Android can grant this
    // permission; Motrice never tries to bypass the operating system dialog.
    cameraPermission = await requestNativeProfileCameraPermission(ProfileVerificationCamera);
  } catch {
    cameraPermission = 'denied';
  }

  return cameraPermission;
}

export async function captureProfileVerificationPhoto(kind) {
  const captureKind = normalizeKind(kind);
  if (!Capacitor.isNativePlatform()) return null;

  // Start registering the restoration listener before Android leaves the
  // WebView, but never block the camera on the listener acknowledgement. Some
  // Android WebViews can leave App.addListener() pending even though the app is
  // healthy; waiting here used to leave the button stuck on "Apertura…" and
  // the native camera was never called.
  initializeProfileVerificationCamera().catch(() => {});
  const cameraPermission = await requestProfileCameraPermission();
  if (cameraPermission !== 'granted') {
    throw cameraError(
      'Permesso fotocamera non concesso. Tocca di nuovo il pulsante di scatto e scegli “Consenti” nella finestra di Android.',
      'CAMERA_PERMISSION_DENIED'
    );
  }

  safeStorageSet(PENDING_CAPTURE_KEY, captureKind);
  try {
    const result = await ProfileVerificationCamera.takeVerificationPhoto({
      kind: captureKind,
      quality: 76,
      maxDimension: 1080,
      preferFrontCamera: true
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
    const pluginId = String(event?.pluginId || '').toLowerCase();
    const methodName = String(event?.methodName || '');
    const isSafeCamera = pluginId === 'profileverificationcamera' && methodName === 'takeVerificationPhoto';
    const isLegacyCamera = pluginId === 'camera' && ['takePhoto', 'getPhoto'].includes(methodName);
    if (!isSafeCamera && !isLegacyCamera) return;

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
