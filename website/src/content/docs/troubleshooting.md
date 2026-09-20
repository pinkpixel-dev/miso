---
title: Troubleshooting
description: The things that actually go wrong, what causes them, and what to do about it.
---

## Generation is slow and the log never says ggml_cuda_init

The GPU is not reaching the container. This is the most common problem and the hardest to spot, because everything looks like it is working.

Run the preflight script:

```bash
./scripts/preflight.sh
```

The usual causes:

- `--gpus all` in place of `--runtime=nvidia`. The container starts, `nvidia-smi` works inside it, and CUDA falls back to the processor. nvidia-smi does not use UVM, so it cannot see the device node major number mismatch that causes this.
- A missing [NVIDIA container toolkit](https://github.com/NVIDIA/nvidia-container-toolkit).

One thing that is not a symptom: `ggml_cuda_init` only appears once a model has actually loaded. It will not be in the log until after your first generate.

And `"backend":"cuda"` on its own is the flag the server was asked for, not proof the device came up.

## Docker is using the desktop-linux context

Docker Desktop on Linux runs in a virtual machine and cannot pass a GPU through at all, however the host is set up.

```bash
docker context use default
```

## The Models screen says management is switched off

audio.cpp was started without `--ui-management`. The Docker stack passes it already, so this only happens on a server you started yourself.

Miso shows you the command to restart with.

## The Models screen is unhappy while everything else works

audio.cpp is down or unreachable.

That split is on purpose. The library never calls audio.cpp, so projects, imports, playback, and export keep working with the server stopped. Check Settings and press **Test connection**.

## Installs fail with "could not create package staging directory"

The models directory is not writable by uid 1000, which is the user audio.cpp runs as. This happens when Docker created the directory for you as root.

## Changing MISO_BACKEND_URL did nothing

It seeds the address the first time Miso starts with an empty database. After that the value in Settings wins.

Change it in Settings. See [Configuration](/reference/configuration/).

## A job failed naming a file path you never chose

The backend restarted and left the uploaded source behind.

Miso re-uploads and retries once on its own, so run the job again.

## Nothing loads on 5171

Either the stack is not up, or something else took the port. `npm run dev` takes the same one, so the two cannot run at the same time.

## A take will not split into stems

Separation refuses anything that is not 44.1 kHz.

Open [Audio tools](/guides/audio-tools/), drop the file in, pick 44.1 kHz, and save it into the project. Separation will take the result.

The page also shows you the real sample rate of whatever you opened, which is usually the thing you wanted to know.

## Mixing stems is refused

The mix route refuses a set whose sample rates disagree.

This normally means a converted stem is sitting beside untouched ones. RVC answers at 40 kHz whatever it is given, and Miso converts its results back to the source rate for exactly this reason, so if you hit it, check whether a stem came from somewhere else.

## A cover fails on a long track

A long take may not fit in video memory. This applies to both cover routes.

Try a shorter section, or split the track in [Audio tools](/guides/audio-tools/) and cover the halves.

## YuE2 gives me sixteen seconds of song

You handed it a short score. The song lasts as long as the score, so bring the whole tune.

A four bar melody gives you about sixteen seconds. See [Scores with YuE2](/guides/scores/).

## YuE2 refuses a score

A score needs the planning mode left on. Miso refuses the combination of a score and `None` before the job queues, rather than after the weights have loaded.

## There is no score to download

Either planning was off, or you supplied the score yourself. In the second case YuE2 skipped the planning stage because you did the planning, so there is nothing for it to hand back.

## A repaint ignores my prompt

It mostly does, and that is the route rather than a fault.

Repaint rebuilds the section from the music around it. Drive it with lyrics, strength and seeds instead. If you want the prompt to decide the result, use a [cover](/guides/covers/).

## A cover came back instrumental

You left the lyrics box empty. The cover route does not read the words out of the take you gave it, so an empty box means an instrumental rather than "keep the original words".

## A transcription lost its first note

It should not, because Miso puts a second of silence in front of the audio to work around MuScriptor dropping a note that starts at zero. If you are seeing this anyway, [open an issue](https://github.com/pinkpixel-dev/miso/issues).

## Lyrics buttons do not appear

No language model is configured. Set one up in Settings. See [The lyrics assistant](/guides/lyrics-assistant/).

## The lyrics assistant stopped working but generation is fine

The two are unrelated. The lyrics routes reach a language model somewhere else and never touch audio.cpp, so this is your provider, your key, or your local llama.cpp server.

## Out of memory on a 16 GB card

Check in this order:

1. Is a language model loaded? A local llama.cpp server and a 13 GB music model do not both fit. Press **Unload models**.
2. Is the duration high? `duration_sec` on MiniMax and HeartMuLa raises memory use directly.
3. Is it a cover on a long take? See above.

## Something else

Open an issue at [github.com/pinkpixel-dev/miso/issues](https://github.com/pinkpixel-dev/miso/issues). Miso has been run on one machine, a laptop with a 16 GB RTX 4090, so other cards and drivers are genuinely untested.

Include the output of `docker compose logs audiocpp` when a model fails to load.
