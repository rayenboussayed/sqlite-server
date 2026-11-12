# AGENTS.md

sqlite-server: HTTP + JSON API that serves a centralized SQLite database (plus KV, cache, and a job queue) to remote clients — Turso/libSQL-style, self-hosted, built on `node:sqlite`. ESM + TypeScript + zod v4 + NestJS 12 (Fastify).

## Commands

- `npm install` (Node ≥ 24)
- `npm run build` — `nest build` → `dist/`; doubles as the typecheck
- `npm run start` / `npm run start:dev` / `npm run start:prod` (`node dist/main`)
- `npm run test` — vitest unit specs (`**/*.spec.ts`), globals on; `npx vitest run <path>` for a single file
- `npm run test:e2e` — vitest with `vitest.config.e2e.ts` (`**/*.e2e-spec.ts`)
- `npm run test:cov`, `npm run lint` (**oxlint**, not eslint), `npm run format` (prettier)
- Unit + e2e suites set `SQLITE_{DATABASE,CACHE,KV}_PATH` and `QUEUE_STORAGE_PATH` to `:memory:` (in the vitest configs) — tests never touch `./database/`. DB-backed services get fresh empty `:memory:` DBs per TestingModule; `Database.new(':memory:')` deliberately bypasses the path cache.

## Current state

Everything green (verified 2026-11-12): `npm run lint`, `npm run build`, 26 unit tests, 18 e2e tests. CI (`.github/workflows/ci.yml`, Node 24: lint → test → e2e → build) runs on push/PR to `main`.

## Layout

- `src/main.ts` — bootstrap: FastifyAdapter, security headers + CSRF, Swagger at `/api` (public), listens on `environment.PORT` (default 3000). Imports `zod/compile`; plugs `zod-openapi`'s `standardSchemaConverter` into Swagger docs.
- `src/app.module.ts` — wires feature modules + `HealthController` + global `AuthInterceptor` + global `StandardSchemaValidationPipe` (APP_PIPE — this is what validates and transforms `@Body({ schema })` payloads; without it they are inert).
- `src/resources/<feature>/` — `<feature>.module.ts|controller.ts|service.ts|spec.ts`. Features: `db` (arbitrary SQL), `kv` (no default TTL), `cache` (5-min default TTL), `queue` (SQS-lite: enqueue/dequeue/ack/nack/size). Shared by kv+cache: `src/resources/keyv.schema.ts` (zod schemas) only. Nest controllers are thin; all logic lives in services (sync, `node:sqlite`).
- `src/database.ts` — `Database extends DatabaseSync`: `timeout: 5000`, WAL (writable file DBs), read-only only when `SQLITE_READ_ONLY=true` **and** the path is `SQLITE_DATABASE_PATH` (queue stays writable), optional `DATABASE_EXTENSIONS` (`vector`), and a `setAuthorizer` that always denies `ATTACH`/`DETACH` and denies `SQLITE_TRANSACTION` unless the caller wraps work in `database.withTransactionControl(fn)` (used by `/db/batch` and the queue for their own transaction lifecycle). `Database.new(path?)` memoizes per path.
- `src/kv.ts` — `createSqliteKeyv({ uri, ttl })` factory (Keyv v6 + `@keyv/sqlite`, which auto-prefers `node:sqlite`; `better-sqlite3` ships as its dependency but is never used at runtime).
- `src/environment.ts` — zod-parses `process.env` at import; auto-`mkdir`s parent dirs of the four paths (skipped for `:memory:`). Defaults: `SQLITE_DATABASE_PATH`, `SQLITE_CACHE_PATH`, `SQLITE_KV_PATH`, `QUEUE_STORAGE_PATH` → `<cwd>/database/*.sqlite`. Also `SQLITE_READ_ONLY`, `DATABASE_EXTENSIONS` (comma-separated), `AUTH_USERNAME`, `AUTH_PASSWORD`, `PORT`.
- `src/auth.interceptor.ts` — global header auth: `auth-username`/`auth-password` vs env; only `/health` (and `/api`, served by main.ts) is public; comparisons are constant-time (`sha512` + `timingSafeEqual`); auth is off only when BOTH env vars are unset — one set fails closed (all 401).
- `src/health.controller.ts` — `GET /health` → `{ status: 'ok' }`.
- `src/constant.ts`, `src/utils.ts` — auth header names; `sha512` (used by auth) and `createArraySchema` (singleton-or-array kv/cache payloads).

## Gotchas

- ESM + `nodenext`: relative imports **must** use the `.js` suffix.
- `isolatedModules` + `emitDecoratorMetadata` (TS1272): types on decorated parameters must be `import type`; schemas are value imports.
- `@Body({ schema })` only works because of the APP_PIPE `StandardSchemaValidationPipe` — do not remove it. Input validation resolves through zod v4 (StandardSchema); `createArraySchema` accepts singleton-or-array payloads.
- kw/KV batch payloads accept one object or an array; results align with input order (`undefined` → `null` on the wire).
- Multi-statement SQL is rejected with 400 (`stripLiteralsAndComments` in `db.service.ts`) — `/db/batch` is the only multi-statement path. `CREATE TRIGGER … BEGIN … END` is unsupported for the same reason.
- Transaction control (`BEGIN`/`COMMIT`/`SAVEPOINT`/`RELEASE`/`ROLLBACK`) reaches SQLite only inside `withTransactionControl(fn)` — never via `exec()` or `prepare()` directly; the authorizer denies otherwise (this is a security boundary, not a style choice). Do not add code paths that flip `allowTransactionControl` outside batch/queue.
- `columns().length === 0` decides row-returning vs mutation in `/db/query` — do not switch on SQL keywords.
- All POST handlers return `200` (`@HttpCode(HttpStatus.OK)`), not 201.
- `/queue/size` is a `GET` route — Fastify rejects empty bodies with `Content-Type: application/json`, which made the previous POST route unusable bodyless.
- Rows from `node:sqlite` are null-prototype objects; BLOB reads come back as JSON objects with numeric byte keys; integers beyond ±2^53 make `node:sqlite` throw (surfaced as 400).
- New feature? Follow `src/resources/<feature>/`, register the module in `src/app.module.ts`, keep handlers thin, add `:memory:` tests next to the service.
- CI runs `npm ci`, lint, unit, e2e, build on Node 24; `engines` in package.json is `>=24` — do not lower it.
