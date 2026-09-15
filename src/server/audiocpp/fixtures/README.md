# Recorded audio.cpp management responses

Captured from `ghcr.io/0xshug0/audio.cpp:full-cuda13` on 2026-09-09, server started with
`--ui --ui-management`. Tests load these instead of calling a live server.

Re-record them when the image is updated, using the commands in Task 1 of
`.superpowers/sdd/2026-09-09-phase-2-model-catalog/task-1-brief.md`.

| Route | Method | Request | Fixture |
|---|---|---|---|
| `/v1/ui/models/package-sizes` | GET | none | `package-sizes-scanning.json`, `package-sizes-complete.json` |
| `/v1/ui/models/install` | POST | `{"id":"<package_id>"}` | `install-started.json` |
| `/v1/ui/models/install-status` | GET | `?id=<package_id>` | `install-status-running.json`, `install-status-complete.json`, `install-status-unknown.json`, `install-status-failed.json` |
| `/v1/ui/models/install/stop` | POST | `{"id":"<package_id>"}` | not recorded, see notes |
| `/v1/ui/models/delete` | POST | `{"id":"<package_id>"}` | not recorded, see notes |
| `/v1/ui/models/clean-partial` | POST | `{"id":"<package_id>"}` | not recorded, see notes |
| `/v1/ui/models-root` | GET | none | `models-root.json` |
| `/v1/models` | GET | none | `models-list.json` |
| `/v1/models/load` | POST | `{"id","family","path","task","mode","session_options"}` | `model-load.json` |
| `/v1/models/unload` | POST | `{"id":"<registration_id>"}` | `model-unload.json` |

The four generation-side routes were captured on 2026-09-11 from the same image, loading and
unloading `ace_step_turbo_q8_0` from `/app/models/ACE-Step1.5-GGUF/turbo`.

## Notes

- Management routes without `--ui-management` answer HTTP 403, with body
  `{"error":{"message":"UI model installation is disabled","type":"forbidden"}}`.
- Install progress reports real byte counts, not just a phase string. Every
  install-status response carries `downloaded_bytes`, `total_bytes`, and
  `progress_percent` (an integer 0-100, or -1 while idle or on failure)
  alongside `state`, `message`, `exit_code`, `started_at_ms`, and
  `finished_at_ms`.
- **Correction to an earlier note (Task 5 review):** `state` is not limited to
  `idle`, `queued`, `running`, `complete`. A real failure was captured
  installing the gated package `pocket_tts_english_safetensors` (HF access
  refused): the server reports `state:"failed"` directly, not
  `state:"complete"` with a non-zero `exit_code`. `exit_code` stayed `-1`
  (never set) and `progress_percent` stayed `-1` too, the same value used for
  a job the server has no record of. The two states are still distinguishable:
  an unrecorded job has `state:"idle"` and `started_at_ms:0`; a real failure
  has `state:"failed"` and a non-zero `started_at_ms`/`finished_at_ms`. See
  `install-status-failed.json`. A `state:"complete"` job with a non-zero
  `exit_code` may still exist for other failure modes and is still treated as
  failed, but `state:"failed"` is the confirmed real path.
- The plan's guessed request body key `package` is wrong. The install route
  requires `id` and returns `{"error":{"message":"missing required json key: id","type":"server_error"}}`
  when you send `package` instead.
- The plan's guessed query key `package` for install-status is also wrong,
  but it fails silently instead of erroring: passing `?package=...` is
  ignored entirely and the route returns every tracked install job as
  `{"data":[...]}` rather than the single job you asked about. Use `?id=...`
  to get a single job object directly (no `data` wrapper).
- Querying `install-status` for a package that was never installed (or a
  freshly restarted server) returns `state:"idle"`, `message:"Not started"`,
  `progress_percent:-1`, all byte counts 0, and no error.
- `install/stop` and `clean-partial` were discovered but not recorded as
  fixtures, since the brief does not require them. Both take the same
  `{"id":"<package_id>"}` body as `install`. Calling `stop` on a package that
  is not currently installing returns
  `{"error":{"message":"installation is not running for <id>","type":"server_error"}}`.
  `clean-partial` on a package with nothing to clean returns
  `{"id":"<id>","cleaned":true,"message":"Cleaned 0 partial download directories for <id>"}`.

- The models root is at `/v1/ui/models-root`, one level up from the rest of the `/v1/ui/`
  management surface. `/v1/ui/models/models-root`, `/v1/ui/models/root`, and
  `/v1/ui/models_root` all answer `unknown endpoint`.
- There is no unload-everything route. `/v1/models/unload-all` and `/v1/models/unload_all`
  are both unknown endpoints, so unloading everything means listing `/v1/models` and
  unloading each entry whose `loaded` is true.
- An unload keeps the registration. The entry stays in `/v1/models` with `loaded:false` and
  its path intact, which is what lets it be reloaded without registering again.
- Loading an id that is already registered answers `reconfigured` rather than failing.
- `/v1/tasks/run` validates only the `model` key. Every field inside `request` has a default,
  so a request object that is missing generates audio from defaults rather than erroring, and
  the route loads an unloaded model to do it. See `DOCS/ERRORS.md`.

## ACE-Step repaint

Confirmed against the running container on 2026-09-13, `ghcr.io/0xshug0/audio.cpp:full-cuda13`,
model `miso:ace_step_turbo_q8_0`. Source was `samples/phase0-original.wav`, 20 seconds, 48 kHz
stereo, with a window of 5 to 10 seconds.

```json
{
  "model": "miso:ace_step_turbo_q8_0",
  "request": {
    "task_route": "repaint",
    "text": "replace the middle with a bright solo piano melody",
    "audio": "/tmp/audiocpp-ui-<id>/1-phase0-original.wav",
    "repaint_start": 5.0,
    "repaint_end": 10.0,
    "repaint_strength": 0.5,
    "seed": 12345
  }
}
```

- **The staged source path travels under `audio`.** This was a guess taken from the CLI's
  `--audio` flag and it is now measured. The returned track was identical to the source
  outside the window (largest per-second mean absolute difference 13.7, and 0.0 for every
  second except the two touching the boundary) and completely different inside it (3222 to
  5536). A server that had ignored the path would have replaced the whole track.
- **`repaint_start` and `repaint_end` are seconds**, matching the CLI flags.
- **`repaint_strength` is read.** With the seed held fixed, 0.1 and 0.9 differ by 348 inside
  the window. That number only means something next to the noise floor, which is why it was
  measured: see determinism below.
- **A repaint is deterministic for a given seed.** The same request twice returned
  byte-identical audio, a difference of exactly 0.0. This matters beyond repaint, because it
  is what makes any future "did this field do anything" test on this family valid. Without it
  a real effect and run-to-run variance look the same.
- **An unknown field name is silently ignored and does not fail.** `repaint_strengthhh` was
  accepted and the request ran at the default strength. This is the same trap that hid a
  duration field for a whole phase, and it is why the check above compares audio rather than
  status codes.
- **The output keeps the source duration exactly.** 20.00 seconds in, 20.00 seconds out, at
  the same rate and channel count. Repaint locks length to the source, so there is no
  duration field to send.
- Timing for this source was about 4.1 seconds wall for 20 seconds of audio, an rtf of 0.23.
- Still unknown: whether repainting a vocal section needs the lyrics for that section. The
  confirmed run sent no lyrics and the window was instrumental.

## ACE-Step source audio routes

Confirmed against the running container on 2026-09-14, same image, model
`miso:ace_step_turbo_q8_0`. The source was `samples/phase0-original.wav`, 20 seconds, 48 kHz
stereo, staged once through `POST /v1/ui/upload` and reused for all 29 runs so the
comparisons stay honest.

The useful split is not prompt behaviour. It is whether the route reads the source at all.

### extract, cover and cover-nofsq: these read the source

```json
{
  "model": "miso:ace_step_turbo_q8_0",
  "request": {
    "task_route": "extract",
    "text": "extract vocals",
    "audio": "/tmp/audiocpp-ui-<id>/<n>-phase0-original.wav",
    "track_name": "vocals",
    "seed": 12345
  }
}
```

```json
{
  "model": "miso:ace_step_turbo_q8_0",
  "request": {
    "task_route": "cover",
    "text": "a bright solo piano break, gentle acoustic piano only",
    "lyrics": "We keep moving through the night",
    "audio": "/tmp/audiocpp-ui-<id>/<n>-phase0-original.wav",
    "seed": 12345
  }
}
```

`cover-nofsq` takes the same body with `task_route` changed.

- **All three lock the output to the source duration.** 20 seconds in, 20 seconds out.
- **All three follow the source.** The proof is the silence. The source falls to near nothing
  after second 16 (per-second level 54, 31, 31, 31) and every one of these routes falls
  silent with it: extract 69, 1.4, 1.5, 1.6, cover 747, 41, 11, 2, cover-nofsq 952, 198, 131,
  2. A route that rebuilt the track would have put audio there.
- **`track_name` steers extract.** `vocals` against `drums` differ by 149.8 on zero-crossing
  rate, deterministic on both sides. Extract returns one output, not named stems:
  `named_audio_outputs` came back empty.
- **The prompt steers cover hard.** The piano and metal pair differ by 2244.9, wider than
  text2music's own 1098 from 5a. The manual lists cover's planner as `Not used`, the same
  words it uses for repaint where the prompt is inert, so that column does not predict
  whether a prompt works. Do not read it as one again.
- **`cover` and `cover-nofsq` are genuinely different routes.** They differ by 308 on the
  same request, and nofsq stays far closer to the source (per-second difference around 1300
  against cover's 3400 to 7000). One is a rework, the other is a lighter pass.
- Timing was about 4.2 to 5.1 seconds wall for 20 seconds of audio.

### complete and lego: these ignore the source

Both accept `audio`, and both discard it.

- **Sending the source changes nothing.** With the prompt and seed held still, `complete`
  returned sha `c758f11259e41775` with and without the `audio` key, and `lego` returned
  `8c8829966dc40e8c` both ways. Byte-identical, and both routes are deterministic, so this is
  not variance.
- **Neither is text2music either.** The same prompt and seed through `text2music` gave
  `deeb05492beb6f69`. These are three distinct generation flavours, and two of them take no
  input audio.
- **Duration is not locked and not close to the source.** A 20 second source produced 130
  seconds, and a different prompt produced 140. The manual says lego is "Locked to source
  audio". It is not.
- **The prompt steers both**, 1658.8 for complete and 1646.2 for lego.
- **`track_name` is read by lego**, worth 61.6 between `drums` and `strings`.
- **`complete_track_classes` is ignored in every shape tried**, both the comma separated
  string `"drums,bass"` and the array `["drums","bass"]`, byte-identical to sending nothing.
- Timing was about 25 to 30 seconds, for a 130 second output.

### What was ruled out

- **`audio_cover_strength` does nothing on cover either.** 1.0 and 0.0 returned
  byte-identical audio. 5a found it inert on repaint and suspected audio.cpp wired it into
  the cover routes instead. It is not wired into those either.
- Determinism holds across this whole family. Every route above returned byte-identical audio
  for a repeated request, which is what makes each number here meaningful.

## Stable Audio audio input

Confirmed on 2026-09-14, model `miso:stable_audio_3_small_music_q8_0`. Outputs come back at
44.1 kHz under `named_audio_outputs` with the id `audio_0`.

**The source is opened and then discarded.** Do not build on either mode.

- `init_noise_level` at 0.2 and 0.9 returned byte-identical audio.
- `inpaint_mask_start_seconds` and `inpaint_mask_end_seconds` returned byte-identical audio in
  all three shapes: a number, a string, and an array.
- Removing the `audio` key entirely changed nothing, and a plain text2music request on the
  same prompt and seed returned that same audio again, sha `c13bd3d67b3b34ca` throughout.
- **The file is genuinely read.** A path that does not exist answers
  `HTTP 500 {"error":{"message":"could not open WAV input: /tmp/definitely-not-here.wav"}}`.
  That is what makes this different from a wrong field name: the server opens the WAV and
  then does not use it. There is no better spelling to find.
