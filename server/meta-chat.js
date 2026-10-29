'use strict';
// Shared Meta chat helper for chamber + Forge Socratic guidance.
//
// Same client setup as server/continuum-meta.js: the existing 'openai'
// package pointed at the Meta Model API
// (https://dev.meta.ai/docs/protocols/chat-completions), reasoning_effort
// minimal (the lowest level Muse Spark supports; 'none' returns HTTP 400),
// maxRetries 0, 25s timeout.
//
// No live calls are made unless the caller uses the default client, which
// requires MODEL_API_KEY. Tests inject a fake {client} and run offline.

const META_BASE_URL = 'https://api.meta.ai/v1';
const DEFAULT_MODEL = 'muse-spark-1.3';
const DEFAULT_TIMEOUT_MS = 25000;
// Muse Spark is a reasoning model: internal reasoning tokens come out of the
// output-token budget before any visible content. Callers pass maxTokens with
// headroom for that; the prompts themselves keep replies short.
// (Muse Spark does not support 'none'.) See /docs/reasoning.
const REASONING_EFFORT = 'minimal';
const DEFAULT_MAX_TOKENS = 500;

function createMetaClient() {
  // Lazy require so offline/test use never touches the SDK.
  // maxRetries is 0: one SDK call equals one Meta call. Never raise this
  // without adding a matching attempt budget at the call site.
  const OpenAI = require('openai');
  return new OpenAI({
    baseURL: META_BASE_URL,
    apiKey: process.env.MODEL_API_KEY,
    timeout: DEFAULT_TIMEOUT_MS,
    maxRetries: 0,
  });
}

function withTimeout(promiseLike, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('meta_client_timeout')), ms);
    Promise.resolve(promiseLike).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function logAttempt(model, startedAt, ok, reason) {
  // Only model, latency, and success/failure reason. Never the API key.
  const latencyMs = Date.now() - startedAt;
  if (ok) {
    console.log(`[meta-chat] model=${model} latency_ms=${latencyMs} ok=true`);
  } else {
    const safe = String((reason && reason.message) || reason || 'unknown').slice(0, 200);
    console.log(`[meta-chat] model=${model} latency_ms=${latencyMs} ok=false reason=${safe}`);
  }
}

// chat(messages, {maxTokens, client?, timeoutMs?}):
// messages are OpenAI-style [{role, content}]. Pass {client} to inject a
// fake chat-completions client for offline tests. Resolves the trimmed
// model reply; throws meta_client_timeout, empty_model_response, or the
// transport error so the caller can fall back to its offline reply.
async function chat(messages, opts = {}) {
  const model = process.env.CONTINUUM_MODEL || DEFAULT_MODEL;
  const timeoutMs =
    opts.timeoutMs !== undefined && Number.isFinite(opts.timeoutMs)
      ? opts.timeoutMs
      : DEFAULT_TIMEOUT_MS;
  const maxTokens =
    opts.maxTokens !== undefined && Number.isFinite(opts.maxTokens)
      ? opts.maxTokens
      : DEFAULT_MAX_TOKENS;
  const startedAt = Date.now();
  const client = opts.client || createMetaClient();
  try {
    const response = await withTimeout(
      client.chat.completions.create({
        model,
        reasoning_effort: REASONING_EFFORT,
        messages,
        max_completion_tokens: maxTokens,
      }),
      timeoutMs
    );
    const choice = response && response.choices && response.choices[0];
    const content = choice && choice.message && choice.message.content;
    if (typeof content !== 'string' || content.trim().length === 0) {
      const finish = choice && choice.finish_reason ? `:${choice.finish_reason}` : '';
      throw new Error(`empty_model_response${finish}`);
    }
    logAttempt(model, startedAt, true);
    return content.trim();
  } catch (err) {
    logAttempt(model, startedAt, false, err);
    throw err;
  }
}

module.exports = {
  META_BASE_URL,
  DEFAULT_MODEL,
  DEFAULT_TIMEOUT_MS,
  REASONING_EFFORT,
  DEFAULT_MAX_TOKENS,
  createMetaClient,
  chat,
};
