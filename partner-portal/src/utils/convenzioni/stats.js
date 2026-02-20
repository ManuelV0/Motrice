function monthKeyFromDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabelFromKey(key) {
  const [year, month] = String(key).split('-').map((value) => Number(value));
  if (!Number.isInteger(year) || !Number.isInteger(month)) return key;
  const date = new Date(year, Math.max(0, month - 1), 1);
  return date.toLocaleDateString('it-IT', { month: 'short' });
}

function buildLastMonthKeys(count = 6) {
  const now = new Date();
  const keys = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(monthKeyFromDate(date));
  }
  return keys;
}

export function computeAnnualCashbackStats(partnerProfile) {
  const history = Array.isArray(partnerProfile?.earnings_history) ? partnerProfile.earnings_history : [];
  const subscriptionStartMs = Date.parse(partnerProfile?.subscription_started_at || '');
  const periodStartMs = Number.isFinite(subscriptionStartMs)
    ? subscriptionStartMs
    : Date.now() - 365 * 24 * 60 * 60 * 1000;

  const yearlyEvents = history.filter((item) => {
    const ts = Date.parse(item?.created_at || '');
    return Number.isFinite(ts) && ts >= periodStartMs;
  });

  const voucherShareCents = yearlyEvents
    .filter((item) => item?.type === 'voucher_share')
    .reduce((sum, item) => sum + Number(item?.amount_cents || 0), 0);
  const voucherGrossCents = yearlyEvents
    .filter((item) => item?.type === 'voucher_share')
    .reduce((sum, item) => sum + Number(item?.gross_cents || 0), 0);
  const courseCashbackCents = yearlyEvents
    .filter((item) => item?.type === 'course_cashback')
    .reduce((sum, item) => sum + Number(item?.amount_cents || 0), 0);

  return {
    voucherShareCents,
    voucherGrossCents,
    courseCashbackCents,
    totalCashbackCents: voucherShareCents + courseCashbackCents,
    voucherActivationsY: Math.floor(voucherGrossCents / 200)
  };
}

export function computeLiveStats({ vouchers = [], partnerProfile = null }) {
  const monthKeys = buildLastMonthKeys(6);
  const earningsByMonth = Object.fromEntries(monthKeys.map((key) => [key, 0]));
  const activationsByMonth = Object.fromEntries(monthKeys.map((key) => [key, 0]));
  const usersByMonth = Object.fromEntries(monthKeys.map((key) => [key, new Set()]));

  const earningsHistory = Array.isArray(partnerProfile?.earnings_history) ? partnerProfile.earnings_history : [];
  earningsHistory.forEach((item) => {
    const ts = Date.parse(item?.created_at || '');
    if (!Number.isFinite(ts)) return;
    const key = monthKeyFromDate(new Date(ts));
    if (!Object.prototype.hasOwnProperty.call(earningsByMonth, key)) return;
    earningsByMonth[key] += Number(item?.amount_cents || 0);
  });

  vouchers.forEach((voucher) => {
    const ts = Date.parse(voucher?.created_at || '');
    if (!Number.isFinite(ts)) return;
    const key = monthKeyFromDate(new Date(ts));
    if (!Object.prototype.hasOwnProperty.call(activationsByMonth, key)) return;
    activationsByMonth[key] += 1;
    const userId = Number(voucher?.user_id);
    if (Number.isInteger(userId) && userId > 0) usersByMonth[key].add(userId);
  });

  const months = monthKeys.map((key) => ({
    key,
    label: monthLabelFromKey(key),
    earnings_cents: earningsByMonth[key],
    activations: activationsByMonth[key],
    interested_users: usersByMonth[key].size
  }));

  const allInterested = new Set(
    vouchers
      .map((voucher) => Number(voucher?.user_id))
      .filter((value) => Number.isInteger(value) && value > 0)
  );

  return {
    months,
    interested_total: allInterested.size,
    active_vouchers: vouchers.filter((voucher) => String(voucher?.status || '') === 'active').length,
    redeemed_vouchers: vouchers.filter((voucher) => String(voucher?.status || '') === 'redeemed').length
  };
}
