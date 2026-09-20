---
title: Exporting
description: Get audio out of Miso as WAV or MP3, and what the licence note on MP3 is about.
sidebar:
  order: 13
---

Every take can be exported. Open its details, or use the export action beside it in the song list.

## WAV or MP3

Asking for the format a take is already stored in is instant. You get back exactly the bytes you imported, under the name you imported them with.

Asking for the other one converts in your browser and takes a few seconds on a long track.

MP3 is lossy, so it is for getting a file out of Miso rather than for keeping. If you are going to work on the audio somewhere else, take the WAV.

## Whole jobs

A separation's stems can be downloaded together as a zip, from the Stems screen. Miso streams the stored zip from disk rather than building it per request.

## Exporting works with the backend down

Export never calls audio.cpp. Neither does playback, import, or anything else in the library. You can stop the audio.cpp container and still get your work out.

## The MP3 licence note

MP3 export uses [@breezystack/lamejs](https://www.npmjs.com/package/@breezystack/lamejs), which is LGPL-3.0. Miso itself is Apache 2.0.

The reason is that every JavaScript MP3 encoder is a LAME derivative. It is a separate, unmodified package pulled in through npm and loaded only when you actually export an MP3. The dependency is not bundled into anything, so you can replace or remove it yourself.
