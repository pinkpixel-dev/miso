---
title: Remote backend
description: Run Miso on one machine and audio.cpp on another, with no shared filesystem.
sidebar:
  order: 8
---

The normal installation keeps Miso and audio.cpp together on one GPU machine. Miso also works with audio.cpp on a different computer, and never assumes a shared filesystem.

Audio goes to the server over HTTP and results come back the same way.

## When this is useful

The GPU is in another computer, or in a GPU-capable NAS.

A CPU-only NAS is not a recommended inference host. It will work, in the sense that the `full-cpu` image works, but generation takes minutes per take.

## Setting it up

Run Miso on its own and give it the address:

```bash
MISO_BACKEND_URL=http://gpu-box.local:8080 docker compose up -d miso
```

Remember that `MISO_BACKEND_URL` only seeds the address into an empty database. On an existing install, change it in Settings instead. See [Configuration](/reference/configuration/).

## What it costs

Every source track crosses the network once per job.

A slow link shows up most on [stem separation](/guides/stems/) and [voice conversion](/guides/voices/), because those send a whole song each way. Generation from a prompt sends nothing but text.

Miso caches staged uploads by asset and backend, so running two jobs on the same source does not upload it twice. A source that had to be converted for its sample rate skips that cache in both directions, because the cache cannot tell a converted copy from the original.

## Why this works at all

The client never talks to audio.cpp. Only the Miso service does.

That is the rule the whole architecture is built on, and a remote backend is the clearest thing it buys. The browser only ever needs to reach Miso. See [Architecture](/reference/architecture/).

## Security

audio.cpp's management interface asks nobody for a password.

In the default stack this does not matter, because audio.cpp has no published port and nothing outside the compose network can reach it. Over a network it does matter. Do not expose an audio.cpp server to anything you do not control.
