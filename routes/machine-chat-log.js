const express = require('express');
const router = express.Router();
const { sql } = require('../db');

router.post('/api/machine-chat-log', async (req, res) => {
  res.json({ ok: true });

  try {
    if (!sql) return;

    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (_) { body = {}; }
    }
    if (!body || typeof body !== 'object') {
      console.warn('[machine-chat-log] Empty or invalid body, skipping.');
      return;
    }

    const {
      session_id, architect_id, mission_id, mission_name,
      event, player_question, machine_reply, outcome,
      conversation_history, selected_parts, selected_fixes,
      selected_boost, coherence_score, validation_attempts,
      timestamp, qbit_name, final_build, matched_solution, total_messages
    } = body;

    if (!session_id || !mission_id || !event) {
      console.warn('[machine-chat-log] Missing required fields:', { session_id, mission_id, event });
      return;
    }

    const s = v => (v != null ? String(v) : null);
    const n = v => (typeof v === 'number' ? Math.round(v) : null);
    const j = v => {
      if (v == null) return null;
      if (typeof v === 'string') { try { JSON.parse(v); return v; } catch (_) { return null; } }
      try { return JSON.stringify(v); } catch (_) { return null; }
    };

    await sql`
      INSERT INTO machine_chat_logs (
        session_id, architect_id, mission_id, mission_name, event,
        player_question, machine_reply, outcome,
        conversation_history, selected_parts, selected_fixes, selected_boost,
        coherence_score, validation_attempts,
        qbit_name, final_build, matched_solution, total_messages,
        client_timestamp, server_timestamp
      ) VALUES (
        ${s(session_id)?.slice(0,64)},
        ${s(architect_id)?.slice(0,128) ?? null},
        ${s(mission_id)?.slice(0,64)},
        ${s(mission_name)?.slice(0,128) ?? null},
        ${s(event)?.slice(0,32)},
        ${s(player_question)?.slice(0,2000) ?? null},
        ${s(machine_reply)?.slice(0,4000) ?? null},
        ${s(outcome)?.slice(0,64) ?? null},
        ${j(conversation_history)},
        ${j(selected_parts)},
        ${j(selected_fixes)},
        ${s(selected_boost)?.slice(0,16) ?? null},
        ${n(coherence_score)},
        ${n(validation_attempts)},
        ${s(qbit_name)?.slice(0,64) ?? null},
        ${j(final_build)},
        ${s(matched_solution)?.slice(0,64) ?? null},
        ${n(total_messages)},
        ${timestamp ? new Date(timestamp).toISOString() : null},
        NOW()
      )
    `;

  } catch (err) {
    console.error('[machine-chat-log] DB write failed:', err?.message || err);
  }
});

module.exports = router;
