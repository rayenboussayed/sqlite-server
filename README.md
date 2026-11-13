# sqlite-server

SQLite needs a server too.

`sqlite-server` exposes a centralized SQLite database to remote clients over HTTP + JSON, the way a network database server works — think Turso/libSQL, but self-hosted, single-process, and built directly on Node's built-in `node:sqlite` (no native module is required at runtime). Beyond the SQL endpoint it also serves a key/value store, a TTL cache, and a job queue, each backed by its own SQLite file.

**Features**

- Arbitrary SQL over HTTP with positional `?` parameters, prepared-statement inspection, and all-or-nothing batches
- Automatic detection of row-returning statements vs. mutations (no separate `/query` and `/execute` verbs)
- KV storage and a TTL cache (`Keyv` + `@keyv/sqlite`) as independent SQLite files
- SQS-lite job queue with visibility timeouts and delayed delivery
- Header-based auth with constant-time comparison; only `/health` and `/api` are public
- Zod v4 request validation, generated OpenAPI docs served as Swagger UI
- Optional `sqlite-vec` extension for vector search
- Zero external services: one Node process and some `.sqlite` files

All four feature groups — `/db`, `/kv`, `/cache`, `/queue` — are implemented, plus the auth layer, `/health`, and the `/api` docs page.

## Requirements

- **Node.js >= 24** — SQLite comes from the built-in `node:sqlite` module. `@keyv/sqlite` lists `better-sqlite3` as a dependency, but it is never used at runtime (the `node:sqlite` driver is preferred automatically), so nothing is compiled on a minimal setup.
- npm (any recent version).

## Quick start

```bash
npm install

# development (compiles and runs via the Nest CLI)
npm run start

# watch mode
npm run start:dev
```

Production:

```bash
npm run build
npm run start:prod   # node dist/main
```

The server listens on `PORT` (default `3000`). Swagger UI is at <http://localhost:3000/api>, and the health probe is at <http://localhost:3000/health>.

## Configuration

All configuration is read from environment variables by `src/environment.ts`, which parses them with zod **at import time** — an invalid value kills the process on boot rather than surfacing later.

| Variable | Default | Description |
| --- | --- | --- |
| `SQLITE_DATABASE_PATH` | `<cwd>/database/database.sqlite` | SQL database file served by `/db/*`. |
| `SQLITE_CACHE_PATH` | `<cwd>/database/cache.sqlite` | Cache store used by `/cache/*` (5-minute default TTL). |
| `SQLITE_KV_PATH` | `<cwd>/database/kv.sqlite` | Key/value store used by `/kv/*` (no default TTL). |
| `QUEUE_STORAGE_PATH` | `<cwd>/database/queue.sqlite` | Job queue storage. |
| `SQLITE_READ_ONLY` | `false` | Opens the main SQL database read-only (`true`/`false`). Mutations then fail at the SQLite level. |
| `DATABASE_EXTENSIONS` | unset | Comma-separated extensions to load. Only `vector` is accepted, which loads `sqlite-vec`; any other name fails validation at boot. |
| `AUTH_USERNAME` | unset | Username for header auth. Must be set together with `AUTH_PASSWORD`. |
| `AUTH_PASSWORD` | unset | Password for header auth. Must be set together with `AUTH_USERNAME`. |
| `PORT` | `3000` | HTTP listen port. |

Parent directories for all four database paths are created automatically, so `./database/` appears on first boot. Point the paths somewhere with real disk — these files are the only durable state.

## Authentication

Clients authenticate with two headers:

```
auth-username: <username>
auth-password: <password>
```

- `GET /health` is exempt so load balancers and Kubernetes probes can reach it unauthenticated.
- Comparisons are constant-time (`sha512` digests + `timingSafeEqual`), so neither the content nor the length of a credential leaks through timing.
- If **both** `AUTH_USERNAME` and `AUTH_PASSWORD` are unset, auth is disabled and the server logs a prominent boot warning — anyone who can reach the port has full access.
- If **only one** is set, every request fails with `401`. Partial configuration fails closed rather than silently accepting a half-secret.
- No TLS is terminated in-process. Put nginx, Caddy, or another reverse proxy in front and **never expose the plaintext port to the internet** — credentials travel in headers.

## API overview

Interactive documentation is generated from the zod schemas and served at `GET /api` (Swagger UI). `/api` is public like `/health`: it serves documentation only and executes nothing — every API endpoint still requires auth. All POST endpoints return `200` on success.

| Method | Path | Request body | Response |
| --- | --- | --- | --- |
| `GET` | `/health` | — | `{ "status": "ok" }` |
| `POST` | `/db/query` | `{ sql, params?: (string \| number \| boolean \| null)[] }` | Rows: `{ sql, columns, rows, rowCount }`. Mutation: `{ sql, changes, lastInsertRowid }`. |
| `POST` | `/db/prepare` | `{ sql }` | `{ sql, columns }` — validates the SQL and reports column metadata without executing it. |
| `POST` | `/db/batch` | `{ statements: [{ sql, params? }] }` | `{ results: [...] }` — every statement runs inside one `BEGIN IMMEDIATE … COMMIT`; all-or-nothing. |
| `POST` | `/kv/get` | `{ key }` or `[{ key }]` | `{ values: [...] }` — order-aligned with the request, `null` for missing keys. |
| `POST` | `/kv/set` | `{ key, value, ttl? }` or an array of them | `{ results: [...] }` — one success flag per entry. |
| `POST` | `/kv/delete` | `{ key }` or `[{ key }]` | `{ results: [...] }` — one success flag per key. |
| `POST` | `/cache/get` | `{ key }` or `[{ key }]` | `{ values: [...] }` |
| `POST` | `/cache/set` | `{ key, value, ttl? }` or an array of them | `{ results: [...] }`; `ttl` is milliseconds, default 5 minutes |
| `POST` | `/cache/delete` | `{ key }` or `[{ key }]` | `{ results: [...] }` |
| `POST` | `/queue/enqueue` | `{ jobs: [{ payload, delayMs? }] }` | `{ ids: [...] }` — payloads are any JSON values; `delayMs` defers availability |
| `POST` | `/queue/dequeue` | `{ limit?, visibilityMs? }` or no body | `{ jobs: [{ id, payload }] }` — leases messages atomically (default 1 message, 30s lease) |
| `POST` | `/queue/ack` | `{ ids: [...] }` | `{ acked: n }` — deletes leased messages |
| `POST` | `/queue/nack` | `{ ids: [...] }` | `{ released: n }` — makes leased messages visible again |
| `GET` | `/queue/size` | — | `{ pending: n }` — count of claimable messages |

Notes:

- **KV and cache payloads accept a singleton or an array.** Passing one object and passing a one-element array are equivalent, which keeps single-key calls terse and batch calls cheap. Keys are trimmed strings of 1–512 characters.
- `params` are **positional only** — use `?` placeholders. Values may be `string`, `number`, `boolean`, or `null`; booleans are bound as `1`/`0` because SQLite has no boolean type. A statement accepts at most 999 parameters.
- `columns` is an array of `{ name, type }`, where `type` is SQLite's declared type or `null` for expressions. Row-returning is decided from that metadata, so `SELECT`, `RETURNING`, and `PRAGMA` all come back as rows.
- SQL text is capped at 1 MB, and a batch accepts at most 100 statements.
- For bodyless POST endpoints (e.g. `/queue/dequeue` with defaults), either send no `Content-Type: application/json` header, or send an empty JSON object `{}` — Fastify rejects a declared-but-empty JSON body with 400. `/queue/size` is a `GET` route so it needs no body at all.
- `/db/query` executes exactly one statement; a second statement in the same payload is rejected with 400 rather than silently truncated. Use `/db/batch` for multi-statement work. Note this also rules out `CREATE TRIGGER … BEGIN … END` over HTTP (its internal semicolons are rejected too).
- Bad SQL, binding errors, and constraint violations come back as `400` with SQLite's message, not `500`.
- KV has **no default TTL** — entries live until deleted, though a per-entry `ttl` is still honored. The cache defaults to 5 minutes and per-entry `ttl` overrides it.
- `BEGIN`/`COMMIT`/`ROLLBACK`/`SAVEPOINT`/`RELEASE` are rejected everywhere except inside `/db/batch`, which owns the transaction lifecycle — this keeps the shared connection out of client-managed transactions. Use `/db/batch` for multi-statement work.
- Queue semantics are SQS-lite: `dequeue` leases messages for `visibilityMs`, `ack` deletes leased messages, `nack` makes them visible again; an expired lease automatically becomes claimable. Payloads are stored as JSON text and parsed on delivery.

## Examples

Create a table, insert a row, and read it back:

```bash
AUTH=(-H 'auth-username: admin' -H 'auth-password: secret')

# DDL — returned as a mutation
curl -s http://localhost:3000/db/query \
  -H 'content-type: application/json' "${AUTH[@]}" \
  -d '{"sql":"CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL)"}'

# INSERT with a positional parameter
curl -s http://localhost:3000/db/query \
  -H 'content-type: application/json' "${AUTH[@]}" \
  -d '{"sql":"INSERT INTO notes (body) VALUES (?)","params":["hello"]}'
# => {"sql":"INSERT INTO notes (body) VALUES (?)","changes":1,"lastInsertRowid":1}

# SELECT — rows are objects keyed by column name
curl -s http://localhost:3000/db/query \
  -H 'content-type: application/json' "${AUTH[@]}" \
  -d '{"sql":"SELECT id, body FROM notes ORDER BY id"}'
# => {"sql":"SELECT id, body FROM notes ORDER BY id",
#     "columns":[{"name":"id","type":"INTEGER"},{"name":"body","type":"TEXT"}],
#     "rows":[{"id":1,"body":"hello"}],"rowCount":1}
```

Key/value round-trip:

```bash
curl -s http://localhost:3000/kv/set \
  -H 'content-type: application/json' "${AUTH[@]}" \
  -d '{"key":"greeting","value":{"text":"hi"}}'

curl -s http://localhost:3000/kv/get \
  -H 'content-type: application/json' "${AUTH[@]}" \
  -d '{"key":"greeting"}'
# => {"values":[{"text":"hi"}]}
```

Atomic batch — the second statement fails, so the first is rolled back:

```bash
curl -s http://localhost:3000/db/batch \
  -H 'content-type: application/json' "${AUTH[@]}" \
  -d '{"statements":[
        {"sql":"INSERT INTO notes (body) VALUES (?)","params":["draft"]},
        {"sql":"INSERT INTO notes (id, body) VALUES (?, ?)","params":[1,"duplicate id"]}
      ]}'
# => 400, and no row was inserted
```

Queue lifecycle:

```bash
# enqueue one message with any JSON payload
curl -s http://localhost:3000/queue/enqueue \
  -H 'content-type: application/json' "${AUTH[@]}" \
  -d '{"jobs":[{"payload":{"job":"resize","id":42}}]}'
# => {"ids":[1]}

# lease up to one message for 30 seconds (omit the body for defaults)
curl -s http://localhost:3000/queue/dequeue \
  -H 'content-type: application/json' "${AUTH[@]}" -d '{}'
# => {"jobs":[{"id":1,"payload":{"job":"resize","id":42}}]}

curl -s http://localhost:3000/queue/ack \
  -H 'content-type: application/json' "${AUTH[@]}" \
  -d '{"ids":[1]}'
# => {"acked":1}
```

## Security notes

Running arbitrary SQL is the entire point, so the credential check **is** the access-control layer. Read these before exposing the service anywhere.

- **Always run behind auth and TLS.** An open instance is a remote shell for your data directory: any client can `DROP TABLE`, read every row, and write to the database file.
- **`SQLITE_READ_ONLY=true`** is the right posture for public read-only exposure — writes are rejected by SQLite itself, not just by convention.
- **`ATTACH`/`DETACH` are denied by design** through SQLite's authorizer callback. The server owns exactly one database; allowing `ATTACH` would let a client read arbitrary files on the host.
- **The server is fully synchronous.** `node:sqlite` blocks the event loop, so one heavy query stalls every other request — including `/health`. Keep queries lean and indexed, and avoid unbounded `SELECT *` over large tables. There are no per-query timeouts or cost limits.
- **Integer range is limited to ±2^53.** JSON has no bigint type and `readBigInts` is off; on reads, SQLite integers beyond ±2^53 are rejected by `node:sqlite` (surfaced as a 400). The service also converts `changes`/`lastInsertRowid` with `Number()`, which silently rounds beyond 2^53. Keep ids and counters within ±2^53 or store them as `TEXT`.
- **No BLOB binding over JSON.** `params` accepts strings, numbers, booleans, and null. BLOB *values read back* arrive as JSON objects with numeric byte keys (e.g. `{"0": 255, …}`) — store binary data as base64 text in a column or in KV instead.

## Development

```bash
npm run test          # unit specs (vitest)
npm run test:e2e      # e2e specs (vitest, vitest.config.e2e.ts)
npm run test:cov      # unit tests + v8 coverage, enforced at 100% (src/**/*.ts)
npm run test:memory   # heap-regression loops in forks with --expose-gc (no coverage)
npm run lint          # oxlint
npm run format        # prettier, rewrites src/, test/ and bench/
npm run build         # nest build -> dist/
npm run bench         # storage-path benchmarks (vitest bench, advisory numbers)
npm run typecheck:bench # typecheck src/, test/ and bench/ (bench/ escapes nest build)
```

The repo uses **vitest**, not jest, and **oxlint**, not eslint. There is no separate typecheck script for `src/`; `npm run build` (or `npx tsc --noEmit`) is the typecheck — `npm run typecheck:bench` covers `src/`, `test/` and `bench/` together. Unit-test coverage is scoped to `src/**/*.ts` and gated at **100%** (statements/branches/functions/lines) by `vitest.config.ts` thresholds; `npm run test:cov` fails otherwise.

## Benchmarks and memory tests

`npm run bench` prints throughput and latency percentiles for the storage paths (`/db` query and batch, `/kv` and `/cache` get/set in 1–900-key batches straddling Keyv's 998-parameter `IN (…)` cap, `/queue` enqueue / claim / ack / size). Numbers are **advisory and machine-local**: vitest 4's bench mode has no assertion support, and `npm run bench:compare` against a `bench/baseline.json` (which you would generate with `npm run bench -- --outputJson` locally) only annotates the table — it never fails. Baselines are gitignored on purpose; don't commit one. Set `BENCH_DB_PATH=/tmp/bench.sqlite` to measure the WAL file path instead of `:memory:`.

`npm run test:memory` runs the heap-regression loops (`test/memory/`): 10k KV get/set cycles, 5k queue enqueue → dequeue → ack cycles, and the `Database.new` memoization contract. It runs in a dedicated single-fork config (`vitest.config.memory.ts`) with `--expose-gc`, asserts on `heapUsed` deltas only (RSS includes node:sqlite's native buffers and is not a leak signal), and is deliberately **outside** the 100% coverage gate. Profile artifacts (`*.cpuprofile`, `*.heapprofile`, `*.heapsnapshot`) are gitignored; generate them on demand with `npm run test:profile`. Everything bench-related is opt-in — the CI gate (`lint → test:cov → e2e → build`) is unchanged.

Project layout:

```
src/
  main.ts                 bootstrap: Fastify adapter, security headers, CSRF, Swagger at /api
  app.module.ts           feature modules + global AuthInterceptor + StandardSchemaValidationPipe
  environment.ts          zod-parsed env, creates database/ directories on import
  auth.interceptor.ts     header auth, /health exemption, constant-time compare
  database.ts             DatabaseSync wrapper: WAL, busy timeout, ATTACH guard, extension loading
  kv.ts                   shared Keyv-over-SQLite factory for kv and cache
  health.controller.ts    GET /health
  resources/<feature>/    <feature>.module.ts | .controller.ts | .service.ts (+ schemas, .spec.ts)
  resources/keyv.schema.ts    shared zod payloads for kv and cache
bench/
  *.bench.ts              vitest bench storage-path benchmarks (not run by tests, not covered)
test/
  *.e2e-spec.ts           e2e suite (vitest.config.e2e.ts)
  memory/*.memory.test.ts heap-regression loops (vitest.config.memory.ts, --expose-gc)
  helpers/measureHeap.ts  warmup/measure helper shared by the memory suite
```

Current features: `db` (SQL), `kv`, `cache`, `queue`. New features follow the same `src/resources/<feature>/` layout and are registered in `src/app.module.ts`.

Because the project is ESM (`"type": "module"`, `nodenext`), relative imports must carry the `.js` suffix — `./app.module.js`, even from a `.ts` file. Types used on decorated method parameters need `import type` (TS1272 with `isolatedModules` + `emitDecoratorMetadata`).

## Limitations / non-goals

- **No replication or clustering.** One process, one writer, local files. Use Litestream-style file backup if you need durability beyond WAL.
- **One statement per `/db/query`.** Multi-statement scripts go through `/db/batch`, which wraps them in a single `BEGIN IMMEDIATE` transaction.
- **No named parameters.** Only positional `?` binding is supported.
- **One SQL database per process.** `SQLITE_DATABASE_PATH` defines it; KV, cache, and queue each live in separate files and cannot be joined against it in SQL.
- **No query cancellation, timeouts, or rate limiting.** Put a proxy in front if you need those.
- No roles or per-database permissions — a single credential pair grants full access.
- No migration framework or schema versioning: the database starts empty and you own the schema.
