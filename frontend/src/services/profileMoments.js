import { getAuthSession } from './authSession';
import { isSupabaseConfigured, requireSupabase } from './supabaseClient';

const PROFILE_MEDIA_BUCKET = 'profile-avatars';
const STORAGE_PREFIX = 'motrice.profile-moments.v1.';
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_MOMENTS = 18;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function createId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function extensionFor(file) {
  const type = String(file?.type || '').toLowerCase();
  if (type === 'image/png') return 'png';
  if (type === 'image/webp') return 'webp';
  return 'jpg';
}

function validateImage(file) {
  if (!file || typeof file !== 'object') throw new Error('Seleziona una foto');
  if (Number(file.size || 0) > MAX_IMAGE_BYTES) throw new Error('La foto non può superare 8 MB');
  if (!ALLOWED_IMAGE_TYPES.has(String(file.type || '').toLowerCase())) {
    throw new Error('Usa una foto JPG, PNG o WebP');
  }
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result || '')));
    reader.addEventListener('error', () => reject(new Error('Lettura foto non riuscita')));
    reader.readAsDataURL(file);
  });
}

function localKey(userId) {
  return `${STORAGE_PREFIX}${String(userId || 'guest')}`;
}

function readLocal(userId) {
  if (typeof window === 'undefined') return [];
  try {
    const rows = JSON.parse(window.localStorage.getItem(localKey(userId)) || '[]');
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function writeLocal(userId, rows) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(localKey(userId), JSON.stringify(rows));
  } catch {
    throw new Error('Spazio locale esaurito. Rimuovi una foto o usa un file più leggero.');
  }
}

function currentUserId() {
  const session = getAuthSession();
  return String(session?.authUserId || session?.userId || 'guest');
}

function isMissingMomentsTable(error) {
  const message = String(error?.message || '').toLowerCase();
  return error?.code === '42P01'
    || error?.code === 'PGRST205'
    || error?.code === 'PGRST202'
    || message.includes("could not find the table 'public.profile_moments'")
    || message.includes('relation "public.profile_moments" does not exist');
}

export async function getProfileMoments(targetUserId) {
  const session = getAuthSession();
  const requestedId = String(targetUserId || session?.authUserId || session?.userId || 'guest');

  if (!isSupabaseConfigured || !session?.authUserId || !isUuid(requestedId)) {
    return readLocal(requestedId);
  }

  const client = requireSupabase();
  const { data, error } = await client
    .from('profile_moments')
    .select('id,user_id,image_path,image_url,created_at')
    .eq('user_id', requestedId)
    .order('created_at', { ascending: false })
    .limit(MAX_MOMENTS);
  if (error) {
    if (isMissingMomentsTable(error)) {
      return requestedId === String(session.authUserId) ? readLocal(requestedId) : [];
    }
    throw new Error(error.message || 'Impossibile caricare i momenti');
  }
  return data || [];
}

export async function uploadProfileMoment(file) {
  validateImage(file);
  const session = getAuthSession();
  const userId = currentUserId();
  const current = await getProfileMoments(userId);
  if (current.length >= MAX_MOMENTS) {
    throw new Error(`Puoi pubblicare fino a ${MAX_MOMENTS} momenti`);
  }

  const id = createId();
  const createdAt = new Date().toISOString();

  if (!isSupabaseConfigured || !session?.authUserId) {
    const imageUrl = await readAsDataUrl(file);
    const row = { id, user_id: userId, image_path: '', image_url: imageUrl, created_at: createdAt };
    writeLocal(userId, [row, ...current]);
    return row;
  }

  const client = requireSupabase();
  const path = `${session.authUserId}/moments/${id}.${extensionFor(file)}`;
  const { error: uploadError } = await client.storage.from(PROFILE_MEDIA_BUCKET).upload(path, file, {
    cacheControl: '3600',
    contentType: file.type,
    upsert: false
  });
  if (uploadError) throw new Error(uploadError.message || 'Caricamento foto non riuscito');

  const { data: publicData } = client.storage.from(PROFILE_MEDIA_BUCKET).getPublicUrl(path);
  const imageUrl = String(publicData?.publicUrl || '').trim();
  if (!imageUrl) {
    await client.storage.from(PROFILE_MEDIA_BUCKET).remove([path]).catch(() => {});
    throw new Error('URL della foto non disponibile');
  }

  const { data, error } = await client
    .from('profile_moments')
    .insert({ id, user_id: session.authUserId, image_path: path, image_url: imageUrl })
    .select('id,user_id,image_path,image_url,created_at')
    .single();
  if (error) {
    await client.storage.from(PROFILE_MEDIA_BUCKET).remove([path]).catch(() => {});
    if (isMissingMomentsTable(error)) {
      const localImageUrl = await readAsDataUrl(file);
      const row = { id, user_id: userId, image_path: '', image_url: localImageUrl, created_at: createdAt };
      writeLocal(userId, [row, ...readLocal(userId)]);
      return row;
    }
    throw new Error(error.message || 'Salvataggio del momento non riuscito');
  }
  return data;
}

export async function deleteProfileMoment(moment) {
  const session = getAuthSession();
  const userId = currentUserId();
  const momentId = String(moment?.id || '');
  if (!momentId) throw new Error('Momento non valido');

  if (!isSupabaseConfigured || !session?.authUserId || !moment?.image_path) {
    const next = readLocal(userId).filter((item) => String(item.id) !== momentId);
    writeLocal(userId, next);
    return { success: true };
  }

  const client = requireSupabase();
  const { error } = await client
    .from('profile_moments')
    .delete()
    .eq('id', momentId)
    .eq('user_id', session.authUserId);
  if (error) throw new Error(error.message || 'Eliminazione non riuscita');

  const path = String(moment?.image_path || '').trim();
  if (path) await client.storage.from(PROFILE_MEDIA_BUCKET).remove([path]).catch(() => {});
  return { success: true };
}

export { MAX_MOMENTS };
