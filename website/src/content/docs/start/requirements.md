---
title: Requirements
description: The hardware, drivers and disk space Miso needs before you install it.
sidebar:
  order: 2
---

## Hardware

**An NVIDIA GPU.** These are diffusion and transformer models. A 16 GB card runs everything comfortably in Q8 precision. Less than that limits which models you can load, and the [model pages](/models/choosing/) list the memory each one needs.

**Disk.** Models are large. ACE-Step is around 6 GB and MiniMax Music 3 is around 13 GB. A full set of everything Miso can use runs past 40 GB. Your own projects are small by comparison, usually around 1 GB for a working set of takes.

**Docker**, with the [NVIDIA container toolkit](https://github.com/NVIDIA/nvidia-container-toolkit) for GPU access.

**Node 22 or newer**, only if you want to run Miso from source. The Docker stack does not need it.

## Running without a GPU

The `full-cpu` image runs Miso end to end. Generation takes minutes per take instead of seconds.

```bash
AUDIOCPP_TAG=full-cpu docker compose up -d
```

This is useful for looking around and for testing the interface. It is not a way to work.

## Driver versions

The default image is `full-cuda12`, because CUDA 12 runs on older drivers. Three other tags exist:

| Tag | Use it when |
|---|---|
| `full-cuda12` | Default. Works on older NVIDIA drivers. |
| `full-cuda13` | Your driver is new enough. Same server, newer CUDA. |
| `full-vulkan` | Vulkan-capable card without CUDA. |
| `full-cpu` | No GPU, or you only want to look around. |

Set the tag with an environment variable:

```bash
AUDIOCPP_TAG=full-cuda13 docker compose up -d
```

## Docker Desktop on Linux

Docker Desktop on Linux runs in a virtual machine and cannot pass a GPU through, however the host is set up. If `docker context ls` shows `desktop-linux` as current, switch to the system daemon before you go any further:

```bash
docker context use default
```

## The check that matters most

A broken NVIDIA container setup does not announce itself. The container starts, `nvidia-smi` works inside it, and CUDA falls back to the processor. Generation still produces a song, just minutes later than it would on the card, and nothing in either log says why.

Run the preflight script before you install anything:

```bash
./scripts/preflight.sh
```

It checks six things. The last one compares the UVM device major number on the host with the one inside a container, which is where that difference shows up. It pulls a 5 MB busybox image to do it.

If a check fails, fix it before going on. The stack will start either way, which is the problem.
