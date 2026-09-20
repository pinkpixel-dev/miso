---
title: Importing audio
description: Bring your own audio into a project, what formats Miso accepts, and why it offers to convert to WAV.
sidebar:
  order: 2
---

Inside a project, use the audio file block above the song list. Drop a file onto it, or press **Choose an audio file**.

Miso accepts wav, flac, mp3, and m4a, up to 200 MB. The upload shows a progress bar, then your browser works out the waveform and sends it up. The waveform appears a moment after the upload finishes.

## The conversion prompt

If what you dropped is not already a WAV, Miso asks whether to convert it first.

It is worth saying yes in most cases. Miso reads WAV on its own, and everything that works on a whole song needs one: splitting into stems, converting a voice, and mixing stems back together.

Converting only changes the container. The file gets bigger and does not sound any different.

You can always import the file untouched instead and convert it later in [Audio tools](/guides/audio-tools/).

## Format is read, not guessed

Format is decided by reading the file, not by its extension. A text file renamed to `.wav` is rejected, and the message says what Miso actually found.

## Sample rates

This is the one thing worth knowing before you import a batch of mp3s.

Stem separation refuses anything that is not 44.1 kHz. An mp3 you imported at some other rate will not split. [Audio tools](/guides/audio-tools/) is how you fix that: drop the file in, pick 44.1 kHz, and save it into the project.

For reference:

| Rate | Where it comes from |
|---|---|
| 44.1 kHz | What separation and voice conversion need |
| 48 kHz | What generation writes |
| 24 kHz | What Vevo2 answers at, on every route |
| 40 kHz | What RVC answers at, whatever it is given |

Miso converts between these on its own where a task declares what it needs. Separation is the case where you have to think about it, because the source is a file you brought.

## Where the file goes

Uploaded audio lands in the project's asset directory under `MISO_DATA_DIR`, and the database keeps the row. Nothing about an import touches audio.cpp. See [Storage and disk](/reference/storage/).
