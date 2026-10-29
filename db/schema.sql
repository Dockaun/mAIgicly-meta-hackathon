-- mAIgicly hackathon schema — schema only, no production data
-- Neon-compatible PostgreSQL
-- Initialize a fresh database with:
--   psql "$DATABASE_URL" -f db/schema.sql
-- or via the Node helper: node db/init.js
--
-- REQUIRED for Chambers → Forge → Multiplay:
--   forged_qbits, operator_ids
-- USEFUL for session/AI logging (non-blocking for core play):
--   forge_sessions, machine_chat_logs, events, request_log
-- EXPERIMENTAL / out of hackathon scope (LoRA, Phase 3):
--   learner_profiles, training_pairs
-- These experimental tables are included so the existing server.js startup
-- and optional routes do not fail, but they are not required for the
-- playable Chambers → Forge → Multiplay experience.

-- ── Required gameplay tables ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS forged_qbits (
  id            SERIAL PRIMARY KEY,
  architect_id  TEXT NOT NULL,
  name          TEXT NOT NULL,
  alias         TEXT,
  role          TEXT NOT NULL,
  mission_id    TEXT NOT NULL,
  look          JSONB NOT NULL DEFAULT '{}',
  parts         JSONB NOT NULL DEFAULT '[]',
  fixes         JSONB NOT NULL DEFAULT '[]',
  boost         TEXT NOT NULL DEFAULT '',
  emblem        JSONB NOT NULL DEFAULT '{}',
  story         TEXT NOT NULL DEFAULT '',
  mechanism     TEXT DEFAULT '',
  recipe        JSONB,
  image         TEXT,
  timestamp     BIGINT NOT NULL,
  visibility    TEXT DEFAULT 'public',
  view_count    INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  origin        TEXT NOT NULL DEFAULT 'forged',
  origin_challenge_title TEXT
);

CREATE INDEX IF NOT EXISTS idx_forged_qbits_architect ON forged_qbits (architect_id);
CREATE INDEX IF NOT EXISTS idx_forged_qbits_visibility ON forged_qbits (visibility, created_at DESC);
-- One forged row per (architect_id, mission_id). Continuum responses
-- (origin = 'continuum', always new rows) are exempt. Older databases are
-- converted by server/continuum-migrate.js at startup.
CREATE UNIQUE INDEX IF NOT EXISTS forged_qbits_architect_mission_forged_uidx ON forged_qbits (architect_id, mission_id) WHERE origin = 'forged';

-- Continuum adaptive difficulty: one row per judged attempt, written only by
-- POST /api/continuum/attempts/interpret from the rules-decided result.
CREATE TABLE IF NOT EXISTS continuum_results (
  architect_id TEXT NOT NULL,
  challenge_id TEXT NOT NULL,
  passed BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_continuum_results_architect ON continuum_results (architect_id, created_at DESC);

CREATE TABLE IF NOT EXISTS operator_ids (
  operator_id   TEXT PRIMARY KEY,
  architect_id  TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  legacy_id     TEXT
);

-- Unlock/points progress (hackathon step 11): chamber completions and
-- Forge-gate points per architect, so an Operator Code restore brings
-- unlocks back. Only the allowlisted flags in server/player-progress.js.
CREATE TABLE IF NOT EXISTS player_progress (
  architect_id  TEXT NOT NULL,
  flag          TEXT NOT NULL,
  value         TEXT NOT NULL DEFAULT '',
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (architect_id, flag)
);

-- ── Session / AI logging (useful, not blocking) ───────────────────────────

CREATE TABLE IF NOT EXISTS forge_sessions (
  session_id          TEXT PRIMARY KEY,
  learner_id          TEXT,
  mission_id          TEXT,
  started_at          TIMESTAMPTZ,
  ended_at            TIMESTAMPTZ,
  component_sequence  JSONB,
  dwell_times         JSONB,
  validation_attempts JSONB,
  probe_history       JSONB,
  final_build         JSONB,
  session_outcome     TEXT,
  revision_count      INTEGER DEFAULT 0,
  total_resistance_ms INTEGER DEFAULT 0,
  friction_score      NUMERIC DEFAULT 0
);

CREATE TABLE IF NOT EXISTS machine_chat_logs (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id           VARCHAR(64) NOT NULL,
  architect_id         VARCHAR(128),
  mission_id           VARCHAR(64) NOT NULL,
  mission_name         VARCHAR(128),
  event                VARCHAR(32) NOT NULL,
  player_question      TEXT,
  machine_reply        TEXT,
  outcome              VARCHAR(64),
  conversation_history JSONB,
  selected_parts       JSONB,
  selected_fixes       JSONB,
  selected_boost       VARCHAR(16),
  coherence_score      INTEGER,
  validation_attempts  INTEGER,
  qbit_name            VARCHAR(64),
  final_build          JSONB,
  matched_solution     VARCHAR(64),
  total_messages       INTEGER,
  client_timestamp     TIMESTAMPTZ,
  server_timestamp     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mcl_session ON machine_chat_logs (session_id);
CREATE INDEX IF NOT EXISTS idx_mcl_architect ON machine_chat_logs (architect_id);

CREATE TABLE IF NOT EXISTS events (
  id            SERIAL PRIMARY KEY,
  architect_id  TEXT,
  event_name    TEXT,
  properties    JSONB,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS request_log (
  id          SERIAL PRIMARY KEY,
  method      TEXT,
  path        TEXT,
  status_code INTEGER,
  duration_ms INTEGER,
  user_agent  TEXT,
  referrer    TEXT,
  ip_hash     TEXT,
  is_bot      BOOLEAN,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Experimental / My Forge / training (out of hackathon core path) ──────

CREATE TABLE IF NOT EXISTS learner_profiles (
  architect_id          TEXT PRIMARY KEY,
  session_count         INTEGER DEFAULT 0,
  dominant_corridor     TEXT,
  analogy_family        TEXT,
  friction_profile      JSONB,
  breakthrough_count    INTEGER DEFAULT 0,
  voicepicker_profile   JSONB,
  voicepicker_sessions  INTEGER DEFAULT 0,
  profile_confidence    NUMERIC,
  last_updated          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS training_pairs (
  id              SERIAL PRIMARY KEY,
  architect_id    TEXT,
  session_id      TEXT,
  user_input      TEXT,
  probe_response  TEXT,
  domain          TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
