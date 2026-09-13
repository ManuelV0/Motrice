import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GYM_ACCESS_CONTACT_VENUE,
  GYM_ACCESS_MEMBERS_OR_TRIAL,
  GYM_ACCESS_MEMBERS_ONLY,
  GYM_VIEWER_ACCESS_MEMBER,
  GYM_VIEWER_ACCESS_TRIAL,
  VENUE_TYPE_GYM,
  VENUE_TYPE_STANDARD,
  getGymAccessPresentation,
  isGymEvent,
  normalizeGymAccessPolicy,
  normalizeGymVenueKey,
  resolveGymViewerAccess,
  normalizeVenueType
} from './eventVenueAccess.js';

test('normalizza il tipo di luogo senza confondere lo sport con una palestra fisica', () => {
  assert.equal(normalizeVenueType(VENUE_TYPE_GYM), VENUE_TYPE_GYM);
  assert.equal(normalizeVenueType('outdoor'), VENUE_TYPE_STANDARD);
  assert.equal(isGymEvent({ sport_name: 'Palestra outdoor' }), false);
});

test('la palestra usa una politica di accesso sicura per impostazione predefinita', () => {
  assert.equal(normalizeGymAccessPolicy(VENUE_TYPE_GYM, ''), GYM_ACCESS_MEMBERS_ONLY);
  assert.equal(normalizeGymAccessPolicy(VENUE_TYPE_STANDARD, GYM_ACCESS_CONTACT_VENUE), null);
});

test('presenta in modo coerente le due condizioni di accesso beta', () => {
  assert.equal(
    getGymAccessPresentation({ venue_type: VENUE_TYPE_GYM, gym_access_policy: GYM_ACCESS_MEMBERS_ONLY }).label,
    'Abbonamento richiesto'
  );
  assert.equal(
    getGymAccessPresentation({ venue_type: VENUE_TYPE_GYM, gym_access_policy: GYM_ACCESS_CONTACT_VENUE }).label,
    'Ingresso da concordare'
  );
});

test('distingue la prova palestra dagli eventi prova Motrice', () => {
  const event = { venue_type: VENUE_TYPE_GYM, gym_access_policy: GYM_ACCESS_MEMBERS_OR_TRIAL };
  const access = resolveGymViewerAccess(event, null, false);
  assert.equal(access.status, GYM_VIEWER_ACCESS_TRIAL);
  assert.equal(access.can_participate, true);
  assert.equal(getGymAccessPresentation(event, access).label, 'Prima prova gratuita');
});

test('non concede una seconda prova nella stessa palestra', () => {
  const event = { venue_type: VENUE_TYPE_GYM, gym_access_policy: GYM_ACCESS_MEMBERS_OR_TRIAL };
  const access = resolveGymViewerAccess(event, null, true);
  assert.equal(access.status, 'trial_used');
  assert.equal(access.can_participate, false);
});

test('un abbonamento attivo prevale sulla politica della palestra', () => {
  const event = { venue_type: VENUE_TYPE_GYM, gym_access_policy: GYM_ACCESS_MEMBERS_ONLY };
  const access = resolveGymViewerAccess(event, { status: 'active', ends_at: '2999-01-01T00:00:00Z' });
  assert.equal(access.status, GYM_VIEWER_ACCESS_MEMBER);
  assert.equal(access.entry_price_cents, 0);
  assert.equal(getGymAccessPresentation(event, access).shortLabel, 'Accesso incluso');
});

test('genera una chiave palestra stabile e leggibile', () => {
  assert.equal(normalizeGymVenueKey('Phìsiko Restyle Gym, Ascoli Piceno'), 'phisiko-restyle-gym-ascoli-piceno');
});
