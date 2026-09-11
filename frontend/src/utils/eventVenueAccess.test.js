import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GYM_ACCESS_CONTACT_VENUE,
  GYM_ACCESS_MEMBERS_ONLY,
  VENUE_TYPE_GYM,
  VENUE_TYPE_STANDARD,
  getGymAccessPresentation,
  isGymEvent,
  normalizeGymAccessPolicy,
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
