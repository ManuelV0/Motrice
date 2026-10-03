import test from 'node:test';
import assert from 'node:assert/strict';
import { PREMIUM_FEATURES_FREE, getEntitlements } from './entitlements.js';

test('the open beta makes every Premium capability available to free users', () => {
  assert.equal(PREMIUM_FEATURES_FREE, true);

  const entitlements = getEntitlements('free');
  assert.equal(entitlements.maxEventsPerMonth, Number.POSITIVE_INFINITY);
  assert.equal(entitlements.canUseAdvancedFilters, true);
  assert.equal(entitlements.canUseAgendaWeekMonth, true);
  assert.equal(entitlements.canExportICS, true);
  assert.equal(entitlements.canUseNotifications, true);
  assert.equal(entitlements.canUseCoachChat, true);
  assert.equal(entitlements.premiumFeaturesFree, true);
});
