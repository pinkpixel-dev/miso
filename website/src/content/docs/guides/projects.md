---
title: Projects and takes
description: How Miso organises work, what a take is, and what keeps working when the audio.cpp server is down.
sidebar:
  order: 1
---

A project holds songs and the jobs that made them. The Library screen lists every project you have, and opening one puts you in the studio.

## Takes

Every piece of audio in a project is a take. A take is either something you imported or something a model produced, and Miso keeps the difference visible.

Click a track name to open its details over the song list. A generated take shows the exact prompt and lyrics that made it. Imported audio says plainly that it has no generation history.

Each take can be renamed, exported, or deleted. See [Exporting](/guides/exporting/).

## The song list and the queue

Songs and queue jobs have separate scroll areas on desktop, so one long list does not bury the other. Queue jobs stay in one list instead of folding older entries behind an expander.

A finished job can be dismissed from the queue. The row stays in the database, so dismissing hides it rather than deleting it.

A job that has not started yet can be cancelled. Once it has started, cancelling is refused.

## Playback

Press **Play** on a track to load it into the player at the bottom of the screen. Click anywhere along the waveform to seek, and playback continues from there.

A track with no waveform still plays normally. Press **Draw waveform** on the player and the browser you are on will work it out and save it for every other device.

The player also has a compare switch. There, the second take is the one the current take was made from, inside the open project. For holding any two takes against each other, including across projects, use the [Compare screen](/guides/compare/).

## Stems

A separation job produces stems rather than takes, and they are filed together under the job that made them. A voice conversion result lands beside the stems it was converted from rather than in the song list. See [Splitting into stems](/guides/stems/).

## What works with the backend down

Projects, imports, playback, and export never call audio.cpp. All of it works with the server stopped.

Only the Models screen and generation degrade. That split is deliberate, and it is why the client talks to the Miso service and never to audio.cpp directly. See [Architecture](/reference/architecture/).

The lyrics assistant does not call audio.cpp either. It reaches a language model somewhere else, so it works while the music backend is down and stops working when its own provider is.
