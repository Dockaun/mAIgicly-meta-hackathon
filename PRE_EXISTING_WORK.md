# Pre-existing Work — mAIgicly

Provenance record for the Meta Global AI Developer Hackathon build
(kickoff 2026-10-26). The original game predates the hackathon; this file
separates pre-existing work from hackathon contributions.

## a. Original game (pre-hackathon baseline)

- Four Guardian Chambers (Refrax, Magnetica, Chrona, Violetflicker) with
  restoration activities and chamber-completion tracking.
- Quantum Forge (guardian select + four Forge pages) with parts, fixes,
  boosts, and player-created Qbit construction.
- Qbit save/retrieval (`POST`/`GET /api/forged-qbits`, upsert on
  `architect_id` + `mission_id`).
- Continuum (Continuum Multiplay) with two predefined missions
  (`harmonic_rift`, `entanglement_cascade`).
- Existing scoring and gameplay validation.
- Existing Forge guidance from an earlier AI integration.

Baseline commit: `d112d2a1efc984111dc6f4007f94438ad4ab097a`
Baseline tag: `pre-hackathon-baseline`
("mAIgicly original game before Meta Global AI Developer Hackathon (kickoff 2026-10-26)")

## b. Pre-kickoff preparation (not Meta feature work)

Every commit from `d112d2a` to HEAD at time of writing, oldest first,
short SHA plus message copied from `git log`:

- `942f842` Document hackathon runtime dependencies and guarded prune candidates
- `749db18` Prune unused backups, obsolete pages, and training scaffolding
- `9de15ee` Hide My Forge from hackathon navigation
- `f70b9b3` Suppress My Forge unlock messaging in resonance for hackathon path
- `5bf5c2c` Remove My Forge unlock notification cleanly from resonance
- `8ccde7e` Add schema-only Neon setup and Qbit persistence tests
- `56f7640` Version-control the schema-only SQL and allow it through gitignore
- `e8cf7c3` Make the game runnable locally with a disposable Postgres

## b2. Documentation committed after kickoff (2026-10-26), no code

- `b783053` docs: record verified Continuum baseline and bounded Meta hackathon implementation plan
- `f4fee8b` docs: add reviewed mAIgicly project README

## c. Hackathon contributions

- continuum: rules, Meta challenge generator, challenge route with offline fallback (hackathon step 2)
  - server/continuum-rules.js (deriveCapabilities, CAPABILITY_VOCAB, validateChallenge, checkSolution, selectCandidates)
  - server/continuum-meta.js (Meta chat-completions generator, injectable client, offline-safe)
  - server/continuum-routes.js + 2 lines in server.js (POST /api/continuum/challenges/next, offline fallback)
  - tests/continuum-rules.test.js, tests/continuum-meta.test.js, `test:continuum` script
- continuum: community pool seed loader, live Meta generation, server-held challenges, Meta interpretation of player choices (hackathon step 3)
  - db/seed/load-community-qbits.js (idempotent insert of the pre-existing seed: all game fields incl. recipe/mechanism; skips name+mission_id and mission-held duplicates)
  - server/continuum-meta.js (SDK maxRetries 0; reasoning_effort minimal for direct-answer calls so reasoning tokens leave room for output)
  - server/continuum-routes.js (in-memory challenge store: max 500 entries, 2-hour expiry; 2 AI attempts inside a shared ~20s budget; POST /api/continuum/attempts/interpret)
  - server/continuum-interpret.js (Meta {feedback} for decided attempts, rules-authoritative pass/fail, fixed offline messages, HTTP 410 faded-challenge response)
  - tests/continuum-interpret.test.js (server-stored roles, 410 message, private-Qbit 400, rules-over-model, bad-feedback offline fallback, maxRetries 0, seed dedupe)
  - Seed data (db/seed/community-qbits.json + db/seed/README.md) is pre-existing player creations committed in 668c61a, not hackathon work.
- continuum: adopt 668c61a player seed, full-field loader, interpret 400 tokens (hackathon step 3 finish)
  - Rebased step 3 onto 668c61a keeping the origin seed byte-identical; loader key JSON.stringify([name, mission_id]); interpret max_completion_tokens 200 → 400; seed-shape test updates.
- continuum: Continuum screen uses Meta challenges, solver verification label, Meta feedback; community pool fix (hackathon step 4)
  - db/seed/load-community-qbits.js (per-seed anonymous owners ...c0de000000NN so shared missions coexist; exact-duplicate skip on name+mission+boost+parts+fixes; 7 rows)
  - server/continuum-routes.js (challenge response gains verified: Meta true, offline templates validated against the same candidates)
  - public/continuum.html under its original filename (async server missions with source/verified label + local fallback, Meta feedback via textContent, 410 reload, demo-Qbit skip; look/timers/scoring/loop unchanged)
  - tests/continuum-meta.test.js (verified true/false coverage)
- continuum: quantum-engineering voice, no answer leaks, stale-feedback guard, hint-gated role suggestions, /continuum.html (hackathon step 5)
  - server/continuum-rules.js (BANNED_WORDS + containsBannedWord enforced by validateChallenge on title/brief/role names; normalizeRoleIds overwrites model role ids with r1, r2)
  - server/continuum-meta.js (challenge prompt rewritten: awakened-Continuum-briefing-an-engineer voice, game-systems grounding, Guardian/Forge references, engineering role names, no real-quantum-computer claims, avoid-list, style example; old family/hopeful/plain-language/scary guidance removed)
  - server/continuum-interpret.js (same speaker + banned words; fail names only the missing capability and never a Qbit — mentionsQbitName rejects fail feedback naming a Qbit; pass explains capability-to-role fit with real tags; terse offline messages)
  - server/continuum-routes.js (Meta role ids rewritten before storing or returning; offline templates untouched)
  - public/continuum.html, renamed from its pre-hackathon filename (feedback cleared/hidden on each new challenge; interpret responses tagged with the challenge id + slot signature and stale ones discarded; "Use in <role>" hidden until ASK NETWORK is spent, charged once per challenge; string role-id slot handlers; no player-visible legacy-brand text)
  - public/forge.html, public/forge-magnetica.html, public/forge-chrona.html, public/forge-violetflicker.html, public/resonance.html, public/js/continuum-unlock.js (links now target /continuum.html); server.js (301 from the legacy page route -> /continuum.html, query preserved; legacy route removed in step 18)
  - tests/continuum-task5.test.js (banned words rejected incl. retry/fallback, role ids rewritten incl. stored copy, fail-feedback Qbit-name leak rejected, stale-id/client guards + rename asserted from the served page)
- continuum: recipe-based capabilities, adaptive levels, Invent mode, Continuum Qbits (hackathon step 7)
  - public/js/continuum-capabilities.js (one shared boost+fix tag mapping + req/reqAll satisfaction, UMD for server and browser)
  - server/continuum-rules.js (fix tags superposition/phase-control/collapse in CAPABILITY_VOCAB; req XOR reqAll in validateChallenge/checkSolution; levelForResults from last 5; buildAvailablePlan/buildInventPlan with solver proofs; isForgeableCombo; rolesMatchRequired)
  - server/continuum-meta.js (level + REQUIRED role tags in user prompt, Meta writes the story only; reqAll in JSON schema; single-tag req at level 1)
  - server/continuum-routes.js (server-decided difficulty 1-3 + mode available/invent on every challenge; continuum_results written by interpret from the rules-decided result; offline L2/L3 canned stories with solver-proven tags)
  - server/continuum-migrate.js + db/schema.sql (additive idempotent startup migration: origin/origin_challenge_title columns, partial unique index replacing the old constraint after a verified duplicate probe, continuum_results table; row counts + recipe checksum logged before/after)
  - server/forged-qbits-write.js + server.js (POST /api/forged-qbits: forged upsert on the partial index behaves as today; origin continuum always inserts a new row; other origins rejected; GET scope=continuum returns origin columns)
  - db/seed/load-community-qbits.js (ON CONFLICT targets the partial index)
  - public/continuum.html (shared-mapping capabilities; cards + NEEDS lines show all tags incl. reqAll; flame-count difficulty; stuck-role tag hints at the same ASK NETWORK cost; Invent banner + Forge button + sessionStorage resume)
  - public/js/forged-qbits-store.js (saves while an Invent challenge is pending send origin continuum + challenge title)
  - tests/continuum-task7.test.js (fix mapping + parity; reqAll; level up/down; L3 unsolvable-but-forgeable; interpret writes results; client cannot set level; forged in-place vs continuum insert; migration preservation; client UX statics); vocab + response-keys updates in tests/continuum-rules.test.js, tests/continuum-meta.test.js
- helpers: chamber and Forge Socratic guidance on Meta; nudge track layout fix (hackathon step 6)
  - server/meta-chat.js (shared Meta chat-completions helper: muse-spark-1.3 via CONTINUUM_MODEL, reasoning_effort minimal, maxRetries 0, 15s timeout, injectable client, offline-safe)
  - server.js (POST /api/forge-probe, /api/chamber-probe, /api/forge-companion/probe, /api/machine-hint call chat() with 500/600 output-token headroom and check MODEL_API_KEY; prompts, rules, response shapes and logging unchanged; My Forge / training / LoRA code from an earlier AI integration untouched)
  - Player-visible fallbacks no longer carry "[development fallback]"; source:'dev-fallback' stays in JSON only
  - public/chambers/{refrax,magnetica,chrona,violetflicker}.js + .html (nudge_to_zone track on its own full-width line under the label and buttons, min-width 160px; ids, handlers and difficulty unchanged)
  - tests/continuum-task6.test.js (fake-client success/timeout/empty; each of the 4 routes uses meta-chat; fallback text; nudge layout statics)
- helpers: chamber follow-up questions answered by Meta with context (hackathon step 9)
  - public/chambers/{refrax,magnetica,chrona,violetflicker}.js (_chamberProbe remembers the failed-drop context; typed _doSend posts dropped_into_slot/correct_mod_for_slot/target_part_id/target_part_name/attempted_mod/correct_mod; limits, handlers and first probe unchanged)
  - server/chamber-followup.js (Guardian-voice follow-up prompt: answers the typed question, max 2 sentences, Socratic, never names the correct mod symbol, stays on the current part and fix, off-topic nudged back to the repair; 1000-token reasoning headroom; one retry with a shorter prompt; mentionsModSymbol guard; player-safe fallback)
  - server.js (/api/chamber-probe routes a non-empty voice_transcript to followupProbe; first-probe prompt, 500-token budget, fallbacks and logging unchanged)
  - tests/continuum-task9.test.js (fake-client follow-up prompt/context, empty-one-retry-fallback, answer never contains the correct mod symbol; server-wiring and client-context statics)
- helpers: The Machine sees the player's build and a principle-level gap diagnosis (hackathon step 10)
  - server/machine-context.js (mission/solution data mirrored from the forge pages; Open/Align/Lock coverage, fix success-cue fit, closest-combination boost compatibility; user message with build, test result and DIAGNOSIS; solution lists and unselected part/fix/boost names never sent to the model; injectable client)
  - server.js (/api/forge-probe routes machine_query to machineProbe; Machine rules kept plus use-the-readings, principle-terms gap, never-name-additions; Socratic probe path, budgets, fallbacks and logging unchanged)
  - public/{forge,forge-magnetica,forge-chrona,forge-violetflicker}.html (machine queries add the latest test result from resultBox; mission/parts/fixes/boost already sent)
  - tests/continuum-task10.test.js (fake-client build/diagnosis in model input, no solution or unselected-name leaks, matcher parity with the pages, server-wiring and client statics)
- operator codes: save-your-code gate with typed confirmation, visible header code, restore verified; Meta timeouts (hackathon step 11)
  - Operator Codes and code restore pre-exist (operator-id.js, /api/operator-id routes, landing lookup); this task adds the save gate, labels, verifies restore, and tunes timeouts
  - public/js/operator-id.js (showSaveGate two-step gate: write-it-down view with copy, hidden-code typing check via case/space-insensitive codesMatch, wrong-code message with show-again link; confirmed/restored flags; syncProgress/fetchProgress; dead prefill modal removed; code only, no personal data)
  - public/index.html (Begin Restoration runs through the gate for new players; returning link now "I've been here before · enter my Operator Code"; restore pulls progress flags back into localStorage)
  - public/resonance.html + public/continuum.html (header reads "Operator CODE · keep this code" with a copy button; resonance also gates unconfirmed direct visitors and backs up progress on load)
  - public/chambers/*.{html,js} (completion backs up the chamber flag plus earned/total points to /api/progress)
  - server/player-progress.js + server.js + db/schema.sql (player_progress table; POST/GET /api/progress with an allowlisted 9-key set; restore verified live: Qbit, unlocks, level 2, continuum Qbit all come back)
  - server/meta-chat.js + server/continuum-meta.js (timeout 15s to 25s; reasoning stays minimal, the lowest level Muse Spark supports per the docs); tests/continuum-task6.test.js timeout assertion updated
  - tests/continuum-task11.test.js (confirm check case/space-insensitive incl. node-loaded operator-id.js; fake-sql progress round-trip; restore-includes-continuum-data wiring; gate/header/landing/chamber statics)
- continuum: canonical Qbit capabilities, recipe cards, function-phrased needs, hint reveals tags, visible levels (hackathon step 12)
  - note: corrects the pre-existing boost-to-capability mapping to match the original design (one canonical tag per boost); stored Qbits, seeds, and recipe checksums untouched — only runtime interpretation and display changed
  - public/js/continuum-capabilities.js (one shared source: canonical BOOST_TAG_MAP/CAPABILITY_VOCAB, TAG_PHRASES map, needsTextForRole reqAll/req wording)
  - server/continuum-rules.js + server/continuum-routes.js (re-exported vocab/phrases; offline templates remapped with intent preserved; every response role carries server-rendered needs)
  - server/continuum-meta.js + server/continuum-interpret.js (entanglement guard: correlates outcomes, never communication/messaging/signaling)
  - public/continuum.html (cards show Boost/Fixes/Parts recipe with canonical names; slots show function phrases; ASK NETWORK also reveals tag labels on slots and cards; level badge Apprentice/Engineer/Inventor, flame life, up/down moments vs sessionStorage, reduced-motion safe)
  - tests/continuum-{rules,meta,interpret,task5,task7}.test.js remapped to the new tags (intent preserved); tests/continuum-task12.test.js (mapping, no old tags in server/page, phrase coverage/wording, recipe cards, template-vs-seed solvability, stored-rows-untouched, prompt guard, levels)
- guide: the Machine guides players from the Resonance hub; personality restores with progress; wording fixes; local-sql fire-and-forget; confirmed_at (hackathon step 13)
  - server/guide.js (nextStep pure-code guidance matching the real unlock rules: start/guardians/forge/unstable/stable/full; server-held values override client claims, missions from client snapshot only; stage-shaped Meta voice, max 2 sentences, never a Guardian order/recipe/combo/solution; fix+part and unasked-Guardian guards with nextStep fallback; 20/hour/architect rate limit; 200-char questions; offline reply = nextStep)
  - server.js (POST /api/guide: architect_id required; forged-Qbit count, Task 11 progress flags, continuum attempts from the server; MODEL_API_KEY-gated chat() with the guide token budget; no key logged or exposed)
  - public/js/machine-guide.js + one script line in public/resonance.html (fixed-only orb 48px/44px mobile, label on hover/focus, greeting + stage-change bubble, 320px/50vh panel with nextStep + Ask input, Esc/X close, 60vh mobile sheet, textContent replies, existing layout untouched)
  - server/local-sql.js (top-level un-awaited sql`` runs on the next tick so fire-and-forget INSERTs land; embedding into a parent cancels the run; empty fragments inert; failures warn, never reject); tests/local-sql-fragments.test.js updated to the new contract
  - server.js + tests (operator_ids.confirmed_at TIMESTAMP via additive ALTER TABLE ... ADD COLUMN IF NOT EXISTS at startup; confirm UPDATE persists)
  - public/js/continuum-capabilities.js + server/continuum-routes.js + public/continuum.html (req slot needs read "Needs a Qbit that can X (or Y)"; reqAll unchanged; both offline template descriptions rewritten in canonical function vocabulary); tests/continuum-meta.test.js + tests/continuum-task12.test.js pins updated
  - tests/continuum-task13.test.js (nextStep every stage + any Guardian order, no Guardian names, server-over-client, voice/stage selection, no fix+part pairs, rate limit, offline fallback, items 5/6/7, route + client statics)
- cleanup: public-submission removal of My Forge, an unrelated project's controller, training/LoRA/export; admin token lock; lore rename (hackathon step 14)
  - removed after grep-proof no preserved page or kept route depends on them: public/my-forge.html; server/phase3-router.js, server/adapter-router.js, server/learner-profile-store.js (unrequired anywhere); server.js spans for /api/my-forge/*, /my-forge*, /api/learner/*, /api/phase3/*, the removed controller's /api routes, /api/training/*, /api/admin/my-forge/*, /api/generate-training-pairs, /api/export-lora-dataset, the inline controller classes, CONFIG, and helpers used only by removed routes (buildWorldBrief kept: /api/forge-probe and /api/forge-companion/probe use it)
  - kept with reason: /query (CSV-only lore lookup, not from an earlier AI integration); /api/session-log, /api/machine-chat-log, /api/generate-qbit-gif (not listed for removal); legacy-brand identifiers, localStorage keys, comments and console tags in preserved pages (code, not user-facing text — no visible legacy-brand text exists; all renamed in step 18); /events-report, /ratings-report, /api/traffic-stats, /api/analytics-health (outside the /admin/*, /api/admin/* lock list)
  - server/admin-lock.js + server.js (x-admin-token must equal ADMIN_TOKEN on /admin/* and /api/admin/* incl. static public/admin; missing/wrong/unset token returns 404)
  - public/data/qbit_rag.csv renamed to public/data/guardian-lore.csv; QBIT_RAG/loadQbitRAG/loader comments and log tags renamed to lore (dialog.csv Mini-RAG machinery untouched); sharp removed from package.json (nothing imports it), package-lock regenerated
  - tests/continuum-task14.test.js (admin lock allow/deny/404 + wiring, removed-route/symbol/file absence, kept routes/pages/modules, unlock-key preservation, lore rename, dep prune); tests/continuum-task6.test.js untouched-guard updated to assert the ordered removal
- guide fixes, Network Analysis panel, full Invent round trip (hackathon step 15)
  - server/guide.js (guard rejects only fix+part pairs and Guardian-near-order-word prescriptions, naming allowed; rejection logs reason only; prompt states Resonance-hub location plus exact facts chambers N/4, Forge yes/no, Qbits N, Continuum locked/unstable/stable/full; questions answered first; replies em-dash-stripped via server/reply-text.js, also applied to Forge machineProbe and /api/machine-hint)
  - public/js/machine-guide.js + public/resonance.html (mobile bubble 3-line clamp + 8s auto-hide; footer static at page end on <=768px, fixed desktop; first orb appearance pulses 3 cycles with label 4s + one Web Audio chime after first tap/click, once per browser, motion-gated)
  - server/continuum-analysis.js + server/continuum-meta.js + server/continuum-routes.js (challenge responses gain analysis: deterministic pool scan, 4-5 NETWORK SAMPLE lines with >=half outside any solution, Meta rationale max 20 words rejected when naming a Qbit, exact solver lines incl. Invent forgeability; offline path deterministic)
  - public/continuum.html (analysis panel id renamed to networkAnalysis; lines typed ~400ms apart via textContent; mission stats below analysis; borrowed-Qbit credit lines; Invent success text; NEW tag on the forged Qbit; faded-request line with fresh challenge; UI em dashes removed)
  - public/js/continuum-request.js + 4 forge pages (Continuum Request card with title + function phrases only, dismiss clears; save while active stores the NEW id and offers Return to the Continuum instead of auto-redirect)
  - tests/continuum-task15.test.js (41 tests: guard/prompt/em-dash/mobile/orb, analysis builder + route wiring + determinism, panel/client/forge/invent statics, request-validation logic); task13 guard/prompt, meta response-keys, and task12 window expectations updated for the ordered changes
- legacy-brand removal before going public (hackathon step 18)
  - server.js (removed startup schema/migrations/repairs for the dead controller tables after grep-proof no route, page, or test touches them; removed the legacy page redirect; probe comments renamed; dead personal-space prompt branch removed)
  - db/schema.sql + db/README.md (dead tables and unused columns dropped; kept tables documented); docs/RESTORE_VERIFICATION_2026-10-27.md (dead log line and legacy page URL updated)
  - the unlock module renamed to public/js/continuum-unlock.js; every legacy identifier, element id, CSS class, comment, log tag, and analytics event renamed to Continuum/network names across server.js, server/, public/, and tests/
  - storage migration: legacy unlock keys copy to continuum.* once on page load (new key wins), old keys removed, storage errors swallowed, so players keep unlocks
  - docs neutralized to "an earlier AI integration" / "an unrelated project" with provenance facts intact; violet_panel.png IDAT recompressed (pixel-identical, hash-verified) so no incidental compressed byte run matches the brand sweep
  - tests/continuum-task18.test.js (migration logic, rename wiring, dead-table absence, repo-wide brand sweep); task5/task6/task12/task14/task15 expectations updated for the ordered renames
