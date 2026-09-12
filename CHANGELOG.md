# Changelog

Miso follows [semantic versioning](https://semver.org/). Development before 0.2.0 predates
this file, so the earlier history lives in the git log.

## 0.8.0 - September 12, 2026

A three minute track is 34 MB, and a browser asked to fetch that much just to draw a waveform
can be stopped by an extension before the request ever leaves. When that happened the track
would not draw or play, and the button meant to fix it made the same blocked request. The
service does the reading now, so the browser never has to ask.

### ✨ Added

- **Existing takes get their waveform filled in** the next time the service starts. Nothing to
  press. New takes already arrive with theirs, so the run after that finds nothing to do.
- **Save waveform asks the service first** and reads a stored WAV without the browser
  downloading anything. Compressed imports still decode in the browser, which has the decoder
  for them.

### 🔧 Changed

- The message under an unsaved waveform says what it actually means. It used to read "No
  waveform stored for this track yet" directly beneath a waveform that was plainly visible,
  which made the button look like it did nothing. The waveform was real, it simply was not
  kept, and every device that opened the track worked it out again. The button is called Save
  waveform now, because saving is what it does.

## 0.7.0 - September 12, 2026

### ✨ Added

- **A generated take arrives with its waveform already drawn.** The service reads it from
  the audio it is already holding, which takes about a tenth of a second for a three minute
  track. Before this every device that opened the project downloaded the whole 34 MB file and
  decoded it just to draw the picture, which was cheap at the old 30 second default and is
  not at three minutes. Imported mp3, flac, and m4a still draw in the browser, which has the
  decoder for them.

### 🔧 Changed

- The bucketing that turns samples into a waveform is shared between the service and the
  browser, so a generated take and an imported one draw the same way.

## 0.6.2 - September 12, 2026

### 🐛 Fixes

- A track that fails to load for playback now says so. Before this it left a Play button that
  could not be pressed beside an empty box, with nothing on screen to tell a broken file apart
  from a stale browser tab. The message also says to try Export, since a track that plays
  there is fine and the page is what needs reloading.
- Playback no longer stops when the project reloads. Every refetch parses the stored waveform
  again and hands back a new array, which rebuilt the player, so finishing a generation while
  listening to something cut that track off mid play.

### 🎨 Queue

- Finished jobs past the most recent four fold away behind an expander, so the queue stops
  growing without limit on a project you keep working in. Anything waiting or running always
  shows. Nothing is deleted: a job row holds the prompt, the lyrics, and the settings that
  produced a take, which is the record of how a track was made and what phase 5 reopens.

## 0.6.1 - September 12, 2026

### 🐛 Fixes

- The lyrics assistant no longer sends a temperature. GPT-5 and the o-series reject any value
  but their own default, which failed every request to a current OpenAI model with
  "Unsupported value: 'temperature' does not support 0.9 with this model". Every provider's
  default is already varied enough for lyrics and for a second take on a prompt, so nothing
  is lost by leaving it out.

## 0.6.0 - September 12, 2026

The lyrics assistant. Describe what the song is about and a language model writes the sheet,
with a title. It can also take your prompt and hand back a richer one, which you accept,
edit, or ignore.

### ✨ Added

- **Write lyrics.** A description of the song goes to a language model along with the style
  and mood from the builder, and comes back as a tagged lyric sheet with a title. It lands in
  a preview you can edit, and it reaches the editor only when you say so. When the editor
  already has words in it, the button says it is replacing them.
- **Make the prompt richer.** Sends the form as it stands and offers an expanded prompt
  beside the one you wrote. Ask twice and you get two different answers, which is a cheap way
  to get a fresh take on the same idea. A job records both prompts, so a take shows the idea
  as well as the expansion.
- **Two engines, both configured at once.** An OpenAI-compatible provider, or a llama.cpp
  server on your own network. A switch in Settings says which one is used, and moving between
  them does not mean typing a key back in.
- **Saved prompts and lyric sheets.** Keep a good one by name and reach for it in any
  project. Separate from job history, which records everything you ran rather than what was
  worth keeping. Saving over a name replaces it.

### 🔧 Changed

- The default song length is 180 seconds rather than 30. Three minutes is a song, and 30
  seconds is a sketch.
- The API key is write only. It goes into Miso's database on the machine running the service
  and never comes back to the browser, so the settings screen reports that a key is stored
  rather than showing it.
- A job carries the prompt you wrote when what ran was an expansion of it. The two columns
  are only ever different: a prompt sent as written records nothing extra, so an enhancement
  cannot be claimed where none happened.
- An accepted expansion stops applying as soon as you change the form it was made from. A
  prompt written for a different set of chips is not an expansion of the current one.

## 0.5.0 - September 12, 2026

The guided prompt builder. Pick a style, a mood, a tempo and a voice, and Miso writes the
prompt for you. It shows you the sentence it built before anything is queued, so nothing
about it is a guess.

### ✨ Added

- **Guided mode.** Style and mood chips, a free text box for anything the chips do not
  cover, a vocal toggle for female, male, duet, or instrumental, and a voice description.
  The prompt compiled from them is shown under the form, in full, as the model receives it.
- **Tempo and key.** A BPM box with a slider and a tap tempo button that measures from up to
  eight taps. A key dropdown covering the major and minor keys. Both default to auto, which
  leaves the choice to the model rather than forcing one.
- **Lyrics editor.** Section buttons for intro, verse, pre-chorus, chorus, bridge, and outro.
  Each drops its tag at the caret and leaves the caret under it. ACE-Step reads these tags,
  so they are how you tell the model where the chorus is.
- **Song title.** A take is now named after the title you gave it, in the library and in the
  queue. The prompt is still the fallback for a take with no title.
- **Custom mode.** The old form, unchanged, one switch away. Guided mode is the default for
  ACE-Step, and any family without compilation rules opens straight into custom.
- **Advanced drawer.** Steps, guidance, seed, and the new negative prompt, folded away until
  you want them. A field says whether it belongs there, so the drawer fills itself as tasks
  gain options.
- **Negative prompt, tempo, and key parameters** on `generate.text2music`, which ACE-Step
  takes as `negative_prompt`, `bpm`, and `keyscale`.

### 🔧 Changed

- A job carries the song title and the builder state that produced it, in two new columns.
  The compiled prompt cannot be taken apart into the chips it came from, so the chips are
  kept. This is what a take needs to be reopened in the builder it was written in.
- Chips are lowercased into the prompt. Anything you type by hand is sent exactly as typed,
  because a band name is capitalised on purpose.
- The lyrics box switches off while the vocals are set to instrumental, and what is in it is
  kept rather than cleared.

### 🧹 Maintenance

- `busy_timeout_ms` is dropped from the plan. It appears nowhere in the audio.cpp server
  README, the vendored docs, or the live server, and the 503 retry path already covers the
  case it was meant to cover.

## 0.4.0 - September 11, 2026

Miso generates music now. Write a prompt on a project screen, pick an installed ACE-Step
package, and the track lands in the project with the prompt and the settings that made it
recorded beside it.

### ✨ Added

- **Generate panel.** A prompt, optional lyrics, length, steps, guidance, and a seed, on
  every project screen. The form is built from what the service says the task takes, so a new
  task does not need a new screen.
- **Job queue.** One job at a time, with waiting, preparing, generating, done, failed, and
  cancelled states. It starts the moment you press Generate and keeps going while you look at
  something else.
- **Queue list.** Elapsed time that counts up while a job runs, the reason a job failed, and
  an estimate from how long past runs on the same model took.
- **Cancel.** Available on a job that has not started. A running generation cannot be
  interrupted, and the queue says so rather than offering a button that does nothing.
- **Model residency.** Miso frees every other model on the backend before loading the one a
  job needs, keeps it loaded for the next job that can use it, and reads what is actually
  resident from the backend each time rather than trusting its own memory of it. The card can
  be reclaimed through the new unload route.
- **Takes.** A generated track is saved as an asset that knows which job made it, alongside
  imported audio in the same track list.

### 🔧 Changed

- The queue runs jobs grouped by model, so six jobs across two models cost two weight loads
  rather than six.
- A generation that runs out of GPU memory says what to do about it, rather than only
  repeating the backend's wording about a failed buffer allocation.
- A busy backend no longer fails a job. It goes back in the queue, and the wait doubles from
  five seconds to two minutes before the job gives up.
- Jobs left running when the service stops are marked failed at the next start, with the
  reason stated, rather than sitting in the queue forever.

## 0.3.0 - September 11, 2026

Miso holds your work now. You can make a project, import a song, see its waveform, play and
seek inside it, rename it, delete it, export it, and find all of it again after a restart.
None of it needs audio.cpp running.

### ✨ Added

- **Projects.** Create, rename, and delete a project from the Library screen. Each row shows
  its track count and how much disk it is using. Deleting a project removes its directory.
- **Import audio.** Drag a file onto the project view, or use the file picker, which is the
  path that works on a phone. Accepted formats are wav, flac, mp3, and m4a, up to 200 MB.
  The upload streams to disk with a progress bar and a sha256 checksum, and the format is
  decided by reading the container rather than trusting the extension.
- **Waveforms and playback.** The browser that imports a file computes 2048 peaks per
  channel and sends them up, so every later viewer draws the waveform without decoding
  anything. Playback streams by HTTP range request, so seeking fetches the bytes around the
  play head instead of the whole file. A track with no stored waveform still plays, and
  offers to work one out.
- **Rename, delete, and export a track.** Export sends the stored bytes unchanged under the
  original filename, non-ASCII names included.
- **Storage usage in Settings.** Total across all projects, and a per project breakdown that
  links back into each one.

### 🧹 Maintenance

- **Five library tables** arrived in one migration, `003_library.sql`. Phase 3 writes
  `projects` and `assets`. The other three are created empty for the job system in phase 4.
- **Each Vitest worker gets its own data directory.** Several route test files open the real
  database and clear the projects table between cases, so one shared scratch directory meant
  one file's cleanup wiped another file's fixtures mid-run.
- **Added wavesurfer.js 7** for the waveform display.

## 0.2.0 - September 9, 2026

Adds a way to clear out abandoned downloads, and fixes three bugs that manual testing of the
Models screen turned up.

### ✨ Added

- **Clean up partial downloads.** The Models screen header has a button that sweeps every
  vendored package at once and reports how many staging directories it removed. It asks for
  confirmation first. The new route is `POST /api/catalog/partials/clean`, which returns the
  catalog plus a `removed` count.

### 🐛 Fixes

- **The panel heading was invisible.** A `--color-base` token generated a Tailwind text
  colour utility that beat the `text-base` font size utility, so headings using it for size
  were painted in the page background colour. The token is now `--color-canvas`.
- **A finished install stayed on the Install button until you reloaded the page.** The
  install poller now clears the package status cache when an install reaches a terminal
  state, so the catalog updates itself. It still leaves the cache alone mid-download.

### 🔧 Changed

- **The per-model Clean up button is gone**, along with `POST /api/catalog/packages/:id/clean`.
  audio.cpp reports nothing about staging directories, so a per-model button could only guess
  which package a leftover directory belonged to, and it guessed wrong in both directions. The
  catalog-wide sweep replaces it.
- **An interrupted install now says Install rather than Resume.** audio.cpp cannot resume a
  download, so the old label promised something that never happened. The message beside it
  says plainly that installing again starts from the beginning.
