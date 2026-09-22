import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GYM_ACCESS_CONTACT_VENUE,
  GYM_ENTRY_DAY_PASS,
  GYM_ENTRY_MEMBER,
  GYM_ENTRY_TRIAL,
  GYM_VIEWER_ACCESS_MEMBER,
  GYM_VIEWER_ACCESS_MEMBER_DECLARED,
  GYM_VIEWER_ACCESS_SELECTION_REQUIRED,
  GYM_VIEWER_ACCESS_TRIAL,
  VENUE_TYPE_GYM,
  VENUE_TYPE_STANDARD,
  getGymAccessPresentation,
  isGymEvent,
  normalizeGymAccessPolicy,
  normalizeGymEntryChoice,
  normalizeGymVenueKey,
  resolveGymViewerAccess,
  normalizeVenueType
} from './eventVenueAccess.js';

test('normalizza il tipo di luogo senza confondere lo sport con una palestra fisica', () => {
  assert.equal(normalizeVenueType(VENUE_TYPE_GYM), VENUE_TYPE_GYM);
  assert.equal(normalizeVenueType('outdoor'), VENUE_TYPE_STANDARD);
  assert.equal(isGymEvent({ sport_name: 'Palestra outdoor' }), false);
});

test('la palestra delega sempre la scelta di ingresso al partecipante', () => {
  assert.equal(normalizeGymAccessPolicy(VENUE_TYPE_GYM, ''), GYM_ACCESS_CONTACT_VENUE);
  assert.equal(normalizeGymAccessPolicy(VENUE_TYPE_STANDARD, GYM_ACCESS_CONTACT_VENUE), null);
});

test('prima della richiesta presenta una scelta personale, non una regola dell organizzatore', () => {
  const event = { venue_type: VENUE_TYPE_GYM, gym_access_policy: GYM_ACCESS_CONTACT_VENUE };
  const access = resolveGymViewerAccess(event);
  assert.equal(access.status, GYM_VIEWER_ACCESS_SELECTION_REQUIRED);
  assert.equal(access.can_participate, true);
  assert.equal(getGymAccessPresentation(event, access).label, 'Scegli il tuo tipo di ingresso');
});

test('distingue la prova palestra dagli eventi prova Motrice', () => {
  const event = { venue_type: VENUE_TYPE_GYM, gym_access_policy: GYM_ACCESS_CONTACT_VENUE };
  const access = resolveGymViewerAccess(event, null, false, GYM_ENTRY_TRIAL);
  assert.equal(access.status, GYM_VIEWER_ACCESS_TRIAL);
  assert.equal(access.can_participate, true);
  assert.equal(getGymAccessPresentation(event, access).label, 'Prima prova gratuita');
});

test('non concede una seconda prova nella stessa palestra', () => {
  const event = { venue_type: VENUE_TYPE_GYM, gym_access_policy: GYM_ACCESS_CONTACT_VENUE };
  const access = resolveGymViewerAccess(event, null, true, GYM_ENTRY_TRIAL);
  assert.equal(access.status, 'trial_used');
  assert.equal(access.can_participate, false);
});

test('un abbonamento verificato viene proposto automaticamente', () => {
  const event = { venue_type: VENUE_TYPE_GYM, gym_access_policy: GYM_ACCESS_CONTACT_VENUE };
  const access = resolveGymViewerAccess(event, { status: 'active', ends_at: '2999-01-01T00:00:00Z' });
  assert.equal(access.status, GYM_VIEWER_ACCESS_MEMBER);
  assert.equal(access.entry_price_cents, 0);
  assert.equal(getGymAccessPresentation(event, access).shortLabel, 'Accesso incluso');
});

test('il partecipante può dichiarare abbonamento o ingresso giornaliero', () => {
  const event = { venue_type: VENUE_TYPE_GYM };
  const declaredMember = resolveGymViewerAccess(event, null, false, GYM_ENTRY_MEMBER);
  const dayPass = resolveGymViewerAccess(event, null, false, GYM_ENTRY_DAY_PASS);
  assert.equal(declaredMember.status, GYM_VIEWER_ACCESS_MEMBER_DECLARED);
  assert.equal(dayPass.status, 'day_pass');
  assert.equal(dayPass.can_participate, true);
  assert.equal(normalizeGymEntryChoice('invalid'), null);
});

test('genera una chiave palestra stabile e leggibile', () => {
  assert.equal(normalizeGymVenueKey('Phìsiko Restyle Gym, Ascoli Piceno'), 'phisiko-restyle-gym-ascoli-piceno');
});
