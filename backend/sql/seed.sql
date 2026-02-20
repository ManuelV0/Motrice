-- Local development seeded credentials (plain-text):
-- - alice@motrice.dev / Password123!
-- - marco@motrice.dev / Password123!

INSERT OR IGNORE INTO sports (id, slug, name) VALUES
  (1, 'running', 'Running'),
  (2, 'cycling', 'Cycling'),
  (3, 'football', 'Football'),
  (4, 'basketball', 'Basketball'),
  (5, 'tennis', 'Tennis'),
  (6, 'swimming', 'Swimming'),
  (7, 'crossfit', 'CrossFit'),
  (8, 'yoga', 'Yoga');

INSERT OR IGNORE INTO users (id, name, email, password_hash, goal, availability_json)
VALUES
  (1, 'Alice Runner', 'alice@motrice.dev', '$2a$10$eExvFLX5aTxupXs1rXXcxeAc94vaZtpUgrveQz2vBSuJD9tcA7ZAq', 'fitness', '[{"day":"Monday","start":"18:00","end":"20:00"}]'),
  (2, 'Marco Cyclist', 'marco@motrice.dev', '$2a$10$eExvFLX5aTxupXs1rXXcxeAc94vaZtpUgrveQz2vBSuJD9tcA7ZAq', 'performance', '[{"day":"Tuesday","start":"06:30","end":"08:00"}]');

INSERT OR IGNORE INTO user_sports (user_id, sport_id, level) VALUES
  (1, 1, 'intermediate'),
  (1, 8, 'beginner'),
  (2, 2, 'advanced');

INSERT OR IGNORE INTO events (
  id, creator_id, sport_id, location_name, lat, lng, event_datetime, max_participants, required_level, description, status
) VALUES
  (1, 1, 1, 'Central Park Track', 40.785091, -73.968285, datetime('now', '+2 day'), 8, 'beginner', 'Easy paced social run.', 'scheduled'),
  (2, 2, 2, 'Hudson Greenway', 40.7727, -73.9936, datetime('now', '+3 day'), 6, 'intermediate', 'Tempo cycling session.', 'scheduled');

INSERT OR IGNORE INTO event_members (event_id, user_id, status) VALUES
  (1, 1, 'going'),
  (2, 2, 'going');

INSERT OR IGNORE INTO coach_profiles (
  id, user_id, primary_sport_id, bio, contact_email, hourly_rate, certification_file_name, certification_file_path, certification_mime_type, status
) VALUES
  (
    1,
    2,
    2,
    'Coach endurance con focus su ciclismo e preparazione performance.',
    'coach.marco@motrice.dev',
    55,
    'sample-certification.pdf',
    'uploads/certifications/sample-certification.pdf',
    'application/pdf',
    'approved'
  );
