# Recorded audio.cpp management responses

Captured from `ghcr.io/0xshug0/audio.cpp:full-cuda13` on 2026-09-09, server started with
`--ui --ui-management`. Tests load these instead of calling a live server.

Re-record them when the image is updated. Everything from `## ACE-Step repaint` down was
measured with `scripts/probe-routes.mjs`, which stages a source, runs a request, and compares
the audio: that is the tool to re-run. The management fixtures in the table above predate it
and were captured by hand.

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

### cover and cover-nofsq: these read the source

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

- **Both lock the output to the source duration.** 20 seconds in, 20 seconds out.
- **Both follow the source.** The proof is the silence. The source falls to near nothing
  after second 16 (per-second level 54, 31, 31, 31) and both fall silent with it: cover 747,
  41, 11, 2 and cover-nofsq 952, 198, 131, 2. Read this test narrowly. `extract` passes it too
  and still separates nothing, so it shows the route read the source and never that the route
  did what it claims.
- **The prompt steers cover hard.** The piano and metal pair differ by 2244.9, wider than
  text2music's own 1098 from 5a. The manual lists cover's planner as `Not used`, the same
  words it uses for repaint where the prompt is inert, so that column does not predict
  whether a prompt works. Do not read it as one again.
- **Lyrics are yours to supply, and the route sings only what you send.** Confirmed by ear on
  September 15, 2026, not by measurement. A cover run with no `lyrics` field comes back
  instrumental. The route does not hear the words in the source and does not carry them over,
  so covering a song you want sung means sending the words with it. Every probe run on
  2026-09-14 sent the same lyrics and none tested their absence, which is why this went
  unanswered for a day.
- **`cover` and `cover-nofsq` are genuinely different routes.** They differ by 308 on the
  same request, and nofsq stays far closer to the source (per-second difference around 1300
  against cover's 3400 to 7000). One is a rework, the other is a lighter pass.
- Timing was about 4.2 to 5.1 seconds wall for 20 seconds of audio.

### extract: reads the source and rebuilds it

**Dropped from phase 5b on September 14, 2026.** Kept here because the request shape is
confirmed, and because the way this route passed every measurement before failing by ear is
the most useful thing in this file. Full write-up in `DOCS/ERRORS.md`.

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

- **It reads the source.** Duration locks to it and the output goes silent where the source
  does, 69, 1.4, 1.5, 1.6.
- **It does not separate.** The output comes back at full mix loudness, 2641 against the
  source's 2644. Against a second source carrying known vocals it came back louder than the
  source itself, 3231 for vocals and 3135 for drums against 2270. A part cannot be louder than
  the mix that holds it, and this is the cheapest test here that says so.
- **`track_name` changes the bytes without selecting a part.** On the first source `vocals`
  against `drums` moved 149.8, which read as real selection. On the vocal source that
  collapsed to 12.6, and the two extractions differed from each other far less than either
  differed from the source. Asked for vocals on a track that has them, none were audible.
- Extract returns one output, not named stems: `named_audio_outputs` came back empty.

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
- **`duration_seconds` is respected exactly.** Asking for 30 returned 30.0 seconds and asking
  for 60 returned 60.0, on both routes. The 130 seconds above is this package's default when
  no length is requested: plain text2music returns 130 too, so it is not a property of these
  routes or of the source. Both can carry an ordinary length control.
- **`track_name` empty is the same as absent.** `track_name: ""` returned byte-identical audio
  to omitting the key, so a blank field needs no special handling.

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

## Separation, all three models

Confirmed on 2026-09-18 against the same image, using `probe:htdemucs`, `probe:bsroformer`
and `probe:melroformer` registered with `task: "sep"`. The source was 40 seconds cut from
a 180 second ACE-Step take with sung lyrics, "lively swing jazz with male vocals", staged
once and reused for all three runs.

**All three separate.** This is the first family here that does what its manual says, and it
is worth saying plainly because `extract` above did not. The request needs no options at all:
none of the three specs carry a single entry in `options.request`, and every run below sent
nothing but `audio`.

### Registration and sample rate

Registration is the ordinary `/v1/models/load` with a task kind Miso has not sent before:

```json
{
  "id": "probe:htdemucs",
  "family": "htdemucs",
  "path": "/app/models/HTDemucs-GGUF",
  "task": "sep",
  "mode": "offline"
}
```

**Separation runs at 44.1 kHz and every ACE-Step take is 48 kHz.** A 48 kHz source is refused
outright:

```
HTTP 500 {"error":{"message":"HTDemucs prepare() sample rate mismatch: expected 44100, got 48000"}}
```

That is a hard stop, not a quality warning, and it applies before anything else can be tested.
Miso must resample to 44.1 kHz on the way in. The stems come back at 44.1 kHz, so a stem and
the take it came from do not share a rate, and anything that plays them together has to handle
that.

### What each model returns

| Model | Stems | Ids | Wall time, 40 seconds in |
|---|---|---|---|
| HTDemucs | 4 | `drums`, `bass`, `other`, `vocals` | 3.8 s |
| BS-RoFormer | 2 | `vocals`, `instrumental` | 77.8 s |
| Mel-Band RoFormer | 2 | `vocals`, `instrumental` | 14.9 s |

Every stem comes back the same length as the source. The ids are stable words, not indexes,
so a stem can be labelled from `named_audio_outputs` without a lookup table.

**BS-RoFormer is 20 times slower than HTDemucs for half the stems.** That is the measurement
most likely to decide which model a default points at.

### The evidence that they separate

Three tests, in increasing order of how hard they are to fake.

**No stem is louder than the mix.** Mean level of the source was 5269.6. HTDemucs returned
drums at 27.3%, bass at 39.1%, other at 17.4% and vocals at 53.6%. This is the cheap test
`extract` failed, where parts came back louder than the track holding them.

**The stems add back up.** Summed, HTDemucs came to 99.7% of the source level with a residual
of 2.7%. Read that number only for HTDemucs. Both RoFormers returned a residual of 0.0%, which
proves nothing about them: their specs say accompaniment is derived from the mixture, so
instrumental is the mix with vocals subtracted and the sum cannot fail. For those two the test
is the loudness figure and the ear.

**The vocal stem goes quiet where the singing stops.** This is the one that settles it. Per
second level across seconds 21 to 24, where the take has an instrumental break:

| | s20 | s21 | s22 | s23 | s24 |
|---|---|---|---|---|---|
| source | 6820 | 6598 | 5195 | 4483 | 5898 |
| htdemucs vocals | 1476 | 54 | 42 | 41 | 44 |
| htdemucs drums | 2692 | 2057 | 2864 | 1776 | 2862 |
| htdemucs bass | 3244 | 4796 | 1540 | 2406 | 1767 |
| mel vocals | 1515 | 0 | 0 | 0 | 0 |

The source stays loud, drums and bass stay loud, and the vocal stem falls to near silence in
both models independently. A route that rebuilds the track cannot do that.

### The three models disagree with each other

HTDemucs and Mel-Band RoFormer found the same instrumental break, but their vocal stems are
not the same audio. Mel against BS-RoFormer differs by 2213.9 zcr, which is wider than the gap
between a piano prompt and a metal prompt on text2music. These are three different models, not
three spellings of one.

### For the harness

`scripts/probe-routes.mjs` was changed on 2026-09-18 to handle this family. `run` now writes
every entry in `named_audio_outputs` as its own file, named `<label>-<id>.wav`, where before it
took `named_audio_outputs[0]` and wrote one. A single output still writes `<label>.wav`, so
every command recorded above this section still produces the file it says it does.

A `sum` command was added for the add-back test:

```
node scripts/probe-routes.mjs sum source.wav out/sep-vocals.wav out/sep-drums.wav
```

It prints each stem's level as a percentage of the mix, flags any stem louder than the mix,
sums the stems, and reports the residual against the source.

### Still unknown

- Whether separation quality holds on a real recording. Everything above used an ACE-Step
  generation, which is the only kind of audio in the library.
- How wall time scales past 40 seconds. A 3 minute take is 4.5 times this source, and
  BS-RoFormer at 77.8 seconds for 40 is the one to measure before it is offered.
- `num_overlap` on both RoFormers. It is a session option, not a request field, so it is set
  at load and was left at the package default for every run here.
- Whether the three separation models can be resident at once, and what that costs. All three
  were loaded together during this session and unloaded afterwards, but nothing measured the
  memory.

## Voice conversion, all three families

Confirmed on 2026-09-19 against the same image, using `probe:rvc`, `probe:seedvc` and
`probe:meanvc2` registered with `task: "vc"`. The source was 40 seconds cut from the
Descendents vocal stem in the live library, so unlike the separation section above this ran on
a real recording rather than on a generation.

All three convert. The important finding is not that they work, it is how the request has to
be shaped, because getting it wrong is silent.

### Request options travel nested, and sending them flat is not an error

**This is the trap. Read it before adding any option to a voice task.**

Every RVC option must be sent inside `options`:

```json
{
  "model": "probe:rvc",
  "request": {
    "audio": "/tmp/audiocpp-ui-1789267858648519/43-vocal-40s.wav",
    "options": { "voice_id": "manthos", "semitone_shift": 7 }
  }
}
```

Sent at the top level, beside `audio`, the same fields are accepted and ignored. Four runs
asking for four different voices came back byte for byte identical, as did a run asking for a
voice that does not exist and a run asking for a seven semitone shift. HTTP 200 every time.
Nested, each voice returns different audio and a wrong name is refused:

```
HTTP 500 {"error":{"message":"unknown RVC voice id: notarealvoice"}}
```

The rule comes from the CLI. A flag is a top level request field, and anything documented as
`--request-option` belongs under `options`. That is why the generation families are right to
send `text`, `seed` and `duration_seconds` flat: those are flags. It is also why `audio` and
`voice_ref` are flat here.

Seed-VC and MeanVC2 both refuse an unknown option under `options` rather than ignoring it,
which is the behaviour worth having. Seed-VC honours `num_inference_steps` in either position,
so placement cannot be tested through it alone. Use a name the model does not know: nested it
is refused, flat it is swallowed.

### The reference audio field is `voice_ref`

Seed-VC and MeanVC2 both need a target voice and neither takes a packaged one. The field is
`voice_ref`, a staged path, sent flat beside `audio`:

```json
{ "audio": "/tmp/.../source.wav", "voice_ref": "/tmp/.../target.wav" }
```

Ten other spellings were tried first and every one of them failed the same way, with
`Seed-VC request requires target speaker reference audio`, which names the problem and not the
field. `reference_audio`, `target_audio`, `speaker_audio`, `ref_audio`, `prompt_audio`,
`reference`, `speaker_reference`, `target_speaker_audio`, `reference_speaker_audio` and
`audio_reference` are all wrong. The answer came out of the upstream CLI documentation, where
the flag is `--voice-ref`.

### What each family returns

| Model | Output | 40 seconds in | Same input twice |
|---|---|---|---|
| RVC | 40 kHz mono | 9 to 10 s | identical |
| Seed-VC | 22.05 kHz mono | 36 s, 50 s at 60 steps | **different** |
| MeanVC2 | 16 kHz mono | 7 to 10 s | identical |

Every output is the same length as the source, and all three follow it: where the vocal stem
falls silent, the conversion falls silent too. That is the same test the separation section
uses and it is what rules out a model that generates rather than converts.

**Seed-VC is not reproducible even with `seed` pinned.** Two runs at seed 42 returned different
audio. Nothing can be verified by comparing checksums for that family, which also means a
person cannot ask for the render they liked a second time.

**Rates only go down.** Takes are 48 kHz, stems come back at 44.1 kHz, and the best of these
three answers at 40 kHz. Miso converts an RVC result back to its source's rate on the way out,
because the mix route refuses a set whose rates disagree. MeanVC2 at 16 kHz has nothing above
8 kHz and that is not recoverable by resampling.

### RVC accepts any input rate

Unlike separation, which refuses anything but 44.1 kHz before it starts, RVC took 44.1 kHz
stereo and 48 kHz stereo and answered at 40 kHz mono either way. No conversion is needed on the
way in, which is why `voice.rvc` carries no `inputSampleRate`.

### The three cannot all be resident

MeanVC2 failed with `failed to allocate WavLM graph tensors` on every run while RVC and Seed-VC
were loaded, and ran in 9.7 seconds once both were unloaded. This is the first hard evidence
for something the separation section only wondered about. `ensureLoaded` still trusts whatever
is already resident.

### Packaged voices

`voice_id` takes `default`, `manthos`, `chocola` and `fraise`. `default` is a fifth distinct
voice rather than an alias: it measured differently from all three named ones, at a zero
crossing rate of 1696 against 1146 for manthos, 3129 for chocola and 2483 for fraise.

`retrieval_blend` does change the output, which is consistent with the F16 package shipping
retrieval sidecars for its packaged voices. At 0.5 against the same stem with no blend, the
zero crossing rate moved from 1713 to 1742 and the per-second difference ran a few hundred
against a signal whose own level is around 3000. Judged by ear on a full take it is close to
inaudible.

### Still unknown

- How wall time scales past 40 seconds for RVC. A 2 minute 25 second stem took 1m 18s through
  the app, which is slower per second than the 40 second probe, and nobody has measured where
  that curve goes.
- Seed-VC's singing route. `v1_svc` needs a model registered with `task: "svc"` rather than
  `vc`, and answers `Seed-VC v1_svc request requires an Svc session` otherwise. It was never
  run.
- Whether a user RVC checkpoint works. `voice_model_path` and `retrieval_index_path` were never
  sent, because Miso has no way to put a non-audio file on the backend.

## AudioSR, probed and then dropped

Confirmed on 2026-09-19 against the same image, using `probe:audiosr` registered with
`task: "s2s"`. Five runs plus a two pass stereo test. **The task built on this was dropped**,
so this section exists to stop anybody probing it a second time to reach the same conclusion.
What it measures is still true of the model.

| Measure | Result |
|---|---|
| Output rate | 48 kHz, from a 16 kHz source and from a 44.1 kHz source |
| Output channels | 1, always. A stereo source is downmixed |
| Wall time | 90 to 99 s for 40 s of audio, about 2.4x realtime |
| Same seed twice | Byte identical |
| Length | Preserved, 40.07 s in and 40.07 s out |

Registration is the ordinary `/v1/models/load` with another new task kind:

```json
{
  "id": "probe:audiosr",
  "family": "audiosr",
  "path": "/app/models/AudioSR-GGUF",
  "task": "s2s",
  "mode": "offline"
}
```

### It only helps material that is genuinely band-limited

Band energy, measured after resampling everything to 48 kHz so the numbers compare:

| Source | 2-6 kHz | 6-8 kHz | 9-20 kHz |
|---|---|---|---|
| 16 kHz MeanVC2 output | -31.8 dB | -42.1 dB | -49.6 dB |
| the same, upscaled | -32.6 dB | -40.6 dB | **-38.3 dB** |
| 44.1 kHz separation stem | -28.8 dB | -38.0 dB | -35.8 dB |
| the same, upscaled | -- | -39.4 dB | **-35.5 dB** |

On the 16 kHz source it synthesises real content above the source's own ceiling, 11.3 dB in
the top band, landing near where a natural 44.1 kHz vocal sits. On a stem that already has its
top end it moves that band 0.3 dB, which is nothing, and still costs 95 seconds and a channel.

**Sample rate is not bandwidth.** A 44.1 kHz file ripped from a low bitrate MP3 can be
lowpassed at 16 kHz and has plenty to gain, so the container rate cannot be used to decide
whether upscaling will help.

### Fewer steps is damage, not a speed setting

At 10 steps rather than the default 50, the run took 51 s instead of 90 s and the 9 to 20 kHz
band came back at -26.6 dB, which is 9 dB hotter than a natural recording. Zero crossing rate
went from 7,898 to 20,608. That is hiss, not detail. Treat 50 as a floor.

### Options travel nested, and that includes the seed

Same rule as the voice families. An unknown option under `options` is refused:

```
HTTP 500 {"error":{"message":"unknown AudioSR request option: miso_not_a_real_option"}}
```

The same field sent flat beside `audio` returns HTTP 200 after a full 95 second run and is
ignored. Every AudioSR option lives under `options.request` in the spec, including `seed`,
unlike the generation families where a seed is a flag and belongs at the top level.

**`num_inference_steps` is honoured in either position**, so it cannot be used to test
placement. That is already written above about Seed-VC and it caught us again here. Use a name
the model cannot know.

### Two passes for stereo keep the music and widen the air

Since it answers in mono, stereo has to be split, upscaled per channel and rejoined. Tested on
a 16 kHz band-limited stereo vocal, same seed on both channels:

| Band | Measure | Source | Two passes joined |
|---|---|---|---|
| Below 6 kHz | L/R correlation | 0.9883 | 0.9871 |
| Below 6 kHz | Side against mid | -22.2 dB | -21.8 dB |
| Above 9 kHz | L/R correlation | 0.9503 | 0.6334 |
| Above 9 kHz | Side against mid | -15.9 dB | -6.5 dB |

Below 6 kHz the image is untouched, so per channel processing does not smear what was already
there. Above 9 kHz the two passes each invent their own detail, so the new band is only 0.63
correlated and sits 9.4 dB wider than the source's: a diffuse halo that is not centred with the
voice. Quiet, around -40 dB, and audible on headphones. Judged acceptable by ear at the time.

### Why it was dropped

Not because of any of the above. It works. It was dropped because almost nothing in a real
library is band-limited, so the honest answer for most takes is that nothing much happens, and
it is the slowest thing here by a wide margin: 2.4x realtime, doubled for stereo, so about ten
minutes for a two and a half minute song. See `DOCS/plans/2026-09-19-phase-7a-upscale.md`.

### Still unknown

- Whether it accepts 40 kHz, the rate RVC answers at. Only 16 kHz and 44.1 kHz were sent.
- How the decorrelated top end behaves on a wide stereo mix. The test source was a vocal with
  L/R correlation 0.9866, which is nearly centred.
- `guidance_scale`, `ddim_eta` and the two chunking options were never measured. They are real
  option names, since a wrong name nested is refused, but nothing confirmed what they do.
