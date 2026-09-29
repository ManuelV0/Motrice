import assert from 'node:assert/strict';
import test from 'node:test';
import {
  XP_MARKETPLACE_PRODUCTS,
  XP_SPECIAL_ACHIEVEMENTS,
  XP_TIERS,
  resolveAchievementStates,
  resolveMarketplaceProducts
} from '../features/xp/xpMarketplaceConfig.js';

const tierBoundaryCases = [
  { xp: 0, unlockedTierIds: [] },
  { xp: 998, unlockedTierIds: [] },
  { xp: 999, unlockedTierIds: ['normal'] },
  { xp: 2998, unlockedTierIds: ['normal'] },
  { xp: 2999, unlockedTierIds: ['normal', 'bronze'] },
  { xp: 5998, unlockedTierIds: ['normal', 'bronze'] },
  { xp: 5999, unlockedTierIds: ['normal', 'bronze', 'silver'] },
  { xp: 9998, unlockedTierIds: ['normal', 'bronze', 'silver'] },
  { xp: 9999, unlockedTierIds: ['normal', 'bronze', 'silver', 'gold'] },
  { xp: 14998, unlockedTierIds: ['normal', 'bronze', 'silver', 'gold'] },
  { xp: 14999, unlockedTierIds: ['normal', 'bronze', 'silver', 'gold', 'platinum'] },
  { xp: 15000, unlockedTierIds: ['normal', 'bronze', 'silver', 'gold', 'platinum', 'diamond'] }
];

function groupProductsByTier(products) {
  return Object.fromEntries(XP_TIERS.map((tier) => [
    tier.id,
    products.filter((product) => product.tier === tier.id)
  ]));
}

function countProductsByGender(products) {
  return products.reduce((counts, product) => ({
    ...counts,
    [product.gender]: (counts[product.gender] || 0) + 1
  }), {});
}

test('compact collections keep every product available across all XP boundaries', () => {
  const catalogueIds = XP_MARKETPLACE_PRODUCTS.map((product) => product.id);
  const productCountByTier = Object.fromEntries(XP_TIERS.map((tier) => [
    tier.id,
    XP_MARKETPLACE_PRODUCTS.filter((product) => product.tier === tier.id).length
  ]));

  for (const { xp, unlockedTierIds } of tierBoundaryCases) {
    const products = resolveMarketplaceProducts(xp);
    const resolvedIds = products.map((product) => product.id);
    const actualUnlockedTierIds = XP_TIERS
      .filter((tier) => products.some((product) => product.tier === tier.id && product.isUnlocked))
      .map((tier) => tier.id);
    const expectedUnlockedProductCount = unlockedTierIds.reduce(
      (total, tierId) => total + productCountByTier[tierId],
      0
    );

    assert.deepEqual(resolvedIds, catalogueIds, `${xp} XP must not hide or reorder compact-preview products`);
    assert.deepEqual(actualUnlockedTierIds, unlockedTierIds, `${xp} XP unlocked the wrong collections`);
    assert.equal(
      products.filter((product) => product.isUnlocked).length,
      expectedUnlockedProductCount,
      `${xp} XP exposed the wrong number of unlocked product cards`
    );
  }
});

test('compact collection counts are derived consistently from resolved product data', () => {
  const catalogueByTier = groupProductsByTier(XP_MARKETPLACE_PRODUCTS);

  for (const xp of [0, 999, 2999, 15000]) {
    const resolvedByTier = groupProductsByTier(resolveMarketplaceProducts(xp));

    for (const tier of XP_TIERS) {
      assert.equal(resolvedByTier[tier.id].length, catalogueByTier[tier.id].length);
      assert.deepEqual(
        countProductsByGender(resolvedByTier[tier.id]),
        countProductsByGender(catalogueByTier[tier.id]),
        `${tier.id} gender counts changed after resolving ${xp} XP`
      );
      assert.deepEqual(
        Object.keys(countProductsByGender(resolvedByTier[tier.id])).sort(),
        ['donna', 'uomo'],
        `${tier.id} must remain filterable by both compact gender controls`
      );
    }
  }
});

test('compact collection and product keys remain unique', () => {
  assert.equal(new Set(XP_TIERS.map((tier) => tier.id)).size, XP_TIERS.length);
  assert.equal(new Set(XP_MARKETPLACE_PRODUCTS.map((product) => product.id)).size, XP_MARKETPLACE_PRODUCTS.length);
  assert.equal(new Set(XP_SPECIAL_ACHIEVEMENTS.map((achievement) => achievement.id)).size, XP_SPECIAL_ACHIEVEMENTS.length);

  for (const [tierId, products] of Object.entries(groupProductsByTier(XP_MARKETPLACE_PRODUCTS))) {
    assert.equal(products.every((product) => product.id.startsWith(`${tierId}-`)), true);
  }
});

test('all special cards stay visible and metric-backed rewards stay locked without data', () => {
  const achievements = resolveAchievementStates(15000, {});
  const metricBackedAchievements = achievements.filter((achievement) => achievement.metricKey !== 'diamondTier');
  const limitedEdition = achievements.find((achievement) => achievement.id === 'limited-edition');

  assert.deepEqual(
    achievements.map((achievement) => achievement.id),
    XP_SPECIAL_ACHIEVEMENTS.map((achievement) => achievement.id)
  );
  assert.equal(metricBackedAchievements.every((achievement) => achievement.hasProgress === false), true);
  assert.equal(metricBackedAchievements.every((achievement) => achievement.isUnlocked === false), true);
  assert.equal(limitedEdition.hasProgress, true);
  assert.equal(limitedEdition.isUnlocked, true);
});

test('supplying one achievement metric cannot unlock unrelated special cards', () => {
  const achievements = resolveAchievementStates(0, { communityEvents: 50 });
  const communityHero = achievements.find((achievement) => achievement.id === 'community-hero');
  const unrelated = achievements.filter((achievement) => achievement.id !== 'community-hero');

  assert.equal(communityHero.isUnlocked, true);
  assert.equal(unrelated.every((achievement) => achievement.isUnlocked === false), true);
});

test('LIMITED EDITION follows XP only and ignores a spoofed achievement metric', () => {
  const locked = resolveAchievementStates(14999, { diamondTier: 999999 })
    .find((achievement) => achievement.id === 'limited-edition');
  const unlocked = resolveAchievementStates(15000, { diamondTier: 0 })
    .find((achievement) => achievement.id === 'limited-edition');

  assert.equal(locked.isUnlocked, false);
  assert.equal(locked.progress, 14999);
  assert.equal(unlocked.isUnlocked, true);
  assert.equal(unlocked.progress, 15000);
});
