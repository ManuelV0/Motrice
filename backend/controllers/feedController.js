const asyncHandler = require('../utils/asyncHandler');
const eventModel = require('../models/eventModel');

const getFeed = asyncHandler(async (req, res) => {
  const events = await eventModel.listEvents({
    sportId: null,
    requiredLevel: null,
    dateFrom: null,
    dateTo: null
  });

  res.json(
    events.map((event) => ({
      ...event,
      going_count: Number(event.going_count || 0),
      waitlist_count: Number(event.waitlist_count || 0)
    }))
  );
});

module.exports = {
  getFeed
};
