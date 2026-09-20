---
title: Splitting into stems
description: Separate a song into vocals and backing, or into four parts, then mix them back and export.
sidebar:
  order: 8
---

Stem separation splits a take into its parts. Miso runs it from the remix page, on whichever separation model you have installed.

## The models

| Model | Output |
|---|---|
| Mel-Band RoFormer | `vocals` and `instrumental` |
| BS-RoFormer | `vocals` and `instrumental` |
| HTDemucs | `vocals`, `drums`, `bass` and `other` |

The two RoFormer models give the cleanest vocal extraction with the least bleed. HTDemucs is the one to use when you want drums and bass separately.

All three answer the same request and differ only in what comes back, so Miso offers one task rather than three. There are no options to set. The vendored specs carry an empty request option list, and every probe run sent nothing but the audio.

## The 44.1 kHz rule

All three separation models refuse anything that is not 44.1 kHz, before they start any work.

Every take audio.cpp generates is 48 kHz, so Miso converts those for you before sending them. The task declares the rate it needs and the worker handles it.

The case you have to think about is a file you imported. An mp3 at some other rate will not split. Fix it in [Audio tools](/guides/audio-tools/): drop the file in, pick 44.1 kHz, save it into the project, and separation will take the result.

## Working with the stems

A separation produces stems, not takes. They are filed together under the job that made them, on the Stems screen.

From there you can:

- **Play each stem** on its own
- **Mix them back together** into a new take, with Miso telling you if the result clipped
- **Download the whole set** as a zip
- **Convert a vocal stem to another voice**, which lands beside the stems it came from. See [Changing a voice](/guides/voices/)

## Mixing

The mix route sums a separation's stems into a new take in the project.

It refuses a set whose sample rates disagree. This matters after a voice conversion, because RVC answers at 40 kHz whatever it is given. Miso converts a conversion result back to the rate its source arrived at for exactly this reason, so the mix still works.

## A practical use

The most common reason to split a song is to replace the vocal. Separate it, convert or regenerate the vocal stem, mix the result back with the original backing, and export.
