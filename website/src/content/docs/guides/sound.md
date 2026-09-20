---
title: Sound effects and MIDI
description: The two tools on the sound page. Generate a short effect from a description, or read the notes out of a take.
sidebar:
  order: 10
---

Two tools live on the sound page, at **Sound** in the row at the top of a project. Neither makes a song, which is why they are not on the create form or the remix picker.

## Sound effects

**Make a sound effect** writes a short sound from a description of what happens. It runs on Stable Audio 3, using that model's sound effect packages rather than its music ones.

Describe the event rather than the music. "Heavy wooden door closing in a stone hallway" works better than a genre and a mood.

The result is saved into the project as an ordinary take, so you can play it, export it, or use it anywhere else.

Stable Audio ships its sound effect packages in the same spec as its music ones, so Miso splits them into two cards on the Models screen. Installing the music model does not give you the effects model.

## Transcribing to MIDI

**Transcribe to MIDI** reads the notes out of a take and writes a MIDI file. It runs on MuScriptor.

This is the one task in Miso that produces no audio at all. It answers with note events and a standard MIDI file, which is why a transcription is not a take:

- It cannot be played by the dock
- It cannot be drawn as a waveform
- It cannot be exported as WAV or MP3
- It cannot be separated or mixed

It lives under the take it was read from, with a preview that plays from the stored note list, and a download for the `.mid` file.

### Turning a transcription into a score

A transcription can become an ABC score that YuE2 will sing. That is the most useful thing to do with one inside Miso. See [Scores with YuE2](/guides/scores/).

### One quirk worth knowing

MuScriptor drops a note that starts at exactly zero seconds. Miso puts a second of silence in front of the audio before sending it, then takes that offset back off the note times when it stores the result.

You will not see this happen. It is here because a transcription that mysteriously loses its first note is otherwise hard to explain.

## What works best

Transcription is cleanest on a single instrument. Run it on a separated bass or vocal stem rather than on a full mix. See [Splitting into stems](/guides/stems/).
