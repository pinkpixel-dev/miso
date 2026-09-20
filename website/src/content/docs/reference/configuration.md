---
title: Configuration
description: Every environment variable Miso reads, and the settings that live in the database instead.
sidebar:
  order: 1
---

## Environment variables

| Variable | Default | Does |
|---|---|---|
| `MISO_PORT` | `5171` | Port the Miso service listens on |
| `MISO_HOST` | `127.0.0.1`, and `0.0.0.0` in the container | Interface it binds to |
| `MISO_DATA_DIR` | `./data`, and `/data` in the container | Where the database and audio assets live |
| `MISO_BACKEND_URL` | `http://127.0.0.1:8080` | audio.cpp address, used only before Settings has one |
| `MISO_MODELS_DIR` | the `models` volume | Compose only. A models directory on the host to use instead |
| `AUDIOCPP_TAG` | `full-cuda12` | Compose only. Which audio.cpp image to run |

## MISO_BACKEND_URL only seeds

This one catches people out.

`MISO_BACKEND_URL` seeds the backend address the first time Miso starts with an empty database. After that, the value in Settings wins.

Changing it on an existing volume does nothing. Change it in Settings instead.

## Settings that are not environment variables

The [lyrics assistant](/guides/lyrics-assistant/) is configured in Settings rather than through the environment, because it holds a secret.

Your API key is stored in Miso's database under `MISO_DATA_DIR` and is sent only to the endpoint you configured. It is never returned to the browser, so Settings tells you a key is stored but cannot show it back to you.

## Compose examples

Point at models you already have:

```bash
MISO_MODELS_DIR=/path/to/models docker compose up -d
```

Run a different audio.cpp build:

```bash
AUDIOCPP_TAG=full-cuda13 docker compose up -d
AUDIOCPP_TAG=full-cpu docker compose up -d
```

Run Miso alone against a backend elsewhere:

```bash
MISO_BACKEND_URL=http://gpu-box.local:8080 docker compose up -d miso
```

See [Remote backend](/reference/remote-backend/) for what that costs.
