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

## Vevo2, probed and kept

Measured on 2026-09-20 against `ghcr.io/0xshug0/audio.cpp:full-cuda12`, package `vevo2_q8_0`,
3.24 GB installed. The source was a 20 second separated vocal stem at 44.1 kHz and the
reference was an 8 second vocal from a different singer. Both were generated with ACE-Step and
separated with BS-RoFormer, so this probe needs no material that is not already in the repo.

Registered with `task: "svc"`. That is not `vc` with a different name, and it confirms what the
Seed-VC line under "Still unknown" above guessed at: the singing routes want their own task
kind. Loading Vevo2 as `vc` and then asking for `style_preserved_svc` is refused.

### It answers at 24 kHz

| Model | Output | 20 seconds in | Same input twice |
|---|---|---|---|
| Vevo2 | 24 kHz mono | 11.3 to 11.6 s | identical, with a seed pinned |

Put next to the three in the table above, Vevo2 sits between Seed-VC and RVC on rate and beats
both on the other two columns. It is three times faster than Seed-VC and it repeats, which
Seed-VC never did. 24 kHz still means nothing above 12 kHz, and resampling does not bring that
back. `voice.vevo2` converts the result to its source's rate on the way out for the same reason
`voice.rvc` does, which restores the rate and not the content.

Two runs at `seed` 99 returned byte for byte identical audio. With no seed, every run differs.

### Both fields are read, and both are flat

`task_route` and `voice_ref` are CLI flags upstream, so both travel at the top level beside
`audio`. Nothing this task sends belongs under `options`. That is the opposite of RVC, and the
rule that tells them apart is in DOCS/ERRORS.md.

Checked the only way that proves anything, by sending a value the model cannot know:

```
task_route=definitely_not_a_route
  -> invalid Vevo2 route: definitely_not_a_route (expected zero_shot_tts,
     text_to_singing, svs, style_preserved_vc, style_preserved_svc,
     style_converted_vc, style_converted_svc, editing,
     singing_style_conversion, humming_to_singing, or instrument_to_singing)

voice_ref=/tmp/audiocpp-ui-.../does-not-exist.wav
  -> could not open WAV input: /tmp/audiocpp-ui-.../does-not-exist.wav
```

Both refused rather than swallowed. Two conversions of one stem against two different
references also measured apart from each other and from the source, so the reference is doing
work rather than being accepted and ignored.

### Eleven routes, three of them built

The error above is the route list. All seven singing routes were run on 2026-09-20. Every one
answers at 24 kHz mono.

| Route | Kind | Reads | Time | Output |
|---|---|---|---|---|
| `style_preserved_svc` | svc | source + voice | 11.3 s | 20 s, matches the source |
| `style_converted_svc` | svc | source + voice + text | 23.0 s | 20 s, matches the source |
| `singing_style_conversion` | svc | source + voice + text | 19.5 s | **16.48 s from a 20 s source** |
| `humming_to_singing` | svc | melody + voice + text | 9.8 s | 7.92 s, follows the melody |
| `instrument_to_singing` | svc | melody + voice + text | 5.9 s | 7.92 s, follows the melody |
| `text_to_singing` | **tts** | voice + text | 4.5 s | 6.72 s, follows the words |
| `svs` | **tts** | voice + text | 3.4 s | 3.12 s |

Three are built. `voice.vevo2` runs `style_preserved_svc`. `generate.sing` runs
`text_to_singing` when it is given no melody and `humming_to_singing` when it is.

What each one is not built for:

- `svs` takes the same inputs as `text_to_singing` and returned less from them. One of the two
  is enough.
- `instrument_to_singing` returned 7.92 seconds from the same reference as
  `humming_to_singing`, which is what upstream means by the two sharing a melody path. Two
  names for one path is not a choice worth putting on a form.
- `singing_style_conversion` does not preserve source length. A conversion that comes back
  shorter than the stem it converted cannot be mixed with that stem's siblings, which is most
  of what a conversion is for here.
- `style_converted_svc` works and preserves length. It is left out because it doubles the
  conversion form for a second way to do the thing the first way already does.

### The route decides the task kind, and one task needs both

`text_to_singing` under a registration loaded as `svc`:

```
Vevo2 route text_to_singing is not valid for task svc
```

This is the trap behind `generate.sing`, which reaches a `tts` route and an `svc` route from
one form. A registration id in Miso is per package, so both routes want `miso:vevo2_q8_0`
registered two different ways. `ensureLoaded` used to return early on any id that was already
loaded, which would have sent the second route to a registration held for the first and failed
after staging, where the job looks like it is working. It now compares the loaded kind as well
and loads again over the same id when they differ, which reconfigures rather than failing.

Length follows the words when there is no melody and the melody when there is one. `max_tokens`
is the ceiling on the first of those, and the default of 500 stops at about 7 seconds. 28 words
at 1500 gave 19.28 seconds in 11.4 seconds of compute.

### Still unknown

- The four speech routes. `zero_shot_tts`, `style_preserved_vc`, `style_converted_vc` and
  `editing` were never run, because Miso has nothing to do with speech.
- How wall time scales past 20 seconds.
- Whether `audio_chunk_duration_sec` helps on a long stem. It is the one Vevo2 option that is a
  request option rather than a flag, so it is also the one that would have to travel nested.
- What the F16 and original-dtype packages sound like against Q8. Only Q8 was installed.

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

## YuE2, probed and kept

Measured on 2026-09-20 against `ghcr.io/0xshug0/audio.cpp:full-cuda13` at audio.cpp 9ba8841,
packages `yue2_main_q8_0` and `yue2_vae_f16`. This is the image the container was moved to that
day; everything above it was measured on older builds.

### It is the only generator here that answers at 48 kHz stereo

| CoT | Audio out | Wall | RTF |
|---|---:|---:|---:|
| `off` | 43.0 s | 37.5 s | 0.87 |
| `full` | 44.0 s | 56.1 s | 1.28 |

48 kHz stereo either way. Peak VRAM was 9189 MiB of a 16 GB card, measured with `nvidia-smi`
sampling through a `cot=full` run, so none of the arena session options needed turning down.
Upstream quotes 11.18 GiB unquantized on a 24 GB card, which is the same shape.

There is no duration. YuE2 works its length out from the lyrics, and `semantic_max_tokens` is
the stop rather than the target. Every other generator in the registry takes a length in
seconds, and `generate.yue2` is the only one whose form does not offer one.

### The style is a request option, and it says so

Sending `style` flat beside `lyrics`:

```
Yue2 requires non-empty style
```

Third family to follow the rule in DOCS/ERRORS.md, and the first one to refuse rather than
accept the field and ignore it. `--lyrics` and `--seed` are CLI flags and stay at the top
level. `style`, `cot`, `semantic_max_tokens`, `guidance_scale` and `num_inference_steps` are
all `--request-option` and belong under `options`.

### It cannot do an instrumental

```
lyrics: ""  ->  Yue2 requires non-empty lyrics
```

Same shape as the style refusal, and the reason `generate.yue2` declares
`vocals: 'required'` rather than `both`. MiniMax Music 3 is declared the same way for the same
reason. The spec says lyrics are required and is right about it, which only a refused request
settles.

### The score comes back as an artifact beside the audio

With `cot=full` or `cot=melody` the response carries both:

```
artifacts: [{ id: "score", kind: "custom", payload: <base64>,
              meta: { format: "abc", extension: "abc", mime: "text/vnd.abc",
                      source: "generated", truncated: "false" } }]
```

`kind` is `custom`, which says nothing, so `storeScores` matches on the extension instead. The
payload decodes to a real ABC document with separate Vocal and Ins voices, chord symbols, a key
and tempo, and section comments:

```abc
X:1
M:4/4  L:1/16  Q:1/4=100
V: Vocal clef=treble name="Vocal Melody" snm="Vocal"
V: Ins clef=treble name="Ins Melody" snm="Inst."
K:C
% intro
V: Vocal
z8a2g2e2d2|"Fmaj7"e2d2"G"c4z8|"Am7"z8a2g2e2d2|
```

This is a task returning a take **and** an artifact, which nothing did before. `produces:
'artifact'` was an either/or, and transcription's `storeArtifacts` also requires a source asset
to hang the file off. A generated song has no source, so the score hangs off the take instead.
With `cot=off` no artifact comes back at all, which is an ordinary outcome and not a failure.

### A song cut off at 45 seconds is not a model that cannot sing

Investigated on 2026-09-20 after a song came back with music and unintelligible singing rather
than the words it was given. The cause was Miso's own form default, and the diagnosis took a
wrong turn worth recording.

The lyrics were never the problem. Two runs at seed 555 with the same style and different words
came back different, and at different lengths, 41.8 s against 52.76 s. A field accepted and
ignored would have returned the same audio twice. The planner writes real vocals too: the ABC
from a `cot=full` run carries intro, verse and chorus with 38 note characters on the Vocal
voice against 24 rests.

`semantic_max_tokens` was the problem. `generate.yue2` shipped with 1200, a value used to keep
probe runs short that became the form default. That is about 45 seconds, which on this model
lands inside the instrumental intro, so the take ended around where the vocal was due to enter.
The same prompt at 4000 ran 54.96 s and stopped on its own. The field now sends the model's own
default of 9000, and a full song with the lyrics sung was confirmed by listening.

`semantic_max_tokens` is a stop rather than a target. Raising it past what a short lyric needs
changes nothing, because the model ends the song itself.

**The wrong turn.** Separating the 55 second take and comparing its vocals stem against an
ACE-Step song looked damning:

| Source | Vocals stem zcr | Vocals stem level |
|---|---:|---:|
| ACE-Step song | 1908 | 1374 |
| YuE2 Q8, default guidance | 7961 | 1327 |
| YuE2 Q8, `guidance_scale` 1.5 | 12808 | 1241 |

That reads as noise where a voice should be, and it pointed at Q8 quantization, which the
upstream docs warn about in those exact terms. It was the wrong conclusion. A separated vocals
stem from a mostly instrumental passage is bleed and residue, and residue has a high
zero-crossing rate whatever the model is. The reference was a vocal-forward pop song singing
almost continuously, so the two numbers were never measuring the same thing.

`yue2_main_bf16` was never installed and is no longer suspected. If vocal quality is questioned
again, compare passages that both contain singing, or listen.

### A supplied score is read, not just counted

Probed on 2026-09-20, before any of the cover work was built. Two entries in DOCS/ERRORS.md are
this backend taking a request option and ignoring it, so this one was measured rather than
trusted to the spec.

Three runs at seed 4242 with the same lyrics and the same style, `cot=melody` throughout:

```
no abc supplied        23.6 s of audio   35.7 s wall   score artifact returned
melody A supplied      39.7 s of audio   21.5 s wall   no artifact
melody B supplied      15.8 s of audio   10.4 s wall   no artifact
```

Melody A was eight bars of 4/4, melody B four bars of 3/4. Same seed for all three. The two
supplied scores gave different songs of different lengths, so the score is read rather than
counted, and the run with no score gave a third song again.

Four things follow from that:

- **The planning stage is skipped.** A run given a score returns no score artifact, because it
  wrote none. `storeScores` filters the artifact list rather than requiring an entry, so a take
  planned from an external score simply has none to download. That is an ordinary outcome and
  not a failure.
- **It is faster.** 21.5 s against 35.7 s for a longer piece of audio, which is the ABC stage
  not running.
- **The song runs as long as the score does.** Four bars gave a 15.8 s song. This is the fact
  most worth telling somebody in the UI, because a short melody looks like a truncated song.
- **`cot=melody` works.** It was unrun before this. Its output carries a Vocal voice and an Ins
  voice with no chord symbols, which is the shape the YuE2 model card asks for in a cover.

Verified end to end through Miso's own worker afterwards, not only against the raw API. The
same seed and the same melody A through a queued `generate.yue2` job produced a 48 kHz stereo
take of 39.718 s, matching the direct run to the millisecond, which is what says the score
reached the model unchanged.

**Confirmed by listening, and this is the part the numbers do not cover.** Melody A was
`c4c4g4g4|a4a4g8|f4f4e4e4|d4d4c8` in C, which is Twinkle Twinkle Little Star. The take sings
that tune. Everything above proves the score changes the output, which a model treating it as a
vague hint would also do. Only the ear separates followed from read, and it is followed.

That distinction is what the cover work rests on. A faithful consumer means the accuracy risk in
a cover sits entirely in getting a melody out of a recording, not in what YuE2 does with it
afterwards.

### Two packages into one folder, and they cannot race

A working YuE2 needs a model package and a decoder package. All five write the same four
sidecar files into `Yue2-3B-GGUF/`, and starting both installs at once fails:

```
package file already exists: /app/models/Yue2-3B-GGUF/sidecars/yue2-generation-config.json
```

Installed one at a time it works every time, with or without `overwrite`. This was checked
rather than assumed: after the first failure the conflict was recreated by removing only the
decoder's gguf and its `.audiocpp-package-*.json` manifest, leaving the shared sidecars in
place, and the install then succeeded. So the sidecars existing is not the problem. Two jobs
writing them at the same time is.

`/catalog/packages/:id/install` refuses a second install into a folder that already has one
running, and the refusal names the package holding it.

### The install directory is not the first file in the list

`packageDirectory` in the catalog parser read `files[0]` to find the variant subdirectory that
ACE-Step needs. YuE2's file list opens with four sidecars under `sidecars/` and ends with the
GGUF at the package root, so that rule pointed the loader at `Yue2-3B-GGUF/sidecars`. It now
reads the first `.gguf` instead, which still gives ACE-Step `ACE-Step1.5-GGUF/turbo`.

### Still unknown

- `abc_file`, the path form of a supplied score. Only `abc`, the text form, was measured, and
  Miso has no way to put a file on the backend anyway.
- Whether a score longer than the lyrics changes where the singing stops.
- The six ABC sampling options, `abc_temperature` and its five neighbours. They only affect a
  score the model writes itself, which is why nothing has needed them yet.
- The bf16 and q4_0 model packages, and the f32 decoder. Only q8_0 with the f16 decoder was
  installed.
- The AR and NAR LoRA session options. Both want a safetensors path on the backend, and Miso
  has no way to put a non-audio file there.

## The backend's runtime task kinds, in full

Sending `/v1/models/load` a `task` it does not know answers with the whole set:

```
unsupported task: not_a_real_task (expected vad, asr, diar, sep, gen, tts,
clon, vc, s2s, align, vdes, spk, svc, or midi)
```

Fourteen, where Miso's `serverTask` union carries the five it uses. Worth
knowing because AudioSR was registered as `s2s` all along, and nothing in Miso
said so. `svc` joined the union on 2026-09-20 with Vevo2.

## MuScriptor, transcription to MIDI

Probed on 2026-09-19 against `muscriptor_small_f32`, loaded from
`/app/models/MuScriptor-Small-GGUF` with `--task midi`. 412 MB on disk, about
390 MiB of VRAM, and it loads instantly.

### It answers with artifacts instead of audio

There is no `audio` key at all. The response is:

```
text       note events as a JSON string
language   "midi-json"
artifacts  [{ id, kind, payload, meta }]
timing     { wall_ms }
```

The artifact is `{ id: "result", kind: "midi", payload: <base64>, meta: {
extension: "mid", format: "midi", mime: "audio/midi" } }`, and the payload is a
standard MIDI file: format 1, 480 PPQ, one track per instrument the model
thinks it heard.

This is why `readTaskResult` no longer demands audio. It still refuses a
response carrying neither.

### The events are a flat list, paired by index

```
{"type":"start","pitch":68,"start_time":0.67,"index":0,"instrument":"acoustic_piano"}
{"type":"end","end_time":1.36,"start_event_index":0}
```

Ends do not follow their starts and do not arrive in order. Two overlapping
notes interleave, so pairing them by walking in step gives the first note the
second one's end time.

### Pitch is exact, and a note at t=0 is lost

A synthesized C major scale, eight notes of 0.6 s each starting at t=0:

```
expected  60 62 64 65 67 69 71 72
returned     62 64 65 67 69 71 72     seven notes, first one missing
```

The same file with one second of silence in front returned all eight, correct,
with onsets inside 30 ms. That is why `analyze.midi` declares
`inputLeadInSeconds: 1`, and it matters most for a clip trimmed in the
workbench, which lands on an onset by design.

### Speed and coverage

```
20 s of music   141 notes   1.9 s
30 s of drums    76 notes   1.2 s
80 s of music   339 notes   3.4 s
```

About 24x realtime. There is no length ceiling: the 80 s file transcribed out
to 74.6 s, and the shorter spans above are simply where the last note fell.

### A known melody survives the whole path

Measured on 2026-09-20, after the note-to-ABC converter was written. The point of this one is
ground truth: most transcription checks compare a result against a judgement, and this compares
it against a tune that is known in advance.

The source was a YuE2 take generated from a hand-written Twinkle Twinkle score, confirmed by
listening to sing that melody. It went back through Miso: HTDemucs separation, MuScriptor on the
vocals stem, then the converter.

```
source      48 kHz stereo take, 39.7 s, sings Twinkle Twinkle
separated   4 stems at 44.1 kHz, vocals stem taken
transcribed 41 notes over 37.05 s, pitch range 60 to 69
```

The melodic contour came back exactly right, three times, which is how many times the song sings
the phrase:

```
expected   60 67 69 67 65 64 62 60
recovered  60 67 69 67 65 64 62 60   x3
```

Tempo was read as 98 against the 100 written in the source score, and the key as C, which is
correct. So pitch and key survive a real separation and a real transcription, and the tempo
lands within a couple of beats.

**Rhythm is the part that does not survive cleanly.** The output carries ties and one-sixteenth
slivers where MuScriptor reported a single sung note as two, as in `A7GG7F-`. It is valid ABC
and it holds the right notes in the right order. Merging a sliver into the note beside it is the
obvious tidy-up and is deliberately not done, because the same rule would collapse a genuine
repeated note, which is the bug that ate half of Twinkle Twinkle while the converter was being
written. See DOCS/MEMORY.md.

### The instrument labels are not reliable

An isolated drum stem came back as 76 `acoustic_guitar` notes and no drums.
Pitch measured well and the labels did not, so Miso carries the label and
decides nothing from it. The preview plays everything as one voice.

## Stable Audio SFX against Stable Audio music

Probed on 2026-09-19. Both loaded with `--task gen --family stable_audio`, the
SFX packages from `/app/models/Stable-Audio-3-Small-SFX-GGUF`. Same prompts,
same seed, six seconds. Loudness per half second, in dBFS:

```
door,  SFX model:  -63 -56 -53 -55 -60 -62 -62 -56 [-28] -46 -60 -90
door,  music model:-24 -24 -25 -26 -28 -31 -31 -32  -26  -44 -77 -90

glass, SFX model:  -68 -73 [-33] -43 -61 -71 -75 -75 -75 -70 -73 -81
glass, music model:-16 -17  -28  -44 -63 -69 -65 -60 -41 -60 -72 -90
```

The SFX packages make an isolated event surrounded by near silence. The music
packages fill the whole duration. That is the difference between a sound effect
and a track, and it is why they are two tasks rather than one form with a
switch.

The output is quiet, peaking about -28 dBFS. Normalize in the workbench is the
answer when it needs to sit louder.

### Its options are real, and checking them needs two values

`duration_seconds`, `num_inference_steps`, `guidance_scale` and `seed` all
change the audio, on the SFX packages and the music ones alike.

They nearly got written up as inert. Comparing one value against a request that
sent nothing produced identical bytes, which looked conclusive and was not: the
backend's own defaults are 30 steps and guidance 9, so the test had compared
the default with itself. `steps=1` runs in 0.7 s and `steps=100` in 16.9 s,
with different audio.

**Two values far apart, never one value against the default.** Everything below
was measured that way.

## ControlFoley and MiDashengLM-Gen, probed and dropped

Both installed on 2026-09-19, probed, and removed the same day along with their
specs and their weights. Recorded so nobody pays the download twice.

**ControlFoley** works and loses to Stable Audio SFX on nearly everything.
12.56 GB on disk against 2.36, mono against stereo, a fixed 8.01 s output, and
16 to 30 s per effect against 0.7 to 2.1. `duration`, `steps`, `length`,
`guidance_scale` and `negative_text` are all accepted and all inert:
`duration=3` and `duration=12` return byte-identical audio, and so do `steps=8`
and `steps=25`. Only `text` and `seed` do anything. Its one advantage was
sharper prompt differentiation, a 10x spread in zero-crossing rate against
4.7x, which is weak evidence next to the rest.

**MiDashengLM-Gen** answers at **16 kHz mono**, which is the material upscaling
exists to rescue, and upscaling was dropped. Its structured prompt tags, the
whole point of the `generate.layered` box, do nothing at all:

```
no tag                 sha 185d7ac57dd58a57
style=jazz             sha 185d7ac57dd58a57
style=heavy-metal      sha 185d7ac57dd58a57
tags=lofi,chill        sha 185d7ac57dd58a57
instrument=saxophone   sha 185d7ac57dd58a57
```

Byte-identical. Unlike the other families it validates option names, so these
are accepted rather than rejected, which makes the inertness harder to spot and
not less total. `duration` is ignored too: `duration=5` and `duration=15` both
returned exactly 10.00 s. Only `text` and `seed` change anything.
