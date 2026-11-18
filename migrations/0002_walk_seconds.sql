-- Seconds the 3D standup's camera takes to walk from one sign tree to the next.
ALTER TABLE standups ADD COLUMN walk_seconds REAL NOT NULL DEFAULT 3.6
  CHECK (walk_seconds >= 0.5 AND walk_seconds <= 60);
