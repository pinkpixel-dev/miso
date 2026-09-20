---
title: HTTP API
description: The routes the Miso service answers, for anyone scripting against it or working on the client.
sidebar:
  order: 6
---

The Miso service answers these routes. The client uses nothing else, so this is the complete surface.

This is not a public API with a stability promise. It is documented because it is useful when scripting against your own instance.

## Health and settings

| Method | Path | Answers |
|---|---|---|
| `GET` | `/api/health` | Version and whether the database opened, or 503 with a detail. Never probes audio.cpp |
| `GET` | `/api/settings` | Settings |
| `PUT` | `/api/settings` | Settings |
| `GET` | `/api/backend/status` | Backend status. Takes an optional `?url=` to test an address before saving |
| `POST` | `/api/backend/unload` | Frees every model on the backend |

## Catalog

| Method | Path | Answers |
|---|---|---|
| `GET` | `/api/catalog` | The merged catalog |
| `POST` | `/api/catalog/packages/:id/install` | Catalog |
| `POST` | `/api/catalog/packages/:id/install/stop` | Catalog |
| `DELETE` | `/api/catalog/packages/:id` | Catalog |
| `POST` | `/api/catalog/partials/clean` | What was cleaned |

## Projects

| Method | Path | Answers |
|---|---|---|
| `GET` | `/api/projects` | Projects |
| `POST` | `/api/projects` | The new project |
| `GET` | `/api/projects/:id` | The project and its assets |
| `PATCH` | `/api/projects/:id` | The project |
| `DELETE` | `/api/projects/:id` | The projects that are left |
| `GET` | `/api/library` | Every take in every project, newest first, without peaks |
| `GET` | `/api/storage` | Storage usage |

`GET /api/library` is the one read that crosses projects. It selects columns by name so the peaks column is never read. Peaks are about 23 KB a row, the library draws no waveforms, and the whole list for 35 takes is 31 KB without them.

## Assets

| Method | Path | Answers |
|---|---|---|
| `POST` | `/api/projects/:id/assets` | The new asset. The raw file is the request body |
| `GET` | `/api/projects/:id/assets/:assetId` | One take whole, peaks included |
| `PATCH` | `/api/projects/:id/assets/:assetId` | The asset |
| `DELETE` | `/api/projects/:id/assets/:assetId` | The assets that are left |
| `GET` | `/api/projects/:id/assets/:assetId/audio` | The file, 200 or 206 by range |
| `GET` | `/api/projects/:id/assets/:assetId/download` | The file as an attachment |
| `PUT` | `/api/projects/:id/assets/:assetId/peaks` | The asset, with peaks the browser computed |
| `POST` | `/api/projects/:id/assets/:assetId/peaks/read` | The asset, with peaks read on the service, or 415 for a format it will not read |

## Jobs

| Method | Path | Answers |
|---|---|---|
| `GET` | `/api/tasks` | Every task this build can run |
| `GET` | `/api/projects/:id/jobs` | Jobs, newest first |
| `POST` | `/api/projects/:id/jobs` | The queued job, and the worker is woken |
| `DELETE` | `/api/projects/:id/jobs/:jobId` | The cancelled job, or 409 if it already started |
| `POST` | `/api/projects/:id/jobs/dismiss` | Every finished job hidden from the queue. The rows are kept |
| `GET` | `/api/projects/:id/jobs/:jobId/outputs.zip` | Every take one job produced, as a stored zip streamed from disk |
| `POST` | `/api/projects/:id/jobs/:jobId/mix` | A separation's stems summed into a new take, and whether it clipped |

## Lyrics and saved items

| Method | Path | Answers |
|---|---|---|
| `POST` | `/api/lyrics/write` | A lyric sheet and a title, or 409 if no engine is configured |
| `POST` | `/api/lyrics/enhance` | The expansion beside the prompt it came from |
| `GET` | `/api/saved` | Saved prompts. Takes an optional `?kind=prompt` or `?kind=lyrics` |
| `POST` | `/api/saved` | The saved item, replacing whatever was under that name |
| `DELETE` | `/api/saved/:id` | The items that are left |

## Scores and MIDI

Scores and MIDI artifacts are served separately from assets, because neither is one.

| Method | Path | Answers |
|---|---|---|
| `GET` | `/api/projects/:id/assets/:assetId/score` | The ABC score as `text/vnd.abc`, from the database column |
| `GET` | `/api/projects/:id/scores` | The project's scores, for the YuE2 score picker |
| `GET` | `/api/projects/:id/midi` | The project's MIDI artifacts |
| `GET` | `/api/projects/:id/midi/:midiId/download` | The `.mid` file |

There is no way to create or delete a score on its own. A score arrives with the take it planned and leaves with it, as a database cascade.
