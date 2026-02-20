PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  goal TEXT NOT NULL DEFAULT 'fitness' CHECK (goal IN ('fitness', 'performance', 'social', 'weight_loss')),
  availability_json TEXT NOT NULL DEFAULT '[]',
  reliability_score REAL NOT NULL DEFAULT 100,
  no_show_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS user_sports (
  user_id INTEGER NOT NULL,
  sport_id INTEGER NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('beginner', 'intermediate', 'advanced')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, sport_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (sport_id) REFERENCES sports(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  creator_id INTEGER NOT NULL,
  sport_id INTEGER NOT NULL,
  location_name TEXT NOT NULL,
  lat REAL,
  lng REAL,
  event_datetime TEXT NOT NULL,
  max_participants INTEGER NOT NULL CHECK (max_participants > 0),
  required_level TEXT NOT NULL CHECK (required_level IN ('beginner', 'intermediate', 'advanced')),
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled', 'completed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (creator_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (sport_id) REFERENCES sports(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS event_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('going', 'waitlist', 'cancelled', 'no_show', 'completed')),
  attendance_confirmed_by INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (event_id, user_id),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (attendance_confirmed_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS coach_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  primary_sport_id INTEGER,
  bio TEXT NOT NULL DEFAULT '',
  contact_email TEXT NOT NULL,
  hourly_rate REAL NOT NULL CHECK (hourly_rate > 0),
  certification_file_name TEXT NOT NULL,
  certification_file_path TEXT NOT NULL,
  certification_mime_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  review_notes TEXT,
  reviewed_at TEXT,
  reviewed_by INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (primary_sport_id) REFERENCES sports(id) ON DELETE SET NULL,
  FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS plan_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  coach_id INTEGER NOT NULL,
  client_user_id INTEGER NOT NULL,
  goal TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (coach_id) REFERENCES coach_profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (client_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL UNIQUE,
  coach_id INTEGER NOT NULL,
  client_user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  coach_note TEXT NOT NULL DEFAULT '',
  delivered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id) REFERENCES plan_requests(id) ON DELETE CASCADE,
  FOREIGN KEY (coach_id) REFERENCES coach_profiles(id) ON DELETE CASCADE,
  FOREIGN KEY (client_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS plan_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL CHECK (file_size > 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_events_datetime ON events(event_datetime);
CREATE INDEX IF NOT EXISTS idx_events_sport ON events(sport_id);
CREATE INDEX IF NOT EXISTS idx_event_members_event_status ON event_members(event_id, status);
CREATE INDEX IF NOT EXISTS idx_event_members_user_status ON event_members(user_id, status);
CREATE INDEX IF NOT EXISTS idx_coach_profiles_status ON coach_profiles(status);
CREATE INDEX IF NOT EXISTS idx_plan_requests_coach_status ON plan_requests(coach_id, status);
CREATE INDEX IF NOT EXISTS idx_plan_requests_client ON plan_requests(client_user_id);
CREATE INDEX IF NOT EXISTS idx_plans_client ON plans(client_user_id);
CREATE INDEX IF NOT EXISTS idx_plans_coach ON plans(coach_id);
CREATE INDEX IF NOT EXISTS idx_plan_attachments_plan ON plan_attachments(plan_id);

CREATE TRIGGER IF NOT EXISTS trg_users_updated_at
AFTER UPDATE ON users
FOR EACH ROW
BEGIN
  UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_events_updated_at
AFTER UPDATE ON events
FOR EACH ROW
BEGIN
  UPDATE events SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_user_sports_updated_at
AFTER UPDATE ON user_sports
FOR EACH ROW
BEGIN
  UPDATE user_sports
  SET updated_at = CURRENT_TIMESTAMP
  WHERE user_id = OLD.user_id AND sport_id = OLD.sport_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_event_members_updated_at
AFTER UPDATE ON event_members
FOR EACH ROW
BEGIN
  UPDATE event_members SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_coach_profiles_updated_at
AFTER UPDATE ON coach_profiles
FOR EACH ROW
BEGIN
  UPDATE coach_profiles SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_plan_requests_updated_at
AFTER UPDATE ON plan_requests
FOR EACH ROW
BEGIN
  UPDATE plan_requests SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_plans_updated_at
AFTER UPDATE ON plans
FOR EACH ROW
BEGIN
  UPDATE plans SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;
