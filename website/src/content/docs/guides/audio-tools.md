---
title: Audio tools
description: Convert, trim, split, fade and level audio in the browser without touching a model or the queue.
sidebar:
  order: 12
---

Press **Audio tools** in the row at the top of a project. This is the page for the boring but necessary stuff: converting a file, cutting off dead air, and fixing a track that is too quiet.

Nothing here uses a model and nothing goes into the queue. It all happens in your browser and finishes immediately. The only thing that reaches Miso is the file you save at the end, which lands as an ordinary take.

## The reason it exists

Stem separation refuses anything that is not 44.1 kHz, so an mp3 you imported will not split.

This page is how you fix that. Drop the mp3 in, pick 44.1 kHz, save it into the project, and separation will take the result.

## Working from a file or a take

You can open a file from your disk or a take already in the project.

A file you drop here is not uploaded until you choose to save it. You can convert something and throw it away without leaving anything behind.

## What you can do

**Convert** to 16-bit WAV at 44.1 kHz or 48 kHz. 44.1 is what separation and voice conversion need, 48 is what generation writes. Saving always writes WAV, because that is the format the rest of Miso can work with. MP3 is offered on [export](/guides/exporting/) instead.

**Trim** to a region. Drag on the waveform, or type the start and end in seconds.

**Split** at a point, which saves both halves as two takes.

**Fade in and out**, either a straight line or a curve.

**Gain** in decibels, and **normalize** to bring a quiet track up.

## Undo

Everything except split can be undone, and the page keeps a numbered list of what you have applied so far.

Split is the exception, because it writes two takes into the project straight away. The button says so before you press it.

## Two things it tells you

The page shows the real sample rate of whatever you opened, which is usually the thing you actually wanted to know.

It also warns you before a gain change would clip, rather than after you have saved a distorted file.
