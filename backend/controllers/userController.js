const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const userModel = require('../models/userModel');
const sportModel = require('../models/sportModel');
const {
  GOALS,
  assertEnum,
  assertAvailability,
  assertRequired,
  assertUserSports
} = require('../utils/validators');

function mapProfile(user, sportsRows) {
  let availability = [];
  try {
    availability = JSON.parse(user.availability_json || '[]');
  } catch (error) {
    availability = [];
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    goal: user.goal,
    availability,
    reliability_score: user.reliability_score,
    no_show_count: user.no_show_count,
    sports_practiced: sportsRows.map((row) => ({
      sport_id: row.sport_id,
      sport_name: row.sport_name,
      sport_slug: row.sport_slug,
      level: row.level
    })),
    created_at: user.created_at,
    updated_at: user.updated_at
  };
}

const getMe = asyncHandler(async (req, res) => {
  const user = await userModel.getUserById(req.user.id);
  if (!user) {
    throw new HttpError(404, 'User not found');
  }

  const sports = await userModel.listUserSports(req.user.id);
  res.json(mapProfile(user, sports));
});

const updateMe = asyncHandler(async (req, res) => {
  assertRequired(['name', 'goal', 'availability', 'sports_practiced'], req.body);

  const { name, goal, availability, sports_practiced: sportsPracticed } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    throw new HttpError(400, 'name must be at least 2 characters');
  }

  assertEnum(goal, GOALS, 'goal');
  assertAvailability(availability);
  assertUserSports(sportsPracticed);

  const sportIds = sportsPracticed.map((item) => item.sport_id);
  const uniqueSportIds = [...new Set(sportIds)];
  if (uniqueSportIds.length !== sportIds.length) {
    throw new HttpError(400, 'sports_practiced cannot contain duplicate sport_id values');
  }

  for (const sportId of uniqueSportIds) {
    const sport = await sportModel.getSportById(sportId);
    if (!sport) {
      throw new HttpError(400, `sport_id ${sportId} does not exist`);
    }
  }

  await userModel.updateUserProfile(req.user.id, {
    name: name.trim(),
    goal,
    availability,
    sportsPracticed
  });

  const updatedUser = await userModel.getUserById(req.user.id);
  const updatedSports = await userModel.listUserSports(req.user.id);

  res.json(mapProfile(updatedUser, updatedSports));
});

const listSports = asyncHandler(async (req, res) => {
  const sports = await sportModel.listSports();
  res.json(sports);
});

module.exports = {
  getMe,
  updateMe,
  listSports
};
