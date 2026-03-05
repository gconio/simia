-- IntelSim D1 schema (Phase A: Teams + Participants)
CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  icon TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS participants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  role TEXT NOT NULL,
  team_id TEXT,
  created_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_participants_created_at ON participants(created_at);
