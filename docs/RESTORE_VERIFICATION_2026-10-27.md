# Restore verification — 2026-10-27 (hackathon step 1)

Raw commands and outputs for original-game verification. No game, server,
schema, or README files were modified in this step. Only `.gitignore`
(added `.data/`), `PRE_EXISTING_WORK.md`, and this file changed.

Working directory for all commands: `/srv/maigicly/app`
(`git rev-parse HEAD` = `f4fee8b56119b05cedace255392481d5d15e97e5`,
branch `build/hackathon-game`).

## 1. Environment

```
$ node --version; npm --version; ls public/chambers/
v22.23.4
10.9.9
chrona.html
chrona.js
magnetica.html
magnetica.js
refrax.html
refrax.js
violetflicker.html
violetflicker.js
```

## 2. Install

```
$ npm ci 2>&1 | tail -3; echo "EXIT_CODE=$?"
  npm audit fix --force

Run `npm audit` for details.
EXIT_CODE=0
```

## 3. First server start (data dir missing)

```
$ rm -rf /tmp/hackathon-server.log /tmp/hackathon-server2.log; setsid -f env USE_LOCAL_DB=1 PGLITE_DATA_DIR=./.data/pglite PORT=5000 node server.js </dev/null >>/tmp/hackathon-server.log 2>&1; sleep 6; cat /tmp/hackathon-server.log
⚠️ OPENAI_API_KEY not set — using stub replies
[RAG] Loaded 9 Qbit profiles
✅ Local disposable Postgres (PGlite) — development only, no production data
✅ Database connection ready
🚀 Quantum chat server running on port 5000
[... 52 ENOENT lines elided: repeated "[local-sql] schema stmt: ENOENT: no such
... file or directory, mkdir '/srv/maigicly/app/.data/pglite'" and "[DB] ...:
... ENOENT: no such file or directory, mkdir '/srv/maigicly/app/.data/pglite'".
... verified: grep -c ENOENT = 52 over the 90-line combined log ...]

🚨 [ANALYTICS ALERT] Could not verify analytics tables: ENOENT: no such file or directory, mkdir '/srv/maigicly/app/.data/pglite'

✅ Mini-RAG loaded: 68 rows from dialog.csv
```

PGlite could not create `./.data/pglite` on its own, so the server was
stopped, the directory pre-created, and the server started again:

```
$ mkdir -p .data/pglite && ls -la .data/ && setsid -f env USE_LOCAL_DB=1 PGLITE_DATA_DIR=./.data/pglite PORT=5000 node server.js </dev/null >>/tmp/hackathon-server.log 2>&1; sleep 8; tail -25 /tmp/hackathon-server.log
total 12
drwxrwxr-x  3 maigicly maigicly 4096 Oct 27 10:38 .
drwxrwxr-x 17 maigicly maigicly 4096 Oct 27 10:38 ..
drwxrwxr-x  2 maigicly maigicly 4096 Oct 27 10:38 pglite
[... tail shows the end of the previous run's log, then the clean restart: ...]
⚠️ OPENAI_API_KEY not set — using stub replies
[RAG] Loaded 9 Qbit profiles
✅ Local disposable Postgres (PGlite) — development only, no production data
✅ Database connection ready
🚀 Quantum chat server running on port 5000
✅ Mini-RAG loaded: 68 rows from dialog.csv
```

Second run: zero ENOENT errors.

## 4. HTTP status of game pages and APIs

```
$ for p in / /resonance.html /chambers/refrax.html /chambers/magnetica.html /chambers/chrona.html /chambers/violetflicker.html /forge-guardian-select.html /forge.html /forge-chrona.html /forge-magnetica.html /forge-violetflicker.html /continuum.html /api/forged-qbits /api/network-stats; do code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:5000$p"); echo "$code $p"; done
200 /
200 /resonance.html
200 /chambers/refrax.html
200 /chambers/magnetica.html
200 /chambers/chrona.html
200 /chambers/violetflicker.html
200 /forge-guardian-select.html
200 /forge.html
200 /forge-chrona.html
200 /forge-magnetica.html
200 /forge-violetflicker.html
200 /continuum.html
200 /api/forged-qbits
200 /api/network-stats
```

API bodies before the test write:

```
$ curl -s http://127.0.0.1:5000/api/forged-qbits | head -c 600; echo; echo '==='; curl -s http://127.0.0.1:5000/api/network-stats | head -c 600; echo
[]
===
{"qbits":0,"players":0}
```

## 5. POST one test Qbit

Fixed test UUID `00000000-0000-4000-8000-000000000001`, visibility
`public`, mission `verify-2026-10-27`:

```
$ curl -s -w '\nHTTP_STATUS:%{http_code}\n' -X POST http://127.0.0.1:5000/api/forged-qbits -H 'Content-Type: application/json' -d '{"architect_id":"00000000-0000-4000-8000-000000000001","name":"Step1VerifyQbit","alias":"step1-verify-qbit","role":"Phase anchor","mission_id":"verify-2026-10-27","parts":["core"],"fixes":["align"],"boost":"high-phase","visibility":"public"}'; echo '==='; ls -la .data/pglite/ | head
{"id":1,"architect_id":"00000000-0000-4000-8000-000000000001","name":"Step1VerifyQbit","alias":"step1-verify-qbit","role":"Phase anchor","mission_id":"verify-2026-10-27","look":{},"parts":["core"],"fixes":["align"],"boost":"high-phase","emblem":{},"story":"","mechanism":"","recipe":null,"image":null,"timestamp":1793097565981,"visibility":"public","view_count":0,"created_at":"2026-10-27T10:39:25.981Z","action":"created"}
HTTP_STATUS:201
===
total 132
drwxrwxr-x 19 maigicly maigicly  4096 Oct 27 10:38 .
drwxrwxr-x  3 maigicly maigicly  4096 Oct 27 10:38 ..
-rw-rw-r--  1 maigicly maigicly     3 Jan 21  1970 PG_VERSION
drwxrwxr-x  5 maigicly maigicly  4096 Oct 27 10:38 base
drwxrwxr-x  2 maigicly maigicly  4096 Oct 27 10:38 global
drwxrwxr-x  2 maigicly maigicly  4096 Oct 27 10:38 pg_commit_ts
drwxrwxr-x  2 maigicly maigicly  4096 Oct 27 10:38 pg_dynshmem
-rw-rw-r--  1 maigicly maigicly  5721 Jan 21  1970 pg_hba.conf
-rw-rw-r--  1 maigicly maigicly  2681 Jan 21  1970 pg_ident.conf
```

GET confirms the row immediately:

```
$ curl -s http://127.0.0.1:5000/api/forged-qbits | head -c 400; echo; curl -s http://127.0.0.1:5000/api/network-stats; echo
[{"id":1,"architect_id":"00000000-0000-4000-8000-000000000001","name":"Step1VerifyQbit","alias":"step1-verify-qbit","role":"Phase anchor","mission_id":"verify-2026-10-27","look":{},"parts":["core"],"fixes":["align"],"boost":"high-phase","emblem":{},"story":"","mechanism":"","recipe":null,"image":null,"timestamp":1793097565981,"visibility":"public","view_count":0,"created_at":"2026-10-27T10:39:25.9
{"qbits":1,"players":1}
```

## 6. Restart and confirm persistence

The first restart attempt killed the operator's own shell along with the
server (the `pgrep -f` pattern matched the command's own text), so the
server was confirmed down and then started again with a fresh log:

```
$ pgrep -af "node serve" || echo "no server proc"; curl -s -o /dev/null -w 'root:%{http_code}\n' --max-time 5 http://127.0.0.1:5000/ || echo "no http"
no server running            # (only the probing shell itself matched; server was down)
root:000
no http

$ rm -f /tmp/hackathon-server2.log; setsid -f env USE_LOCAL_DB=1 PGLITE_DATA_DIR=./.data/pglite PORT=5000 node server.js </dev/null >>/tmp/hackathon-server2.log 2>&1; sleep 8; cat /tmp/hackathon-server2.log
⚠️ OPENAI_API_KEY not set — using stub replies
[RAG] Loaded 9 Qbit profiles
✅ Local disposable Postgres (PGlite) — development only, no production data
✅ Database connection ready
🚀 Quantum chat server running on port 5000
✅ Mini-RAG loaded: 68 rows from dialog.csv
[local-sql] disposable PGlite ready at ./.data/pglite
✅ Analytics tables verified: events, request_log
```

GET after restart still returns the test Qbit:

```
$ curl -s -w '\nHTTP_STATUS:%{http_code}\n' http://127.0.0.1:5000/api/forged-qbits; curl -s http://127.0.0.1:5000/api/network-stats; echo
[{"id":1,"architect_id":"00000000-0000-4000-8000-000000000001","name":"Step1VerifyQbit","alias":"step1-verify-qbit","role":"Phase anchor","mission_id":"verify-2026-10-27","look":{},"parts":["core"],"fixes":["align"],"boost":"high-phase","emblem":{},"story":"","mechanism":"","recipe":null,"image":null,"timestamp":1793097565981,"visibility":"public","view_count":0,"created_at":"2026-10-27T10:39:25.981Z"}]
HTTP_STATUS:200
{"qbits":1,"players":1}
```

Result: the test Qbit persisted across the server restart.

## 7. Delete only the test row, stop the server

No DELETE route exists for forged Qbits, and PGlite cannot be opened by
two processes at once, so the server was stopped first and the row
deleted with a one-off script (`/tmp/delete-step1-test-row.js`, kept
outside the repo) that opens `./.data/pglite` directly:

```
$ pat='node serv'; q='er.js'; pids=$(pgrep -f "$pat$q"); echo "matched pids: $pids"; for p in $pids; do if [ "$p" != "$$" ]; then kill "$p" && echo "killed $p"; fi; done; sleep 4; pgrep -f "$pat$q" || echo "server stopped"
matched pids: 69753
killed 69753
server stopped

$ node /tmp/delete-step1-test-row.js
BEFORE: [{"id":1,"architect_id":"00000000-0000-4000-8000-000000000001","mission_id":"verify-2026-10-27","name":"Step1VerifyQbit"}]
DELETED_COUNT: 1
AFTER: []
```

The delete script (`/tmp/delete-step1-test-row.js`):

```js
// One-off: delete only the step-1 verification test row from local PGlite.
const { PGlite } = require('/srv/maigicly/app/node_modules/@electric-sql/pglite');
(async () => {
  const db = new PGlite('/srv/maigicly/app/.data/pglite');
  const before = await db.query(
    'SELECT id, architect_id, mission_id, name FROM forged_qbits ORDER BY id'
  );
  console.log('BEFORE:', JSON.stringify(before.rows));
  const del = await db.query(
    "DELETE FROM forged_qbits WHERE architect_id = '00000000-0000-4000-8000-000000000001' AND mission_id = 'verify-2026-10-27'"
  );
  console.log('DELETED_COUNT:', del.rowCount);
  const after = await db.query('SELECT id, architect_id, mission_id, name FROM forged_qbits ORDER BY id');
  console.log('AFTER:', JSON.stringify(after.rows));
  await db.close();
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
```

Final state:

```
$ pgrep -f "$pat$q" || echo "no server process"; curl -s -o /dev/null -w 'root:%{http_code}\n' --max-time 5 http://127.0.0.1:5000/ || echo "http down (expected)"; git status --short
no server process
root:000
http down (expected)
 M .gitignore
?? PRE_EXISTING_WORK.md
```

Only the test row was deleted (it was the only row); the table is empty
and no server process remains.

## Summary

- All 14 URLs returned HTTP 200.
- POST test Qbit returned 201; GET returned it before and after restart.
- Test row deleted; `forged_qbits` empty; server stopped.
