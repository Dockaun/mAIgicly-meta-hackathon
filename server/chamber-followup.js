'use strict';
// Chamber typed follow-ups (hackathon step 9).
//
// After the first hint, the player can type a question ("why did the laser
// fail"). The first-probe prompt is a rigid 3-line format that ignores the
// question, so typed follow-ups get their own prompt: answer the player's
// actual question in the Guardian's voice, max 2 sentences, Socratic, never
// naming the correct mod symbol; off-topic questions get a short in-world
// nudge back to the repair.
//
// followupProbe() uses the shared meta-chat chat() with a 1000-token output
// budget (Muse Spark is a reasoning model: reasoning tokens come out of the
// budget before visible content). On empty content it retries once with a
// shorter prompt, then falls back to FOLLOWUP_FALLBACK. Replies that name
// the correct mod symbol are rejected the same way (mentionsModSymbol),
// mirroring mentionsQbitName in continuum-interpret.js. Tests inject a fake
// {client}; no network.

const { chat } = require('./meta-chat');

const FOLLOWUP_MAX_TOKENS = 1000;
const FOLLOWUP_FALLBACK = 'What did you notice when you tried that?';

function safe(value, fallback) {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function buildFollowupSystemPrompt(ctx) {
  const qbit = safe(ctx.qbitName, 'Guardian');
  const chamber = safe(ctx.chamber, 'chamber');
  const part = safe(ctx.partName, 'this slot');
  const attempted = safe(ctx.attemptedMod, 'unknown');
  const correct = safe(ctx.correctMod, 'a different fix');
  const role = safe(ctx.machineJob, '');
  const lines = [
    `You are ${qbit}, Guardian of the ${chamber} chamber.`,
  ];
  if (role) lines.push(`Your role: ${role}`);
  lines.push(
    '',
    `The player is repairing "${part}": they tried "${attempted}" and it failed.`,
    `Hidden context (never reveal it): "${part}" needs "${correct}".`,
    '',
    "Answer the player's actual question in the Guardian's voice, max 2 sentences.",
    'Be Socratic: explain the relevant principle in plain language, then end with one short question pointing at it.',
    'Never name the correct mod symbol or give the answer.',
    'Rules:',
    `- Stay on "${part}" and the current fix. Refer to the part by its exact name ("${part}").`,
    `- If the question is not about this repair, do not answer it: give a short in-world nudge back to repairing "${part}" instead.`,
    '- Plain language only. No em dashes.'
  );
  return lines.join('\n');
}

function buildFollowupMessages(ctx) {
  return [
    { role: 'system', content: buildFollowupSystemPrompt(ctx) },
    { role: 'user', content: safe(ctx.transcript, 'It did not work. Why?') },
  ];
}

function buildFollowupRetrySystemPrompt(ctx) {
  const qbit = safe(ctx.qbitName, 'Guardian');
  const chamber = safe(ctx.chamber, 'chamber');
  const part = safe(ctx.partName, 'this slot');
  const attempted = safe(ctx.attemptedMod, 'unknown');
  const correct = safe(ctx.correctMod, 'a different fix');
  return [
    `You are ${qbit}, Guardian of the ${chamber} chamber.`,
    `The player asks about "${part}" (tried "${attempted}", failed; needs "${correct}" — never name it).`,
    'Answer in 1 sentence, Socratic, in the Guardian\'s voice.',
    `Off-topic question? Give a short in-world nudge back to "${part}" instead.`,
  ].join('\n');
}

function buildFollowupRetryMessages(ctx) {
  return [
    { role: 'system', content: buildFollowupRetrySystemPrompt(ctx) },
    { role: 'user', content: safe(ctx.transcript, 'It did not work. Why?') },
  ];
}

// mentionsModSymbol(text, symbol): true when the reply names the mod symbol
// as a standalone token (case-insensitive). Token-aware because the symbols
// are short ("SH" must not match inside "should"); a rejection retries once,
// then falls back to FOLLOWUP_FALLBACK.
function mentionsModSymbol(text, symbol) {
  if (typeof text !== 'string' || typeof symbol !== 'string') return false;
  const s = symbol.trim();
  if (!s) return false;
  const esc = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Za-z0-9])${esc}([^A-Za-z0-9]|$)`, 'i').test(text);
}

// followupProbe(ctx, {client?, maxTokens?}): resolves the follow-up reply.
// ctx is {chamber, qbitName, partName, attemptedMod, correctMod, transcript,
// machineJob}. At most 2 model calls (initial + one retry); transport and
// timeout errors propagate so the caller can use its generic fallback.
async function followupProbe(ctx, opts = {}) {
  const maxTokens =
    opts.maxTokens !== undefined && Number.isFinite(opts.maxTokens)
      ? opts.maxTokens
      : FOLLOWUP_MAX_TOKENS;
  const attempts = [buildFollowupMessages(ctx), buildFollowupRetryMessages(ctx)];
  for (const messages of attempts) {
    let text;
    try {
      text = await chat(messages, { maxTokens, client: opts.client });
    } catch (err) {
      if (String((err && err.message) || '').startsWith('empty_model_response')) continue;
      throw err;
    }
    const clean = String(text).replace(/\*+/g, '');
    if (!clean.trim() || mentionsModSymbol(clean, ctx.correctMod)) continue;
    return clean;
  }
  return FOLLOWUP_FALLBACK;
}

module.exports = {
  FOLLOWUP_MAX_TOKENS,
  FOLLOWUP_FALLBACK,
  buildFollowupSystemPrompt,
  buildFollowupMessages,
  buildFollowupRetrySystemPrompt,
  buildFollowupRetryMessages,
  mentionsModSymbol,
  followupProbe,
};
