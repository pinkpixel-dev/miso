---
title: Installing models
description: How to download model weights from the Models screen, what the precision variants mean, and what to do when an install fails.
sidebar:
  order: 4
---

Miso ships no weights. The Models screen is where you get them.

## Installing one

Open the Models screen. It lists every music model audio.cpp can run, what each one does, its download size, and whether it is already installed. Pick a model and press **Install**.

The download runs in the Miso service, not in your browser, so progress keeps moving after you close the tab. A three gigabyte download outlives any tab, and ten open tabs still produce one poll loop.

Each family leads with the precision its authors recommend. The rest are behind the **variants** expander on the card. If you are not sure which to take, take the one on the front of the card.

## What to install first

ACE-Step is the model most of Miso is built around. Repaint, cover and the guided prompt builder all run on it, so install that one first.

| You want to | Install |
|---|---|
| Write songs with lyrics | ACE-Step 1.5 |
| 48 kHz stereo, with a score you can reuse | YuE2 model **and** decoder |
| Instrumentals and sound effects | Stable Audio 3 |
| Split a song into stems | Mel-Band RoFormer, BS-RoFormer or HTDemucs |
| Change a singer's voice | RVC or Vevo2 |
| Turn a take into MIDI | MuScriptor |

[Choosing a model](/models/choosing/) compares them properly.

## YuE2 needs two packages

YuE2 is the one family whose packages are not all the same thing. Three are the model and two are the decoder, and a working install needs one of each in the same folder.

Install them one at a time. The five packages share four sidecar files, so two of them installing at once fail, and the install route refuses the second and names the package holding the folder.

Miso keeps the decoder out of the studio's model list, so you will not accidentally try to generate with it. If the decoder is missing, Miso says so as something to go and install rather than letting it surface later as a load failure about a missing component.

## Download speed

Downloads come from Hugging Face and are often slower than your connection. A 250 MB package taking several minutes is normal and is nothing to do with Miso or audio.cpp.

## Removing one

The Models screen removes a package and tells you how much it frees before you confirm. Settings has a Storage section showing what each project is using and what the installed models come to. See [Storage and disk](/reference/storage/).

## When installs fail

**The buttons are disabled and the screen says management is switched off.** audio.cpp was started without `--ui-management`. The Docker stack passes it already, so this only happens on a server you started yourself. Miso shows you the command to restart with.

**`could not create package staging directory`.** The models directory is not writable by uid 1000, which is the user audio.cpp runs as. This happens when Docker created the directory for you as root.

**A download stopped partway.** It leaves a staging directory in the models folder, named after the package with a random suffix. Miso can clean these up for you from the Models screen.

**An install disappeared after a restart.** audio.cpp forgets queued installs when it restarts and reports no error, so Miso keeps its own record of what it asked for. A job the server no longer knows about is marked interrupted rather than quietly vanishing. Start it again.
