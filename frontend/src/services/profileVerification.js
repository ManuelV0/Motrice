import { getAuthSession } from './authSession';
import { isSupabaseConfigured, requireSupabase } from './supabaseClient';
import { safeStorageGet, safeStorageSet } from '../utils/safeStorage';

const LOCAL_STATE_PREFIX = 'motrice.profile-verification.';
const ONBOARDING_PREFIX = 'motrice.profile-verification-onboarding.';
const PRIVATE_BUCKET = 'profile-verification-private';
const AVATAR_BUCKET = 'profile-avatars';
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const allowedStatuses = new Set([
  'unverified',
  'pending',
  'verified',
  'rejected',
  'expired',
  'suspended'
]);

function sessionKey(prefix) {
  const session = getAuthSession();
  return `${prefix}${session?.authUserId || session?.userId || 'guest'}`;
}

function normalizeStatus(value) {
  const status = String(value || 'unverified').toLowerCase();
  return allowedStatuses.has(status) ? status : 'unverified';
}

function emptySummary() {
  return {
    status: 'unverified',
    submitted_at: null,
    verified_at: null,
    expires_at: null,
    rejection_reason: '',
    challenge_type: '',
    enforcement_enabled: true,
    can_use_verified_actions: false
  };
}

function normalizeSummary(raw) {
  const status = normalizeStatus(raw?.status);
  const expiresAt = raw?.expires_at || null;
  const isExpired = status === 'verified' && expiresAt && Date.parse(expiresAt) <= Date.now();
  const resolvedStatus = isExpired ? 'expired' : status;
  return {
    ...emptySummary(),
    ...(raw || {}),
    status: resolvedStatus,
    rejection_reason: String(raw?.rejection_reason || ''),
    challenge_type: String(raw?.challenge_type || ''),
    enforcement_enabled: raw?.enforcement_enabled !== false,
    // Fail closed: la UI non deve mai sbloccare le azioni sensibili usando
    // una risposta precedente al rollout o una cache locale con enforcement
    // disattivato. Solo lo stato effettivo "verified" abilita crea/partecipa.
    can_use_verified_actions: resolvedStatus === 'verified'
  };
}

function readLocalSummary() {
  try {
    return normalizeSummary(JSON.parse(safeStorageGet(sessionKey(LOCAL_STATE_PREFIX)) || 'null'));
  } catch {
    return emptySummary();
  }
}

function writeLocalSummary(summary) {
  const normalized = normalizeSummary(summary);
  safeStorageSet(sessionKey(LOCAL_STATE_PREFIX), JSON.stringify(normalized));
  return normalized;
}

function isMissingRpc(error, functionName) {
  const message = String(error?.message || '').toLowerCase();
  return error?.code === '42883' || error?.code === 'PGRST202' || message.includes(functionName);
}

function ensureImage(file, label) {
  if (!file || typeof file !== 'object') throw new Error(`${label} obbligatoria`);
  if (Number(file.size || 0) > MAX_IMAGE_BYTES) {
    throw new Error(`${label}: dimensione massima 8 MB`);
  }
  const mime = String(file.type || '').toLowerCase();
  if (mime && !mime.startsWith('image/')) throw new Error(`${label}: formato non supportato`);
}

function fileExtension(file) {
  const mime = String(file?.type || '').toLowerCase();
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('heic')) return 'heic';
  if (mime.includes('heif')) return 'heif';
  return 'jpg';
}

async function uploadImage(client, bucket, userId, kind, file) {
  const nonce = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const path = `${userId}/${kind}-${Date.now()}-${nonce}.${fileExtension(file)}`;
  const { error } = await client.storage.from(bucket).upload(path, file, {
    cacheControl: '3600',
    contentType: file.type || 'image/jpeg',
    upsert: false
  });
  if (error) throw new Error(error.message || `Caricamento ${kind} non riuscito`);
  return { bucket, path };
}

export function hasSeenProfileVerificationOnboarding() {
  return safeStorageGet(sessionKey(ONBOARDING_PREFIX)) === '1';
}

export function markProfileVerificationOnboardingSeen() {
  safeStorageSet(sessionKey(ONBOARDING_PREFIX), '1');
}

export function shouldOfferProfileVerificationOnboarding(session = getAuthSession()) {
  return Boolean(session?.isAuthenticated && !hasSeenProfileVerificationOnboarding());
}

export function isProfileVerificationAdmin(session = getAuthSession()) {
  return ['admin', 'moderator'].includes(String(session?.role || '').toLowerCase());
}

export async function canReviewProfileVerifications() {
  const session = getAuthSession();
  if (!session?.isAuthenticated) return false;
  if (!isSupabaseConfigured || !session?.authUserId) return isProfileVerificationAdmin(session);

  const client = requireSupabase();
  const { data, error } = await client.rpc('get_profile_verification_admin_access');
  if (error) {
    if (isMissingRpc(error, 'get_profile_verification_admin_access')) {
      return isProfileVerificationAdmin(session);
    }
    return false;
  }
  return Boolean(data);
}

export async function getMyProfileVerification() {
  const session = getAuthSession();
  if (!isSupabaseConfigured || !session?.authUserId) return readLocalSummary();
  const client = requireSupabase();
  const { data, error } = await client.rpc('get_my_profile_verification');
  if (error) {
    if (isMissingRpc(error, 'get_my_profile_verification')) return readLocalSummary();
    throw new Error(error.message || 'Impossibile caricare la verifica del profilo');
  }
  const summary = normalizeSummary(data);
  writeLocalSummary(summary);
  return summary;
}

export async function getPublicProfileVerification(targetUserId) {
  const targetId = String(targetUserId || '').trim();
  if (!targetId) return emptySummary();
  if (!isSupabaseConfigured || !getAuthSession()?.authUserId) return emptySummary();
  const client = requireSupabase();
  const { data, error } = await client.rpc('get_profile_verification_status', {
    target_user_id: targetId
  });
  if (error) {
    if (isMissingRpc(error, 'get_profile_verification_status')) return emptySummary();
    throw new Error(error.message || 'Impossibile leggere lo stato del profilo');
  }
  return normalizeSummary(data);
}

export async function submitProfileVerification({
  firstName,
  lastName,
  birthDate,
  city,
  primarySport,
  sportLevel,
  bio,
  challengeType,
  profilePhoto,
  challengePhoto
}) {
  ensureImage(profilePhoto, 'Foto profilo');
  ensureImage(challengePhoto, 'Foto challenge');

  const payload = {
    first_name: String(firstName || '').trim(),
    last_name: String(lastName || '').trim(),
    birth_date: String(birthDate || ''),
    city: String(city || '').trim(),
    primary_sport: String(primarySport || '').trim(),
    sport_level: String(sportLevel || 'beginner').trim(),
    bio: String(bio || '').trim(),
    challenge_type: String(challengeType || 'open_hand').trim()
  };

  if (!payload.first_name || !payload.last_name) throw new Error('Inserisci nome e cognome');
  if (!payload.birth_date) throw new Error('Inserisci la data di nascita');
  if (!payload.city) throw new Error('Inserisci la città');
  if (!payload.primary_sport) throw new Error('Seleziona lo sport principale');

  const session = getAuthSession();
  if (!isSupabaseConfigured || !session?.authUserId) {
    markProfileVerificationOnboardingSeen();
    return writeLocalSummary({
      status: 'pending',
      submitted_at: new Date().toISOString(),
      challenge_type: payload.challenge_type
    });
  }

  const client = requireSupabase();
  const uploaded = [];
  try {
    const profileUpload = await uploadImage(
      client,
      AVATAR_BUCKET,
      session.authUserId,
      'profile',
      profilePhoto
    );
    uploaded.push(profileUpload);
    const challengeUpload = await uploadImage(
      client,
      PRIVATE_BUCKET,
      session.authUserId,
      'challenge',
      challengePhoto
    );
    uploaded.push(challengeUpload);
    const { data: publicAvatar } = client.storage
      .from(AVATAR_BUCKET)
      .getPublicUrl(profileUpload.path);

    const { data, error } = await client.rpc('submit_profile_verification', {
      p_first_name: payload.first_name,
      p_last_name: payload.last_name,
      p_birth_date: payload.birth_date,
      p_city: payload.city,
      p_primary_sport: payload.primary_sport,
      p_sport_level: payload.sport_level,
      p_bio: payload.bio,
      p_challenge_type: payload.challenge_type,
      p_profile_photo_url: publicAvatar?.publicUrl || '',
      p_challenge_photo_path: challengeUpload.path
    });
    if (error) throw error;

    markProfileVerificationOnboardingSeen();
    const summary = normalizeSummary(data);
    writeLocalSummary(summary);
    return summary;
  } catch (error) {
    if (uploaded.length) {
      await Promise.all(
        uploaded.map((item) => client.storage.from(item.bucket).remove([item.path]).catch(() => {}))
      );
    }
    throw new Error(error?.message || 'Invio della verifica non riuscito');
  }
}

export async function assertProfileVerified(actionLabel = 'continuare') {
  const session = getAuthSession();
  if (!session?.isAuthenticated) throw new Error('Accedi per continuare');
  const summary = await getMyProfileVerification();
  if (summary.can_use_verified_actions) return summary;

  const reason = {
    pending: 'La verifica del profilo è ancora in revisione.',
    rejected: 'La verifica del profilo deve essere ripetuta.',
    expired: 'La verifica del profilo è scaduta.',
    suspended: 'Il profilo è sospeso.',
    unverified: 'Prima devi verificare il profilo.'
  }[summary.status] || 'Prima devi verificare il profilo.';

  const error = new Error(`${reason} Completa la verifica per ${actionLabel}`);
  error.code = 'PROFILE_VERIFICATION_REQUIRED';
  error.verificationStatus = summary.status;
  throw error;
}

export async function listProfileVerificationRequests(status = 'pending') {
  if (!isSupabaseConfigured) throw new Error('Supabase non configurato');
  const client = requireSupabase();
  const normalizedStatus = ['pending', 'reviewed', 'all'].includes(status) ? status : 'pending';
  const { data, error } = await client.rpc('list_profile_verifications', {
    filter_status: normalizedStatus
  });
  if (error) throw new Error(error.message || 'Impossibile caricare le verifiche');

  const requests = Array.isArray(data) ? data : [];
  return Promise.all(requests.map(async (request) => {
    const challengePath = String(request?.challenge_photo_path || '').trim();
    if (!challengePath) return { ...request, challenge_photo_url: '' };
    const { data: signed, error: signedError } = await client.storage
      .from(PRIVATE_BUCKET)
      .createSignedUrl(challengePath, 5 * 60);
    return {
      ...request,
      challenge_photo_url: signedError ? '' : String(signed?.signedUrl || '')
    };
  }));
}

export async function reviewProfileVerification(targetUserId, decision, reason = '') {
  if (!isSupabaseConfigured) throw new Error('Supabase non configurato');
  const normalizedDecision = String(decision || '').toLowerCase();
  if (!['verified', 'rejected', 'suspended'].includes(normalizedDecision)) {
    throw new Error('Esito verifica non valido');
  }
  const client = requireSupabase();
  const { data, error } = await client.rpc('review_profile_verification', {
    target_user_id: String(targetUserId || ''),
    decision: normalizedDecision,
    reason: String(reason || '').trim()
  });
  if (error) throw new Error(error.message || 'Revisione non riuscita');
  return normalizeSummary(data);
}
