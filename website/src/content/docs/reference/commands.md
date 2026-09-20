---
title: Stack commands
description: The Docker Compose and npm commands worth knowing.
sidebar:
  order: 2
---

## The stack

| Command | Does |
|---|---|
| `docker compose up -d` | Starts both containers |
| `docker compose down` | Stops and removes both, keeping the volumes |
| `docker compose ps` | Shows what is running and whether Miso is healthy |
| `docker compose logs -f audiocpp` | Follows the audio.cpp log, useful when a model fails to load |
| `docker compose logs -f miso` | Follows Miso's own log |
| `docker compose pull` | Fetches newer images |

## Starting over

```bash
docker compose down -v
```

That deletes both volumes, including every project and every downloaded model. It cannot be undone.

To remove a single model download instead, use the Models screen, which tells you how much it frees before you confirm.

## Health

```bash
curl http://127.0.0.1:5171/api/health
```

Answers with Miso's version and whether the database opened. It never probes audio.cpp, so a slow backend cannot get Miso restarted.

## From source

These need Node 22 or newer. See [Running from source](/reference/from-source/).

| Command | Does |
|---|---|
| `npm run dev` | Client on 5170 and service on 5171, both watching for changes |
| `npm run build` | Builds the client into `dist/client` |
| `npm start` | Production run, the whole app on 5171, needs a build first |
| `npm test` | Runs the test suite once |
| `npm run typecheck` | Type checks without emitting anything |
| `npm run vendor:specs` | Re-copies the vendored model specs from audio.cpp |

## Preflight

```bash
./scripts/preflight.sh
```

Six checks on the machine, the last of which is the one that matters. See [Requirements](/start/requirements/).
