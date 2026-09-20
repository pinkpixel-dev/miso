---
title: Generating a track
description: The guided prompt builder, custom mode, and how Miso translates one form into each model's own syntax.
sidebar:
  order: 3
---

The Generate panel inside a project is where new audio comes from. Five generators sit behind it, one per model family, and the form changes to match the one you pick.

## Guided mode

Guided mode is the default. You fill in a structured form and Miso builds the prompt from it.

- **Title.** What the take is called when it lands.
- **Style and mood chips.** Pick as many as fit.
- **Vocal mode.** Male, female, instrumental, and so on. Setting this to Instrumental switches the lyrics editor off without losing what is in it.
- **Tempo and key.** Optional.
- **Style box.** Anything the chips do not cover, sent as you typed it.

Miso shows the assembled prompt under the form, so you can read exactly what the model is going to receive before you press anything.

## Custom mode

One switch away, and it gives you the prompt box directly. It opens on whatever guided mode had built, so you can start with the chips and finish by hand.

## Lyrics

The editor sits below the form. Section buttons drop tags like `[Verse]` and `[Chorus]` at your cursor. ACE-Step reads those tags, so they are how you tell it where the chorus is.

Miso can write lyrics for you if you point it at a language model. See [The lyrics assistant](/guides/lyrics-assistant/).

## The advanced drawer

Steps, guidance, seed, and a negative prompt. What each one does depends on the model, and the [model pages](/models/choosing/) list the real defaults per family.

The one that pays off most often is the seed. Set it and the same inputs return the same audio, which is what lets you change a single chip and hear only that change.

## One form, five syntaxes

The models do not take the same input. Miso translates the structured form into each one's own shape.

| Form field | ACE-Step | MiniMax Music 3 | HeartMuLa |
|---|---|---|---|
| Genre and style | Appended to `text` | Folded into the caption | Comma separated in `tags` |
| Vocal timbre | Added to `text` | Added to the caption | Added to `tags` |
| Tempo | Sent as `bpm` | Written into the caption | Added to `tags` |
| Key | Sent as `keyscale` | Described in the caption | Described in tags |
| Lyrics | Plain text in `lyrics` | Bracket tags in `lyrics` | Plain text in `lyrics` |
| Instrumental | Omit lyrics, say so in text | Omit lyrics, say so in caption | Omit lyrics, tag as instrumental |

YuE2 is not in that table. Its form is not the guided builder, because it takes a style sentence and tagged lyrics directly, and those are the only two things it wants. See [YuE2](/models/yue2/).

Stable Audio 3 has no lyrics at all. See [Stable Audio 3](/models/stable-audio/).

## What happens when you press Generate

1. The job goes in the queue.
2. The model loads if it is not already loaded. The first run on a family is slower for this reason.
3. The finished take lands in the project under the title you gave it.

Both prompts are recorded on the take: the one you wrote and any expansion the assistant made. You can always see the idea as well as what was sent.

## Saving what worked

**Save this prompt** and **Save these lyrics** keep something by name. Saved items work in any project, and saving over a name replaces it.
