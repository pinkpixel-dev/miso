---
title: Install
description: Install Miso and audio.cpp together with Docker Compose, and check that the GPU actually came up.
sidebar:
  order: 3
---

Two containers, Miso and audio.cpp, started together by Docker Compose. Miso is the only one with a published port. audio.cpp stays on the internal network, which matters because its management interface asks nobody for a password.

## 1. Check the machine

```bash
git clone https://github.com/pinkpixel-dev/miso.git
cd miso
./scripts/preflight.sh
```

Fix any failure before you go on. [Requirements](/start/requirements/) explains what the last check is looking for and why it matters more than the others.

## 2. Start the stack

```bash
docker compose up -d
```

Open <http://127.0.0.1:5171>.

The first start pulls two images and takes a while. The audio.cpp image is several gigabytes on its own.

Miso ships no models, so the first screen tells you to download one and names which. That is [Installing models](/start/models/), and nothing can be generated until it finishes.

## 3. Confirm the GPU came up

```bash
docker compose ps
docker compose logs audiocpp
```

You want `ggml_cuda_init: found 1 CUDA devices` in the audio.cpp log, naming your card.

That line only appears once a model has actually loaded, so it will not be there until after your first generate. `"backend":"cuda"` on its own is the flag the server was asked for, not proof the device came up.

## Options

### You already have models on disk

Anyone who has run audio.cpp outside Docker has the weights already. Point the stack at them instead of downloading everything again:

```bash
MISO_MODELS_DIR=/path/to/models docker compose up -d
```

The directory must be writable by uid 1000, which is the user audio.cpp runs as. If Docker created it for you as root, installs fail with `could not create package staging directory`.

### A different audio.cpp image

```bash
AUDIOCPP_TAG=full-cuda13 docker compose up -d
AUDIOCPP_TAG=full-cpu docker compose up -d
```

### audio.cpp on another machine

Miso works with the backend on a different computer and never assumes a shared filesystem. See [Remote backend](/reference/remote-backend/).

## Coming back to it

You only do the setup once. After that it is one command each way.

```bash
docker compose up -d
docker compose down
```

`down` stops both containers and leaves your projects and models alone. They live in Docker volumes, not in the containers. The full list is in [Stack commands](/reference/commands/).

## Health check

Miso answers `GET /api/health` with its version and whether the database opened. Docker uses it for the container health check, and you can read it yourself:

```bash
curl http://127.0.0.1:5171/api/health
```

This route never probes audio.cpp, so a slow backend cannot get Miso restarted.
