# Database schema (hackathon)

Schema-only setup for a fresh Neon PostgreSQL database. No production player records are included.

## Required for Chambers → Forge → Multiplay
- `forged_qbits` — Qbit save, read, reload, Multiplay retrieval
- `operator_ids` — returning-player lookup

## Useful (non-blocking for core play)
- `forge_sessions` — forge session / probe / friction logging
- `machine_chat_logs` — Ask the Machine / companion chat logs
- `events`, `request_log` — analytics

## Experimental (LoRA, Phase 3 — outside hackathon core path)
- `learner_profiles`, `training_pairs`

These experimental tables are created so existing server routes do not fail, but they are not required for the playable Chambers → Forge → Multiplay experience.

## Initialize
```bash
DATABASE_URL=postgres://... node db/init.js
# or
psql "$DATABASE_URL" -f db/schema.sql
```

## Test
```bash
DATABASE_URL=postgres://... node tests/qbit-persistence.test.js
```
If `DATABASE_URL` is unset, the test reports **UNRUN** and exits 0. It does not claim success.
