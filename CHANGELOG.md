# Changelog

Miso follows [semantic versioning](https://semver.org/). Development before 0.2.0 predates
this file, so the earlier history lives in the git log.

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
- **Model residency.** Miso loads a package when a job needs it, keeps it loaded for the next
  job that can use it, and frees it when the queue moves to a different model. Settings for
  the card can be reclaimed through the new unload route.
- **Takes.** A generated track is saved as an asset that knows which job made it, alongside
  imported audio in the same track list.

### 🔧 Changed

- The queue runs jobs grouped by model, so six jobs across two models cost two weight loads
  rather than six.
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
