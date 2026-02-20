const { all, get, run, transaction } = require('../config/db');

function createUser({ name, email, passwordHash }) {
  return run(
    `INSERT INTO users (name, email, password_hash)
     VALUES (?, ?, ?)`,
    [name, email, passwordHash]
  );
}

function getUserByEmail(email) {
  return get('SELECT * FROM users WHERE email = ?', [email]);
}

function getUserById(id) {
  return get(
    `SELECT id, name, email, goal, availability_json, reliability_score, no_show_count, created_at, updated_at
     FROM users
     WHERE id = ?`,
    [id]
  );
}

function listUserSports(userId) {
  return all(
    `SELECT us.sport_id, s.name AS sport_name, s.slug AS sport_slug, us.level
     FROM user_sports us
     INNER JOIN sports s ON s.id = us.sport_id
     WHERE us.user_id = ?
     ORDER BY s.name ASC`,
    [userId]
  );
}

async function updateUserProfile(userId, { name, goal, availability, sportsPracticed }) {
  await transaction(async () => {
    await run(
      `UPDATE users
       SET name = ?, goal = ?, availability_json = ?
       WHERE id = ?`,
      [name, goal, JSON.stringify(availability), userId]
    );

    await run('DELETE FROM user_sports WHERE user_id = ?', [userId]);

    for (const item of sportsPracticed) {
      await run(
        `INSERT INTO user_sports (user_id, sport_id, level)
         VALUES (?, ?, ?)`,
        [userId, item.sport_id, item.level]
      );
    }
  });

  return getUserById(userId);
}

function updateReliability(userId, { reliabilityScore, noShowCount }) {
  return run(
    `UPDATE users
     SET reliability_score = ?, no_show_count = ?
     WHERE id = ?`,
    [reliabilityScore, noShowCount, userId]
  );
}

async function ensureDevUserById(userId) {
  const existing = await get(
    `SELECT id, name, email, goal, availability_json, reliability_score, no_show_count, created_at, updated_at
     FROM users
     WHERE id = ?`,
    [userId]
  );

  if (existing) return existing;

  const safeId = Number(userId);
  await run(
    `INSERT INTO users (id, name, email, password_hash, goal, availability_json)
     VALUES (?, ?, ?, ?, 'fitness', '[]')`,
    [
      safeId,
      `Dev User ${safeId}`,
      `dev-user-${safeId}@local.motrice`,
      '$2a$10$eExvFLX5aTxupXs1rXXcxeAc94vaZtpUgrveQz2vBSuJD9tcA7ZAq'
    ]
  );

  return get(
    `SELECT id, name, email, goal, availability_json, reliability_score, no_show_count, created_at, updated_at
     FROM users
     WHERE id = ?`,
    [safeId]
  );
}

module.exports = {
  createUser,
  getUserByEmail,
  getUserById,
  listUserSports,
  updateUserProfile,
  updateReliability,
  ensureDevUserById
};
