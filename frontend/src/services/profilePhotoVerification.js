import { getAuthSession } from './authSession';
import { isSupabaseConfigured, requireSupabase } from './supabaseClient';

const CANDIDATE_BUCKET = 'profile-photo-candidates';
const IDENTITY_BUCKET = 'profile-verification-private';
const PUBLIC_AVATAR_BUCKET = 'profile-avatars';
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function normalizeStatus(value) {
  const status = String(value || 'none').toLowerCase();
  return ['none', 'pending', 'approved', 'rejected', 'cancelled'].includes(status)
    ? status
    : 'none';
}

function normalizeRequest(raw) {
  return {
    ...(raw || {}),
    request_id: String(raw?.request_id || ''),
    user_id: String(raw?.user_id || ''),
    status: normalizeStatus(raw?.status),
    rejection_reason: String(raw?.rejection_reason || ''),
    review_method: String(raw?.review_method || 'manual'),
    submitted_at: raw?.submitted_at || null,
    reviewed_at: raw?.reviewed_at || null,
    approved_avatar_url: String(raw?.approved_avatar_url || raw?.avatar_url || '')
  };
}

function extensionFor(file) {
  const type = String(file?.type || '').toLowerCase();
  if (type === 'image/png') return 'png';
  if (type === 'image/webp') return 'webp';
  return 'jpg';
}

function validateImage(file) {
  if (!file || typeof file !== 'object') throw new Error('Seleziona una foto');
  if (Number(file.size || 0) > MAX_IMAGE_BYTES) {
    throw new Error('La foto non può superare 8 MB');
  }
  if (!ALLOWED_IMAGE_TYPES.has(String(file.type || '').toLowerCase())) {
    throw new Error('Usa una foto JPG, PNG o WebP');
  }
}

async function verifyFacePresenceWhenAvailable(file) {
  if (typeof globalThis.FaceDetector !== 'function' || typeof createImageBitmap !== 'function') {
    return { checked: false, faceCount: null };
  }

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
    const detector = new globalThis.FaceDetector({ fastMode: true, maxDetectedFaces: 2 });
    const faces = await detector.detect(bitmap);
    if (faces.length === 0) throw new Error('Nessun volto rilevato. Scegli una foto frontale e ben illuminata.');
    if (faces.length > 1) throw new Error('La foto deve contenere una sola persona.');
    return { checked: true, faceCount: 1 };
  } catch (error) {
    if (error?.message?.includes('volto') || error?.message?.includes('persona')) throw error;
    return { checked: false, faceCount: null };
  } finally {
    bitmap?.close?.();
  }
}

async function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result || '')));
    reader.addEventListener('error', () => reject(new Error('Lettura foto non riuscita')));
    reader.readAsDataURL(file);
  });
}

export async function getMyProfilePhotoChange() {
  const session = getAuthSession();
  if (!isSupabaseConfigured || !session?.authUserId) return normalizeRequest(null);
  const client = requireSupabase();
  const { data, error } = await client.rpc('get_my_profile_photo_change');
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883') return normalizeRequest(null);
    throw new Error(error.message || 'Impossibile caricare lo stato della foto profilo');
  }
  return normalizeRequest(data);
}

export async function submitProfilePhotoChange(file) {
  validateImage(file);
  await verifyFacePresenceWhenAvailable(file);

  const session = getAuthSession();
  if (!isSupabaseConfigured || !session?.authUserId) {
    return {
      ...normalizeRequest({ status: 'approved', reviewed_at: new Date().toISOString() }),
      approved_avatar_url: await readAsDataUrl(file),
      local: true
    };
  }

  const client = requireSupabase();
  const nonce = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const path = `${session.authUserId}/candidate-${Date.now()}-${nonce}.${extensionFor(file)}`;
  const { error: uploadError } = await client.storage.from(CANDIDATE_BUCKET).upload(path, file, {
    cacheControl: '300',
    contentType: file.type,
    upsert: false
  });
  if (uploadError) throw new Error(uploadError.message || 'Caricamento foto non riuscito');

  try {
    const { data, error } = await client.rpc('submit_profile_photo_change', {
      p_candidate_path: path,
      p_candidate_mime_type: file.type,
      p_consent: true
    });
    if (error) throw error;
    return normalizeRequest(data);
  } catch (error) {
    await client.storage.from(CANDIDATE_BUCKET).remove([path]).catch(() => {});
    throw new Error(error?.message || 'Invio della foto al controllo non riuscito');
  }
}

export async function listProfilePhotoChangeRequests(status = 'pending') {
  if (!isSupabaseConfigured) throw new Error('Supabase non configurato');
  const client = requireSupabase();
  const normalizedStatus = ['pending', 'reviewed', 'all'].includes(status) ? status : 'pending';
  const { data, error } = await client.rpc('list_profile_photo_changes', {
    filter_status: normalizedStatus
  });
  if (error) throw new Error(error.message || 'Impossibile caricare le foto da confrontare');

  return Promise.all((Array.isArray(data) ? data : []).map(async (raw) => {
    const request = normalizeRequest(raw);
    const identityReference = String(raw?.identity_reference || '').trim();
    const candidatePath = String(raw?.candidate_path || '').trim();
    const identityIsPublic = /^https?:\/\//i.test(identityReference);
    const [identityResult, candidateResult] = await Promise.all([
      identityReference && !identityIsPublic
        ? client.storage.from(IDENTITY_BUCKET).createSignedUrl(identityReference, 5 * 60)
        : Promise.resolve({ data: null, error: null }),
      candidatePath
        ? client.storage.from(CANDIDATE_BUCKET).createSignedUrl(candidatePath, 5 * 60)
        : Promise.resolve({ data: null, error: null })
    ]);

    return {
      ...request,
      display_name: String(raw?.display_name || 'Utente Motrice'),
      current_avatar_url: String(raw?.current_avatar_url || ''),
      identity_reference_url: identityIsPublic
        ? identityReference
        : identityResult.error ? '' : String(identityResult.data?.signedUrl || ''),
      candidate_url: candidateResult.error ? '' : String(candidateResult.data?.signedUrl || ''),
      candidate_path: candidatePath,
      candidate_mime_type: String(raw?.candidate_mime_type || 'image/jpeg')
    };
  }));
}

export async function reviewProfilePhotoChange(request, decision, reason = '') {
  if (!isSupabaseConfigured) throw new Error('Supabase non configurato');
  const normalizedDecision = String(decision || '').toLowerCase();
  if (!['approved', 'rejected'].includes(normalizedDecision)) throw new Error('Esito non valido');
  if (!request?.request_id) throw new Error('Richiesta non valida');

  const client = requireSupabase();
  let avatarPath = '';
  let avatarUrl = '';

  try {
    if (normalizedDecision === 'approved') {
      if (!request.candidate_url || !request.user_id) throw new Error('Foto candidata non disponibile');
      const response = await fetch(request.candidate_url, { cache: 'no-store' });
      if (!response.ok) throw new Error('Impossibile leggere la foto candidata');
      const blob = await response.blob();
      const extension = extensionFor({ type: request.candidate_mime_type || blob.type });
      avatarPath = `${request.user_id}/avatar-approved-${Date.now()}.${extension}`;
      const { error: uploadError } = await client.storage.from(PUBLIC_AVATAR_BUCKET).upload(avatarPath, blob, {
        cacheControl: '3600',
        contentType: request.candidate_mime_type || blob.type || 'image/jpeg',
        upsert: false
      });
      if (uploadError) throw uploadError;
      const { data: publicData } = client.storage.from(PUBLIC_AVATAR_BUCKET).getPublicUrl(avatarPath);
      avatarUrl = String(publicData?.publicUrl || '').trim();
      if (!avatarUrl) throw new Error('URL avatar approvato non disponibile');
    }

    const { data, error } = await client.rpc('review_profile_photo_change', {
      p_request_id: request.request_id,
      p_decision: normalizedDecision,
      p_avatar_path: avatarPath,
      p_avatar_url: avatarUrl,
      p_reason: String(reason || '').trim(),
      p_match_score: null,
      p_review_method: 'manual'
    });
    if (error) throw error;

    if (request.candidate_path) {
      await client.storage.from(CANDIDATE_BUCKET).remove([request.candidate_path]).catch(() => {});
    }
    return normalizeRequest(data);
  } catch (error) {
    if (avatarPath) {
      await client.storage.from(PUBLIC_AVATAR_BUCKET).remove([avatarPath]).catch(() => {});
    }
    throw new Error(error?.message || 'Revisione della foto non riuscita');
  }
}
