import { getAuthSession } from './authSession';
import { isSupabaseConfigured, requireSupabase } from './supabaseClient';

const PROFILE_MEDIA_BUCKET = 'profile-avatars';
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function extensionFor(file) {
  const type = String(file?.type || '').toLowerCase();
  if (type === 'image/png') return 'png';
  if (type === 'image/webp') return 'webp';
  return 'jpg';
}

function validateImage(file) {
  if (!file || typeof file !== 'object') throw new Error('Seleziona un’immagine');
  if (Number(file.size || 0) > MAX_IMAGE_BYTES) throw new Error('L’immagine non può superare 8 MB');
  if (!ALLOWED_IMAGE_TYPES.has(String(file.type || '').toLowerCase())) {
    throw new Error('Usa un’immagine JPG, PNG o WebP');
  }
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result || '')));
    reader.addEventListener('error', () => reject(new Error('Lettura immagine non riuscita')));
    reader.readAsDataURL(file);
  });
}

export async function uploadProfileMedia(file, kind = 'avatar') {
  validateImage(file);
  const normalizedKind = kind === 'cover' ? 'cover' : 'avatar';
  const session = getAuthSession();

  if (!isSupabaseConfigured || !session?.authUserId) {
    return readAsDataUrl(file);
  }

  const client = requireSupabase();
  const path = `${session.authUserId}/${normalizedKind}.${extensionFor(file)}`;
  const { error } = await client.storage.from(PROFILE_MEDIA_BUCKET).upload(path, file, {
    cacheControl: '3600',
    contentType: file.type,
    upsert: true
  });
  if (error) throw new Error(error.message || 'Caricamento immagine non riuscito');

  const { data } = client.storage.from(PROFILE_MEDIA_BUCKET).getPublicUrl(path);
  const publicUrl = String(data?.publicUrl || '').trim();
  if (!publicUrl) throw new Error('URL immagine non disponibile');
  return `${publicUrl}?v=${Date.now()}`;
}
