export const XP_TIER_THRESHOLDS = Object.freeze({
  normal: 999,
  bronze: 2999,
  silver: 5999,
  gold: 9999,
  platinum: 14999,
  diamond: 15000
});

export const XP_TIERS = Object.freeze([
  { id: 'normal', label: 'NORMAL', requiredXp: XP_TIER_THRESHOLDS.normal, color: '#c6ff00', tone: 'Verde Motrice' },
  { id: 'bronze', label: 'BRONZE', requiredXp: XP_TIER_THRESHOLDS.bronze, color: '#d9822b', tone: 'Bronzo' },
  { id: 'silver', label: 'SILVER', requiredXp: XP_TIER_THRESHOLDS.silver, color: '#d5d8dc', tone: 'Argento' },
  { id: 'gold', label: 'GOLD', requiredXp: XP_TIER_THRESHOLDS.gold, color: '#ffd400', tone: 'Oro' },
  { id: 'platinum', label: 'PLATINUM', requiredXp: XP_TIER_THRESHOLDS.platinum, color: '#35d7e8', tone: 'Platino' },
  { id: 'diamond', label: 'DIAMOND', requiredXp: XP_TIER_THRESHOLDS.diamond, color: '#b66cff', tone: 'Diamante' }
]);

const PRODUCT_TEMPLATES = Object.freeze([
  { key: 'uomo-top', gender: 'uomo', category: 'TOP', name: 'T-shirt tecnica', visual: 'tshirt' },
  { key: 'uomo-outerwear', gender: 'uomo', category: 'FELPE / OUTERWEAR', name: 'Felpa performance', visual: 'hoodie' },
  { key: 'uomo-bottom', gender: 'uomo', category: 'BOTTOM', name: 'Short training', visual: 'shorts' },
  { key: 'uomo-accessori', gender: 'uomo', category: 'ACCESSORI', name: 'Cappellino sportivo', visual: 'cap' },
  { key: 'donna-top', gender: 'donna', category: 'TOP', name: 'Top tecnico', visual: 'top' },
  { key: 'donna-bottom', gender: 'donna', category: 'LEGGINGS / BOTTOM', name: 'Leggings performance', visual: 'leggings' },
  { key: 'donna-outerwear', gender: 'donna', category: 'FELPE / OUTERWEAR', name: 'Felpa performance', visual: 'hoodie' },
  { key: 'donna-accessori', gender: 'donna', category: 'ACCESSORI', name: 'Borsone training', visual: 'bag' }
]);

export const XP_MARKETPLACE_PRODUCTS = Object.freeze(
  XP_TIERS.flatMap((tier) => PRODUCT_TEMPLATES.map((template) => Object.freeze({
    id: `${tier.id}-${template.key}`,
    name: `${template.name} ${tier.label}`,
    category: template.category,
    gender: template.gender,
    tier: tier.id,
    requiredXp: tier.requiredXp,
    image: null,
    imageCrop: null,
    visual: template.visual
  })))
);

export const XP_SPECIAL_ACHIEVEMENTS = Object.freeze([
  {
    id: 'marathon',
    name: 'MARATHON',
    description: 'Completa 42,195 km',
    metricKey: 'distanceKm',
    requirement: 42.195,
    unit: 'km',
    rewardXp: 5000,
    visual: 'marathon'
  },
  {
    id: 'spartan',
    name: 'SPARTAN',
    description: '30 allenamenti consecutivi',
    metricKey: 'workoutStreak',
    requirement: 30,
    unit: 'allenamenti',
    rewardXp: 3000,
    visual: 'spartan'
  },
  {
    id: 'iron',
    name: 'IRON',
    description: 'Solleva 1.000.000 kg',
    metricKey: 'liftedKg',
    requirement: 1000000,
    unit: 'kg',
    rewardXp: 3500,
    visual: 'iron'
  },
  {
    id: 'everest',
    name: 'EVEREST',
    description: 'Accumula 8.848 m di dislivello',
    metricKey: 'elevationM',
    requirement: 8848,
    unit: 'm',
    rewardXp: 3000,
    visual: 'everest'
  },
  {
    id: 'night-warrior',
    name: 'NIGHT WARRIOR',
    description: '10 allenamenti dopo le 22:00',
    metricKey: 'nightWorkouts',
    requirement: 10,
    unit: 'allenamenti',
    rewardXp: 2000,
    visual: 'night'
  },
  {
    id: 'community-hero',
    name: 'COMMUNITY HERO',
    description: 'Partecipa a 50 eventi',
    metricKey: 'communityEvents',
    requirement: 50,
    unit: 'eventi',
    rewardXp: 4000,
    visual: 'community'
  },
  {
    id: 'limited-edition',
    name: 'LIMITED EDITION',
    description: 'Riservata agli utenti DIAMOND',
    metricKey: 'diamondTier',
    requirement: XP_TIER_THRESHOLDS.diamond,
    unit: 'XP',
    rewardXp: 0,
    visual: 'limited'
  }
]);

export const XP_EARNING_RULES = Object.freeze([
  { id: 'personal', title: 'Evento personale', xp: 15, detail: 'Dopo il completamento verificato' },
  { id: 'organizer', title: 'Organizzatore evento di gruppo', xp: 60, prefix: 'fino a', detail: 'Dopo la conclusione valida dell’evento' },
  { id: 'participant-gps', title: 'Partecipante con GPS', xp: 50, prefix: 'fino a', detail: 'Presenza e attività verificate' },
  { id: 'participant-qr', title: 'Partecipante con QR verificato', xp: 75, prefix: 'fino a', detail: 'Check-in QR e completamento verificati' }
]);

function safeXp(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

export function getTierById(tierId) {
  return XP_TIERS.find((tier) => tier.id === tierId) || XP_TIERS[0];
}

export function getXpTierProgress(userXp) {
  const xp = safeXp(userXp);
  const unlockedTiers = XP_TIERS.filter((tier) => xp >= tier.requiredXp);
  const currentTier = unlockedTiers.at(-1) || null;
  const nextTier = XP_TIERS.find((tier) => xp < tier.requiredXp) || null;
  const focusTier = nextTier || currentTier || XP_TIERS[0];
  const targetXp = focusTier?.requiredXp || XP_TIER_THRESHOLDS.diamond;
  const remainingXp = nextTier ? Math.max(0, targetXp - xp) : 0;
  const progressPct = nextTier ? Math.min(100, Math.round((xp / targetXp) * 100)) : 100;

  return {
    xp,
    currentTier,
    nextTier,
    focusTier,
    targetXp,
    remainingXp,
    progressPct
  };
}

export function resolveMarketplaceProducts(userXp) {
  const xp = safeXp(userXp);
  return XP_MARKETPLACE_PRODUCTS.map((product) => ({
    ...product,
    isUnlocked: xp >= product.requiredXp,
    remainingXp: Math.max(0, product.requiredXp - xp),
    progressPct: Math.min(100, Math.round((xp / product.requiredXp) * 100))
  }));
}

export function resolveAchievementStates(userXp, metrics = {}) {
  const xp = safeXp(userXp);
  return XP_SPECIAL_ACHIEVEMENTS.map((achievement) => {
    const rawProgress = achievement.metricKey === 'diamondTier'
      ? xp
      : metrics[achievement.metricKey];
    const hasProgress = Number.isFinite(Number(rawProgress));
    const progress = hasProgress ? Math.max(0, Number(rawProgress)) : null;
    const isUnlocked = hasProgress && progress >= achievement.requirement;
    return {
      ...achievement,
      progress,
      hasProgress,
      isUnlocked,
      progressPct: hasProgress
        ? Math.min(100, Math.round((progress / achievement.requirement) * 100))
        : 0
    };
  });
}
