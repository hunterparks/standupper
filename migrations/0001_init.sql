-- Standupper schema (migrated from Val Town SQLite).
--
-- Changes from the Val Town schema:
--   standups.theme        -> standups.color  (accent color)
--   standups.season_theme -> standups.theme  (site theme choice)
--   users.standup_id gets ON DELETE CASCADE and an index
--   enum-like columns get CHECK constraints; booleans are NOT NULL 0/1
-- IDs are unchanged so existing session links keep working.

CREATE TABLE standups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  last_login TEXT NOT NULL,
  timer_duration_minutes INTEGER NOT NULL DEFAULT 1 CHECK (timer_duration_minutes >= 0),
  color TEXT NOT NULL DEFAULT 'green'
    CHECK (color IN ('green', 'red', 'blue', 'yellow', 'purple')),
  theme TEXT NOT NULL DEFAULT 'automatic'
    CHECK (theme IN (
      'automatic', 'standard', 'new-year', 'valentines', 'st-patricks', 'spring',
      'cinco-de-mayo', 'usa', 'summer', 'halloween', 'day-of-the-dead', 'autumn',
      'thanksgiving', 'winter'
    ))
);

CREATE INDEX standups_last_login ON standups (last_login);

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  standup_id TEXT NOT NULL REFERENCES standups (id) ON DELETE CASCADE,
  inactive INTEGER NOT NULL DEFAULT 0 CHECK (inactive IN (0, 1)),
  starred INTEGER NOT NULL DEFAULT 0 CHECK (starred IN (0, 1))
);

CREATE INDEX users_standup_id ON users (standup_id);
