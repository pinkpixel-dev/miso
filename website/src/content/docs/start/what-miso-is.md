---
title: What Miso is
description: A local music generation and remix studio built on audio.cpp, and what makes it different from the other interfaces on the same runtime.
sidebar:
  order: 1
---

Miso is a local music generation and remix studio. You bring a prompt or a song, and Miso gives you a workspace for generating, remixing, splitting, and finishing music with models that run on your own machine. Nothing is sent anywhere.

The models themselves come from [audio.cpp](https://github.com/0xShug0/audio.cpp), a C++ inference runtime for audio. Miso is the studio around it: projects that persist, a history of every take, and a record of exactly how each clip was made so you can change one thing and try again.

## Why it exists

There are other interfaces for audio.cpp, including one built into the server itself. They are all one-shot: fill in a form, get a file, lose it when you close the tab. None of them goes deep on music.

Miso is project-shaped instead. It keeps your work, tracks how each clip came to be, and lets you feed one result into the next step. The feature it is built around is ACE-Step's repaint, which replaces a time span inside a track that you select. Pick the middle eight bars on a waveform, ask for something brighter, and hear it replaced. No other interface on this runtime exposes that as a timeline edit.

## What it can do

Fourteen tasks, spread across three screens inside a project.

**Write something new.** Five generators, one per model family. ACE-Step for full songs from a guided prompt builder, YuE2 for 48 kHz stereo songs that come with the score they planned, MiniMax Music 3 for structured lyrics, HeartMuLa for tag-driven songs, and Stable Audio 3 for instrumentals. There is also a sound effect generator and a task that sings written lyrics in a voice you pick.

**Change something you have.** Repaint a section, cover a whole take in a new style, split a song into stems you can mix and export, and sing a vocal stem again in a packaged voice or in the voice of any other track in the project.

**Finish it.** Transcribe a take to MIDI, hold any two takes against each other, convert and trim and fade and level audio in the browser, and export as WAV or MP3.

## What it does not do

Miso does not run models itself. It talks to an audio.cpp server, which can be the container beside it or a machine on your network. If that server is down, generation stops and everything else keeps working.

Miso also does not write lyrics on its own. That needs a language model, which you point it at in Settings. See [The lyrics assistant](/guides/lyrics-assistant/).

## Hardware honesty

This has been run on one machine, a laptop with a 16 GB RTX 4090. Other cards and other drivers are untested. If something breaks on yours, [open an issue](https://github.com/pinkpixel-dev/miso/issues).

Miso runs without a GPU on the `full-cpu` image. Generation then takes minutes per take instead of seconds, so it is a way to look around rather than a way to work.

## Where to go next

- [Requirements](/start/requirements/) covers what the machine needs before you start.
- [Install](/start/install/) is the two-container Docker setup.
- [Architecture](/reference/architecture/) explains the three processes and why the client never talks to audio.cpp directly.
