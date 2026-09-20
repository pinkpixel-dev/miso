---
title: Repainting a section
description: Replace a time span inside a track and leave the rest alone. This is the feature Miso is built around.
sidebar:
  order: 5
---

Repaint replaces the part of a take you select and leaves everything else untouched. Pick the middle eight bars on a waveform, ask for something brighter, and hear it replaced.

It runs on ACE-Step, from the remix page.

## How to do it

1. Open a take on the remix page.
2. Drag on the waveform to select the span you want replaced. You can also type the start and end in seconds.
3. Write the lyrics for the section you are replacing.
4. Add a prompt if you want one.
5. Set the strength.
6. Generate.

The region has to end after it starts and land inside the track. Miso refuses anything else before the job queues.

## The fields

**Region start and end**, in seconds. Set by dragging on the waveform, or typed.

**Lyrics** are the one content control that really works on this route. They reach the model down a different path from the text prompt, and a repainted vocal section sings what they say. Give it the lyrics for the part you are replacing.

It follows them on some runs and not others, and without them it does not keep the words that were already there. Expect to try a few seeds.

**Prompt** is optional, and Miso says so on the form. This is worth understanding before you fight with it.

**Strength**, from 0 to 1, defaults to 0.5. Low nudges what is already there. High replaces it.

**Steps** and **seed** are in the advanced drawer. A repaint repeats exactly for the same seed, so the seed is how you keep a good one.

## Why the prompt is only a nudge

The repaint route rebuilds the section from the music around it. The prompt changes the result without deciding what you get.

This was measured rather than assumed. Opposite prompts, "solo piano" against "distorted metal guitar", produced audio 4 to 13 apart on a brightness measure. The same two prompts through the normal generate route on the same model came out 1098 apart.

That held on both ACE-Step Turbo and Base, so it is a property of the route rather than of the model variant.

If you want the prompt to decide the result, you want a [cover](/guides/covers/), not a repaint.

## Practical notes

- Work in short spans. A repaint is easier to judge and cheaper to retry.
- Change one thing between runs. Keep the seed fixed and move the strength, or keep the strength and move the seed.
- A take records the region and every field that made it, so a repaint you liked can be found again later.
