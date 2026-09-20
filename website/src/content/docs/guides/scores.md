---
title: Scores with YuE2
description: YuE2 plans a song before it writes one. Get that score back, edit it, and hand it to the next generation.
sidebar:
  order: 7
---

YuE2 plans a song before it writes one. With planning on, it writes an ABC score first, then turns that into audio, and hands both back.

That score is the interesting part. You can download it, edit it, and give it to the next generation so the same tune is arranged a different way.

## Planning modes

The **cot** setting on the YuE2 form controls this.

| Mode | What it does |
|---|---|
| Full | Plans melody and chords |
| Melody | Plans melody only. What upstream recommends for covers |
| None | Skips planning |

Choose **Melody** for a cover. That is what the YuE2 model card recommends, and its own melody scores carry no chord symbols anyway.

## Getting a score back

With planning on, the finished take gets a **Save ABC** download beside it.

A take built from a score you supplied has no score of its own to download. YuE2 skipped the planning stage because you did the planning, so there is nothing for it to hand back.

## Giving YuE2 a score

The **Score** box on the YuE2 form is where you hand it a tune instead of letting it invent one. Three ways to fill it:

- Paste the ABC directly
- Load an `.abc` file
- Pick a score this project already made

The third is the quickest route. Generate a song, then hand its own score back with a different style, and hear the same tune arranged another way.

Anything you load can be edited in the box before you send it.

## Four things that will catch you out

**The song lasts as long as the score.** Bring the whole tune. A four bar melody gives you about sixteen seconds of song, which looks like a bug and is not one.

**A score needs planning left on.** Miso refuses the combination of a score and `None` before the job queues, rather than after the weights have loaded.

**A supplied score means no score comes back.** See above.

**Two different scores at one seed give two different songs.** The score is read rather than counted. This was measured on 2026-09-20.

## From a transcription to a score

A [MIDI transcription](/guides/sound/) can become a score YuE2 will sing.

Miso turns note events into an ABC melody: the highest note wherever notes overlap, quantized to sixteenths against a tempo, barred, and tied across bar lines so every bar adds up.

MuScriptor supplies pitch and times in seconds and nothing else, so Miso works out the rest:

- **Tempo** from the typical gap between onsets
- **Key** from a duration-weighted pitch histogram
- **Meter** assumed to be 4/4

All three are shown in a dialog and can be changed, with the score redrawing as you change them. Check the tempo before you accept it. A tempo read at half speed still writes the right pitches and produces a cover that is hard to diagnose afterwards.
