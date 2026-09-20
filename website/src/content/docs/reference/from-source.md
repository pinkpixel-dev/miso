---
title: Running from source
description: For working on Miso itself. You still need an audio.cpp server running somewhere.
sidebar:
  order: 7
---

This is for working on Miso, not for using it. If you just want to make music, use [the Docker stack](/start/install/).

You need Node 22 or newer.

## You still need audio.cpp

Either leave the stack running and point Miso at it, or start a server yourself:

```bash
docker run -d --name miso-audiocpp --runtime=nvidia \
  -e NVIDIA_VISIBLE_DEVICES=all -e NVIDIA_DRIVER_CAPABILITIES=all \
  -v ./models:/app/models -p 8080:8080 \
  ghcr.io/0xshug0/audio.cpp:full-cuda12 \
  server --ui --ui-management --host 0.0.0.0 --port 8080 --backend cuda
```

Two parts of that command are not optional.

**Use `--runtime=nvidia`, not `--gpus all`.** With `--gpus all` the container starts and `nvidia-smi` works inside it, so everything looks correct, while CUDA silently fails and falls back to the processor. The cause is a device node major number mismatch, and nvidia-smi does not use UVM so it cannot see the problem.

**Keep `--ui-management`.** Without it Miso cannot browse or download models, upload audio, or load a model to run. It can only check that the server is alive.

## Then

```bash
npm install
npm run dev
```

The app is at <http://127.0.0.1:5170>.

Open Settings, confirm the server URL, and press **Test connection**.

## Do not run both at once

The stack and `npm run dev` both want port 5171. The second one to start cannot bind it.

## Commands

| Command | Does |
|---|---|
| `npm run dev` | Client on 5170 and service on 5171, both watching for changes |
| `npm run build` | Builds the client into `dist/client` |
| `npm start` | Production run, the whole app on 5171, needs a build first |
| `npm test` | Runs the test suite once |
| `npm run typecheck` | Type checks without emitting anything |
| `npm run vendor:specs` | Re-copies the vendored model specs from audio.cpp |

## Adding a model to an existing task

Adding a model to a task Miso already has is a data change rather than a new screen.

The task map lives in `src/server/tasks/registry.ts`, with one module per family beside it. A task names the families it runs on, the runtime task kind, whether the family can sing, the fields it takes, and the labels it is shown under.

A task added to the registry lands on the right page by itself. A task with no input roles goes to the create page, one with a `source` role goes to the remix picker, and a task that sets `surface` goes where it says. A test checks that every task lands on exactly one of the three.

## Where the notes are

Several documented ACE-Step routes do not do what their names say, and the evidence for each one sits in the family module beside the field it would otherwise be added back to.

Read those comments before changing a task's fields on the strength of the upstream manual.
