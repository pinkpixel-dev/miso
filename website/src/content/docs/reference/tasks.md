---
title: Task list
description: All fourteen tasks Miso can run, which model family each one needs, and which screen offers it.
sidebar:
  order: 3
---

Fourteen tasks. Each one names the model family it runs on and the screen it appears on.

## Generation

Tasks that make something from nothing. These appear on the create page.

| Task | Family | Does |
|---|---|---|
| `generate.text2music` | `ace_step` | Writes a new track from a prompt, with optional lyrics |
| `generate.minimax` | `minimax_music3` | Writes a track from a production caption and tagged lyrics |
| `generate.heartmula` | `heartmula` | Writes a track from lyrics and a list of style tags |
| `generate.yue2` | `yue2` | Writes a full song from lyrics and a style, and can hand back the score it planned. 48 kHz stereo |
| `generate.stableaudio` | `stable_audio` | Writes an instrumental track from a description of the sound |
| `generate.sing` | `vevo2` | Sings your words in the voice of a track you pick. 24 kHz out |

## Remix

Tasks that read an existing take. These appear on the remix page.

| Task | Family | Does |
|---|---|---|
| `remix.repaint` | `ace_step` | Replaces the part of a take you select, and leaves the rest alone |
| `remix.cover` | `ace_step` | Performs a take again in a style you describe, keeping its structure and length |
| `remix.covernofsq` | `ace_step` | The same idea, staying much closer to the original recording |
| `stems.separate` | `htdemucs`, `mel_band_roformer`, `bs_roformer` | Separates a take into vocals and backing, or into four parts |
| `voice.rvc` | `rvc` | Sings a vocal stem again in one of four packaged voices |
| `voice.vevo2` | `vevo2` | Sings a vocal stem again in the voice of any track you point it at. 24 kHz out |

## Sound

Two tasks that fit neither category. Neither makes a song, and one of them does not make audio.

| Task | Family | Does |
|---|---|---|
| `generate.sfx` | `stable_audio` | Writes a short sound from a description of what happens |
| `analyze.midi` | `muscriptor` | Reads the notes out of a take and writes a MIDI file |

## How a task lands on a page

Two rules, and no page lists task ids of its own.

A task with no input roles generates from nothing, so the create page offers it. A task with a `source` role works from a take, so the remix picker offers it.

The sound page is the exception, and exactly two tasks ask for it by setting `surface`.

A test checks that every task lands on exactly one of the three pages. A task landing on none would vanish from the studio with nothing reporting it.

## Routes

Only ACE-Step names a route, because it is the only family with any. Everything else has one way to do its job.

Vevo2 is the exception that proves it: `generate.sing` picks between two routes based on whether you staged a melody, and those two routes live under different runtime task kinds.
