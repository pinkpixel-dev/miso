# Miso

A local music generation and remix studio. You bring a prompt or a song, and Miso gives you
a real workspace for generating, remixing, splitting, and finishing music with models that
run on your own machine. Nothing is sent anywhere.

Miso runs on [audio.cpp](https://github.com/0xShug0/audio.cpp), a C++ inference runtime for
audio models. Miso is the studio around it: projects that persist, a history of every take,
and a record of exactly how each clip was made so you can change one thing and try again.

> **Early days.** Phase 1 of the [roadmap](DOCS/ROADMAP.md) is done, which means the app
> runs and connects to a server. Generation arrives in phase 4 and remix in phase 5. It is
> not usable for making music yet.

## Why it exists

There are other interfaces for audio.cpp, including one built into the server itself. They
are all one-shot: fill in a form, get a file, lose it when you close the tab. None of them
goes deep on music.

Miso is project-shaped instead. It keeps your work, tracks how each clip came to be, and
lets you feed one result into the next step. The feature it is built around is ACE-Step's
`repaint`, which replaces a time span inside a track that you select. Pick the middle eight
bars on a waveform, ask for something brighter, and hear it replaced. No other interface on
this runtime exposes that as a timeline edit.

## What you need

- **A GPU worth using.** These are diffusion and transformer models. A 16 GB card runs
  everything comfortably in Q8. Less will limit which models you can load.
- **Docker**, with the NVIDIA container toolkit for GPU access. You can also build
  audio.cpp yourself if you prefer.
- **Node 22 or newer.**
- **Disk.** Models are large. ACE-Step is around 6 GB and MiniMax Music 3 is around 13 GB.

## Getting started

### 1. Start an audio.cpp server

```bash
docker run -d --name miso-audiocpp --runtime=nvidia \
  -e NVIDIA_VISIBLE_DEVICES=all -e NVIDIA_DRIVER_CAPABILITIES=all \
  -v ./models:/app/models -p 8080:8080 \
  ghcr.io/0xshug0/audio.cpp:full-cuda13 \
  server --ui --ui-management --host 0.0.0.0 --port 8080 --backend cuda
```

Two parts of that command are not optional.

Use `--runtime=nvidia`, **not** `--gpus all`. With `--gpus all` the container starts and
`nvidia-smi` works inside it, so everything looks correct, while CUDA silently fails and
falls back to the processor. The cause is a device node major number mismatch, and it is
written up in [DOCS/ERRORS.md](DOCS/ERRORS.md).

Keep `--ui-management`. Without it Miso cannot browse or download models, upload audio, or
load a model to run. It can only check that the server is alive.

Check it worked:

```bash
curl http://127.0.0.1:8080/health
```

You want `"backend":"cuda"` in the response. If it says `cpu`, the GPU is not reaching the
container.

### 2. Run Miso

```bash
npm install
npm run dev
```

The app is at <http://127.0.0.1:5170>. Open Settings, confirm the server URL, and press Test
connection.

For a production run, build first and let the service serve everything from one port:

```bash
npm run build
npm start
```

That puts the whole app on <http://127.0.0.1:5171>.

### 3. Get some models

Model downloading through the Miso interface arrives in phase 2. Until then, use the
server's own API:

```bash
curl -X POST http://127.0.0.1:8080/v1/ui/models/install \
  -H 'Content-Type: application/json' \
  -d '{"id":"ace_step_turbo_q8_0"}'

curl "http://127.0.0.1:8080/v1/ui/models/install-status?id=ace_step_turbo_q8_0"
```

## Running the server somewhere else

Miso never assumes audio.cpp is on the same machine, and never assumes a shared filesystem.
Audio is uploaded to the server and results come back over HTTP. So you can put the server
on a home server or a NAS, point Miso at it, and keep the model library on the machine with
the storage. Set the address in Settings.

## How it fits together

Three processes, and only one of them is Miso's own.

- **audio.cpp server.** Runs the models. Docker or native.
- **Miso service.** Node and Hono, with SQLite for projects and a directory for audio. It
  owns the job queue, model residency, and every large payload. It also serves the client in
  production.
- **Miso client.** React and Vite. It talks only to the Miso service, never to audio.cpp
  directly.

That last rule is what makes a remote server work, and it keeps stem separation responses,
which can run to hundreds of megabytes, out of the browser.

## Configuration

| Variable | Default | What it does |
|---|---|---|
| `MISO_PORT` | `5171` | Port the Miso service listens on |
| `MISO_HOST` | `127.0.0.1` | Interface it binds to |
| `MISO_DATA_DIR` | `./data` | Where the database and audio assets live |
| `MISO_BACKEND_URL` | `http://127.0.0.1:8080` | audio.cpp address used before you set one |

## Project docs

- [DOCS/PLAN.md](DOCS/PLAN.md) covers the design and why each decision was made
- [DOCS/ROADMAP.md](DOCS/ROADMAP.md) is the build order and checklist
- [DOCS/ERRORS.md](DOCS/ERRORS.md) records problems already solved, worth reading before
  debugging something that looks new

## License

Apache 2.0. See [LICENSE](LICENSE).

---

Made with 💖 by Pink Pixel
