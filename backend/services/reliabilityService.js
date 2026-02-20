const eventMemberModel = require('../models/eventMemberModel');
const userModel = require('../models/userModel');

async function recalculateReliability(userId) {
  const stats = await eventMemberModel.getUserAttendanceStats(userId);
  const completed = Number(stats?.completed_count || 0);
  const noShow = Number(stats?.no_show_count || 0);
  const denominator = completed + noShow;

  const reliabilityScore = denominator === 0 ? 100 : Number(((completed / denominator) * 100).toFixed(2));

  await userModel.updateReliability(userId, {
    reliabilityScore,
    noShowCount: noShow
  });

  return { reliabilityScore, noShowCount: noShow };
}

module.exports = {
  recalculateReliability
};
