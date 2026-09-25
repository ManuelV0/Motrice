import assert from 'node:assert/strict';
import test from 'node:test';
import {
  XP_MARKETPLACE_PRODUCTS,
  XP_SPECIAL_ACHIEVEMENTS,
  XP_TIER_THRESHOLDS,
  getXpTierProgress,
  resolveAchievementStates,
  resolveMarketplaceProducts
} from '../features/xp/xpMarketplaceConfig.js';

const boundaryCases = [
  [0, []],
  [998, []],
  [999, ['normal']],
  [2998, ['normal']],
  [2999, ['normal', 'bronze']],
  [5999, ['normal', 'bronze', 'silver']],
  [9999, ['normal', 'bronze', 'silver', 'gold']],
  [14999, ['normal', 'bronze', 'silver', 'gold', 'platinum']],
  [15000, ['normal', 'bronze', 'silver', 'gold', 'platinum', 'diamond']]
];

test('uses the definitive XP clothing thresholds', () => {
  assert.deepEqual(XP_TIER_THRESHOLDS, {
    normal: 999,
    bronze: 2999,
    silver: 5999,
    gold: 9999,
    platinum: 14999,
    diamond: 15000
  });
});

test('keeps the complete catalogue visible for every tier and gender', () => {
  assert.equal(XP_MARKETPLACE_PRODUCTS.length, 48);
  for (const tier of Object.keys(XP_TIER_THRESHOLDS)) {
    const tierProducts = XP_MARKETPLACE_PRODUCTS.filter((item) => item.tier === tier);
    assert.equal(tierProducts.length, 8);
    assert.equal(tierProducts.filter((item) => item.gender === 'uomo').length, 4);
    assert.equal(tierProducts.filter((item) => item.gender === 'donna').length, 4);
  }
});

for (const [xp, expectedUnlocked] of boundaryCases) {
  test(`${xp} XP unlocks only the expected collections`, () => {
    const products = resolveMarketplaceProducts(xp);
    const unlockedTiers = [...new Set(products.filter((item) => item.isUnlocked).map((item) => item.tier))];
    assert.deepEqual(unlockedTiers, expectedUnlocked);
  });
}

test('keeps NORMAL locked until 999 XP and targets it from zero', () => {
  assert.equal(getXpTierProgress(0).focusTier.id, 'normal');
  assert.equal(getXpTierProgress(998).remainingXp, 1);
  assert.equal(getXpTierProgress(999).currentTier.id, 'normal');
  assert.equal(getXpTierProgress(999).nextTier.id, 'bronze');
});

test('special clothing remains locked without its achievement metric', () => {
  const achievements = resolveAchievementStates(15000, {});
  assert.equal(achievements.find((item) => item.id === 'marathon').isUnlocked, false);
  assert.equal(achievements.find((item) => item.id === 'limited-edition').isUnlocked, true);
});

test('special clothing unlocks only when its requirement is complete', () => {
  assert.equal(resolveAchievementStates(0, { nightWorkouts: 9 }).find((item) => item.id === 'night-warrior').isUnlocked, false);
  assert.equal(resolveAchievementStates(0, { nightWorkouts: 10 }).find((item) => item.id === 'night-warrior').isUnlocked, true);
});

test('every achievement garment stays locked until its own target is complete', () => {
  for (const achievement of XP_SPECIAL_ACHIEVEMENTS.filter((item) => item.id !== 'limited-edition')) {
    const almostComplete = { [achievement.metricKey]: achievement.requirement - 1 };
    const complete = { [achievement.metricKey]: achievement.requirement };
    assert.equal(
      resolveAchievementStates(0, almostComplete).find((item) => item.id === achievement.id).isUnlocked,
      false,
      `${achievement.id} must remain locked before the target`
    );
    assert.equal(
      resolveAchievementStates(0, complete).find((item) => item.id === achievement.id).isUnlocked,
      true,
      `${achievement.id} must unlock at the exact target`
    );
  }
});
