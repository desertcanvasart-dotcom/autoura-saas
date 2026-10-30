# Publish site renderer

Every company's Publish website, served by hostname. A second Next.js app in
this repo (docs/publish/PLAN.md D1), deployed as the Railway service
`publish-sites`. It holds no database credentials: pages come from the
GetAutoura app's internal API (`lib/publish/contract.ts`).

| Piece | Where |
|---|---|
| Hostname → site → page rules | `lib/routing.ts` (pure, tested in `__tests__/routing.test.ts`) |
| The only data source | `lib/internal-api.ts` → `/api/publish/internal/{site,page}` |
| Every request | `proxy.ts` |
| Pages | `app/s/[tenant]/[site]/[mode]/[lang]/` (internal path; visitors never type it) |
| Sync worker → "these pages changed" | `app/api/revalidate/route.ts` |

## Working on it without a database

```bash
node scripts/publish-dev-api.mjs
PUBLISH_APP_URL=http://127.0.0.1:4010 PUBLISH_INTERNAL_SECRET=dev-internal npm run sites:dev
```

Then open http://sillage.localhost:3001 (browsers resolve `*.localhost`).
The fixture lives in `scripts/publish-dev-api.mjs`; keep it in step with the
contract. `.claude/launch.json` has the same as `publish-dev-api` + `sites`.

## Env (renderer service)

`PUBLISH_APP_URL`, `PUBLISH_INTERNAL_SECRET` (same value as on the web
service), `PUBLISH_REVALIDATE_SECRET` (same value as on the web service, where
the sync worker signs with it) and `_PREVIOUS` during a rotation.
