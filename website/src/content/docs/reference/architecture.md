---
title: Architecture
description: Three processes, the rule that keeps them apart, and why that rule is what makes a remote backend work.
sidebar:
  order: 5
---

Three processes, and only one of them is Miso's own.

**audio.cpp server.** Runs the models. Its own container in the stack.

**Miso service.** Node and Hono, with SQLite for projects and a directory for audio. It owns the job queue, model residency, and every large payload. It also serves the client in production.

**Miso client.** React and Vite. It talks only to the Miso service, never to audio.cpp directly.

## The boundary rule

That last sentence is the whole design. The client never calls audio.cpp.

Two things follow from it.

A [remote backend](/reference/remote-backend/) works, because the browser never needs to reach the machine holding the GPU. Only the service does.

Stem separation responses, which can run to hundreds of megabytes, stay out of the browser.

## What keeps working when audio.cpp is down

Projects, imports, playback, and export never touch audio.cpp. All of it works with the server stopped.

Only the Models screen and generation degrade, and the Models screen still describes every model when it cannot reach the backend. Sizes, the installed flag, and the buttons are what go away.

The lyrics routes do not talk to audio.cpp either. The assistant reaches a language model somewhere else, so it works while the music backend is down and stops working when its own provider is.

## How the catalog is built

Three sources join into one catalog.

**Vendored specs** decide what exists. They are copied from audio.cpp at a pinned commit and live in the Miso repository. Anything the backend reports that Miso did not vendor is dropped, which keeps speech models off a music catalog screen.

**Live status** supplies sizes and the installed flag, read from audio.cpp. That scan takes a while on a cold server, so a completed result is cached for 30 seconds and nothing is cached while a scan is still running. Every action clears the cache, and so does the install poller when a download reaches a terminal state.

**Install rows** are Miso's own record of what it asked for. audio.cpp forgets queued installs when it restarts and reports no error, so Miso cannot rely on the server to remember.

The catalog carries a `live` field of `ready`, `scanning` or `unavailable`, so the screen can say which.

## Where the install poller runs

In the service, not the browser. A three gigabyte download outlives any tab, and ten open tabs still produce one poll loop.

The poller reads every running row, asks audio.cpp for each job's status, and stops itself once no row is running.

A failed job is checked before a finished one, because audio.cpp marks a failure as finished too. A job the server no longer knows about becomes interrupted rather than gone. An unreachable backend changes nothing, because the download may still be running.

## How a generation runs

1. The job is written to the queue and the worker is woken.
2. The worker stages any input takes to the backend, converting the sample rate first if the task declares one.
3. It works out which runtime task kind to register the model under, then loads it.
4. It builds the request from the task's fields and the staged paths.
5. It stores the result: one output is a take, several are stems, and a task that declares `produces: 'artifact'` takes a different path entirely.

A job whose backend restarted mid-run loses its staged upload. Miso re-uploads and retries once on its own.

## Re-vendoring the specs

```bash
npm run vendor:specs
```

Copies the model specs from audio.cpp at a pinned commit and records a hash for each. The pin is what stops the catalog changing under you when upstream moves.
