---
title: Your first song
description: Make a project, install a model, and generate a track from the guided prompt builder.
sidebar:
  order: 5
---

This assumes the stack is running and you can reach <http://127.0.0.1:5171>. If not, start at [Install](/start/install/).

## 1. Make a project

The Library screen is the front door. Give a project a name, press **Create project**, and Miso opens it.

Use the pencil beside the project name to rename it later.

## 2. Install ACE-Step

Open the Models screen and install ACE-Step 1.5. Take the variant on the front of the card, which is the precision its authors recommend.

Nothing can be generated until this finishes. Full detail is in [Installing models](/start/models/).

## 3. Open the Generate panel

Back in your project, open the Generate panel.

Guided mode is the default. Give the song a title, pick style and mood chips, choose a vocal mode, and set a tempo and a key if you want them. Miso builds the prompt from those and shows it under the form, so you can read exactly what the model is going to receive.

Anything the chips do not cover goes in the style box and is sent as you typed it.

## 4. Write lyrics

Write lyrics in the editor below the form. The section buttons drop tags like `[Verse]` and `[Chorus]` at your cursor, and ACE-Step reads those tags, so they are how you tell it where the chorus is.

Set the vocals to **Instrumental** and the editor switches off without losing what is in it.

If you would rather not write them yourself, Miso can. That needs a language model configured in Settings first. See [The lyrics assistant](/guides/lyrics-assistant/).

## 5. Generate

Press **Generate**. The job goes in the queue, the model loads if it is not already loaded, and the finished take lands in the project under the title you gave it.

The first run is slower because it loads the weights. Later runs on the same model skip that.

Steps, guidance, seed, and a negative prompt are in the advanced drawer if you want them. [Generating a track](/guides/generating/) covers what each one does.

## 6. Listen

Press **Play** on the track to load it into the player. Click anywhere along the waveform to seek, and playback continues from there.

Click the track name to open its details over the song list. A generated take shows the exact prompt and lyrics that made it.

## What to try next

- **Change one thing.** Open the take's details, reuse its prompt, and adjust a single chip. The take records both the prompt you wrote and any expansion, so you can always see the idea as well as what was sent.
- **[Repaint a section](/guides/repaint/).** Select a span on the waveform and replace only that part.
- **[Split it into stems](/guides/stems/)** and mix them back yourself.
- **Switch to Custom mode.** It is one switch away and gives you the prompt box directly. It opens on whatever guided mode had built, so you can start with the chips and finish by hand.
