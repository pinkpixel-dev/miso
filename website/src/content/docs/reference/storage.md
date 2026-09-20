---
title: Storage and disk
description: Where Miso puts things, how much space models take, and how to get it back.
sidebar:
  order: 4
---

Models are almost all of it. On a working machine the weights come to about 41 GB and a full set of projects is about 1 GB. If you are looking for space, look at the models first.

## The two volumes

| Volume | Holds |
|---|---|
| `miso_miso-data` | The database, your projects, and every take |
| `miso_models` | Downloaded model weights |

`docker compose down` leaves both alone. They live in Docker volumes, not in the containers.

## Seeing what is used

Settings has a Storage section showing both: what each project is using, and what the installed weights come to.

The Models screen tells you how much removing a model frees before you confirm.

## Model sizes

Rough figures, for planning:

| Model | Download |
|---|---|
| ACE-Step 1.5 Turbo Q8 | About 6 GB |
| MiniMax Music 3 | About 13 GB |
| Everything Miso can use | Past 40 GB |

## Using models you already have

Anyone who has run audio.cpp outside Docker has the weights already:

```bash
MISO_MODELS_DIR=/path/to/models docker compose up -d
```

The directory must be writable by uid 1000, which is the user audio.cpp runs as. If Docker created it for you as root, installs fail with `could not create package staging directory`.

## Partial downloads

A download that stops before it finishes leaves a staging directory in the models folder, named after the package with a random suffix.

Miso can find and clean these up from the Models screen.

## Starting completely over

```bash
docker compose down -v
```

Deletes both volumes, every project and every model. It cannot be undone.

## Where audio lives inside the data volume

The database keeps rows. The audio files themselves sit in a per-project directory under `MISO_DATA_DIR`.

Two things a finished job can leave behind, other than audio:

- **Scores**, from YuE2 with planning on, stored in a column rather than on disk and served as `text/vnd.abc`
- **MIDI artifacts**, from transcription, stored with their note list beside them as JSON

Neither is an asset, so neither appears in the song list or counts toward a project's audio.
