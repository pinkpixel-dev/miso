---
title: Changing a voice
description: Sing a vocal stem again in a packaged voice with RVC, or in the voice of any other track with Vevo2.
sidebar:
  order: 9
---

Two tasks change who is singing. They sit beside each other rather than one replacing the other, because they trade different things away.

| | RVC | Vevo2 |
|---|---|---|
| Voices | Four packaged | Any track in the project |
| Output | 40 kHz | 24 kHz mono |
| Needs | A vocal stem | A vocal stem and a reference track |

RVC sounds better. Vevo2 can use any voice. Pick accordingly.

## RVC: four packaged voices

**Convert the voice** sings a vocal stem again in one of four voices: `default`, `manthos`, `chocola` and `fraise`.

Run it from the remix page on a vocal stem. The result lands beside the stems it was converted from rather than in the song list, and the chosen voice is added to its name so two conversions of the same stem do not end up with identical names.

RVC answers at 40 kHz whatever it is given. Miso converts the result back to the rate its source arrived at, because the stems it has to sit beside are 44.1 kHz and the mix route refuses a set whose rates disagree.

It accepts 44.1 kHz and 48 kHz sources alike, so there is no rate you have to fix first.

## Vevo2: any voice you have

**Sing it in another voice** converts a vocal stem to the voice of any other track in the project.

It reads two tracks, so the form has two pickers: the stem being converted, and the track to copy the voice from. A few seconds of clean vocal is enough for the reference.

Everything comes back at 24 kHz mono, on every route. Nothing above 12 kHz survives. That is the trade: bandwidth for being able to use any voice at all.

Under the hood this runs Vevo2's `style_preserved_svc` route, which keeps the original performance and changes only who is singing it.

## Singing written lyrics

**Sing lyrics in a voice** is a generator rather than a remix, so it lives on the create page.

Write lyrics, pick a track to borrow the voice from, and it sings them. Add a second track as a melody and it follows that instead of writing its own.

That second track is what decides the route:

- **No melody** runs `text_to_singing`. Vevo2 writes its own tune, and the length follows your words.
- **With a melody** runs `humming_to_singing`. It follows the tune you gave it, and the length follows the melody.

The length limit on the form is what stops a long lyric short in the first case. The upstream default of 500 tokens is about seven seconds, which is why Miso sends 1500.

Output is 24 kHz, the same as every other Vevo2 route.

## Getting a vocal stem

All three of these want a vocal stem, not a whole song. [Split the track first](/guides/stems/).
