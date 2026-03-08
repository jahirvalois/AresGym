# Deployment

Purpose: checklist and notes for deploying the app and required DB indexes so server-side sort/pagination works for `/api/logs`.

## Required environment variables

- `MONGODB_URI`: connection string to the Cosmos DB (Mongo API) or MongoDB server.

## Indexes

The application expects DB-side ORDER BY on `date` for the `logs` collection. If that path is not indexed in Cosmos (Mongo API), queries that use server-side sorting/pagination will fail with errors like:

`The index path corresponding to the specified order-by item is excluded.`

Create the following indexes (descending where noted):

- `logs.date` : descending (`{ date: -1 }`) — required for `/api/logs` DB-side sort.
- `audit.timestamp` : descending (`{ timestamp: -1 }`) — helper script exists.
- `routines.createdAt` : descending (`{ createdAt: -1 }`) — helper script exists.

## Provided helper scripts

The repository includes scripts to create the indexes using the MongoDB driver (works against Cosmos DB when using the Mongo API):

- `scripts/create_logs_index.mjs` — creates descending index on `logs.date`.
- `scripts/create_audit_index.mjs` — creates descending index on `audit.timestamp`.
- `scripts/create_routines_index.mjs` — creates descending index on `routines.createdAt`.

To run locally or during deployment (ensure `MONGODB_URI` is set):

```bash
node scripts/create_logs_index.mjs
node scripts/create_audit_index.mjs
node scripts/create_routines_index.mjs
```

## Verification

- Confirm the indexes exist:

```js
// connect with mongo shell or driver
db.logs.getIndexes()
```

- Call the `/api/logs` endpoint and confirm no "index path excluded" errors appear in the function logs. The server should use DB-side sorting (faster) instead of falling back to in-memory processing.

## CI / Deployment notes

- For deterministic deployments, run the index scripts as a post-deploy step in your pipeline (or include them in infrastructure automation). Index creation is idempotent.
- If using Azure Cosmos DB with the Mongo API, ensure the account's indexing policy does not explicitly exclude the `date` path for the `logs` collection.

## Troubleshooting

- If you still see the error after creating the index, check the Cosmos DB indexing policy for exclusions and the exact field path name (e.g. `date` vs nested `metadata.date`).

## Files

- `scripts/create_logs_index.mjs` — creates `logs.date` index
- `scripts/create_audit_index.mjs` — creates `audit.timestamp` index
- `scripts/create_routines_index.mjs` — creates `routines.createdAt` index
