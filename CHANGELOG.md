# Changelog

Miso follows [semantic versioning](https://semver.org/). Development before 0.2.0 predates
this file, so the earlier history lives in the git log.

## 1.1.0 - September 20, 2026

Vevo2 joins the voice conversion tools. It sings a vocal stem in the voice of
any other track in your project rather than in one of the four voices that ship
with RVC, which is the first time the voice has been yours to choose.

### 🎤 Voices

- **Sing a stem in any voice you have.** The new tool takes a vocal stem and a
  second track to copy the voice from, and hands back a stem that sits beside
  the ones it was converted from. Both tracks come out of the project, so a
  voice you import once can be reused and compared across runs.
- **It answers at 24 kHz mono**, where RVC answers at 40 kHz. That is the trade:
  RVC keeps more of the top end, Vevo2 lets you pick the singer. Both tools stay
  on the remix page and the summary on each one says which is which.
- **Seeds work.** The same seed and the same two tracks return the same audio, so
  a result you liked comes back.
- Added `vevo2` to the Models screen. The recommended package is 3.24 GB.

### 🧱 Internals

- Vendored model specs moved from audio.cpp `05f9c5d` to `9ba8841`. Every spec
  already vendored was identical at both commits, so nothing but Vevo2 changed.
- A task can now read more than one track. It names the extra roles and what to
  call them, and the remix form draws a picker for each one from the project's
  own tracks.
- `svc` joined the runtime task kinds Miso uses. Vevo2 registers separately
  under `vc` and `svc`, and the singing routes are only on the second.

## 1.0.0 - September 20, 2026

First public release. Miso now starts as a stack rather than as two servers you
wire together by hand, which was the last thing standing between it and somebody
else running it.

### 📦 Install

- **Miso and audio.cpp start together.** `docker compose up -d` brings up both
  containers, with project data and model weights in their own volumes. Miso is
  the only service with a published port, because audio.cpp's management
  interface asks nobody for a password.
- **A preflight check that catches the failure that looks like success.**
  `./scripts/preflight.sh` compares the UVM device major number on the host with
  the one inside a container. A broken NVIDIA container setup otherwise starts
  fine, passes `nvidia-smi`, and quietly runs everything on the processor.
- **Existing model directories work.** `MISO_MODELS_DIR` points the stack at
  weights you already downloaded instead of fetching them again, which on this
  machine is 39 GB not moved twice.
- **The audio.cpp image is one variable.** `AUDIOCPP_TAG` selects CUDA 12, CUDA
  13, Vulkan or CPU. CUDA 12 is the default because it runs on older drivers.
- Added `GET /api/health`, which reports the running version and whether the
  database opened. It never probes audio.cpp, so a slow GPU box cannot get Miso
  restarted.

### 🐛 Fixes

- **A job no longer fails on a source file you can see in your library.**
  audio.cpp stages uploads into a directory it makes per server start and has no
  delete route, while Miso's cache is keyed by the server address, which does not
  change across a restart. Every restart stranded every remembered path. A
  failure naming a reused path now drops that entry and uploads the file again.

### ⌨️ Keyboard

- Space plays and pauses, Ctrl or Cmd with Enter generates without leaving the
  prompt box, and `?` lists everything. The play shortcut leaves Space alone
  when the focused control already uses it, so buttons keep working.
- Compare's existing F key moved into the same table, so the list cannot
  describe a shortcut that no longer exists.

### 🆕 First run

- A fresh install now says what to download. The Start screen names one model
  rather than listing the catalog, and says nothing while the catalog is still
  scanning or the backend is unreachable.

### 💾 Storage

- Settings now reports what the installed model weights come to, beside what the
  projects use. It reported 6 MB of projects on a machine holding 41 GB of
  weights before, which answered the wrong question.

### 📖 Documentation

- `README.md` rewritten around the stack, with troubleshooting for the GPU traps,
  where the disk goes, and a section on running from source.

## 0.30.0 - September 20, 2026

### 🐛 MIDI preview

- **Fixed a transcription that played silently.** The preview set its level from
  the most notes ever sounding at once, and MuScriptor can end a long take on a
  stutter: one 169 second transcription here holds 1725 duplicate drum hits
  piled on a single instant, against two to six notes through the actual music.
  Dividing by that peak put the whole piece at about -38 dBFS. It played
  correctly and could not be heard. The level now comes from how many notes
  sound at once for most of the time, so a spike a hundredth of a second wide
  cannot quieten the minutes around it.
- Added a limiter in front of the output. The level is set from what is
  sounding 95 percent of the time, and this is what the other 5 percent costs
  instead of clipping.
- **Fixed a long transcription that played for a moment and then went silent.**
  The preview built an oscillator for every note the moment you pressed play,
  and a note that has not started yet still costs the audio thread work on
  every render quantum. A 7298 note transcription held 14598 live nodes for its
  whole four minutes, which takes more than twice realtime to render, so the
  audio thread missed every deadline after the first one. Notes now go out
  about two seconds at a time and each one is released once it has finished.
  The same transcription runs 99 voices at once instead of 7298.
- Pressing play on a long transcription no longer freezes the page for most of
  a second while its notes are scheduled.

### 🎛️ Transport

- The preview pauses and resumes where it stopped, rather than only stopping.
- Added a scrub bar with a running time and the total, so you can jump to the
  part of a transcription you want to check. It works with the mouse, a
  touchscreen, and the keyboard.
- Seeking now frees the notes it skipped past. They were silent but stayed
  scheduled, and a few seeks on a six thousand note transcription added up.

### 🔊 Sound design page

- The page lists the sound effects it has written, under the form that wrote
  them. Each one plays in the dock, exports, and deletes from there.
- The page takes the full width. The column beside it listed the project's
  generated songs, which is everything the page is not about, while neither of
  the things it makes could appear in it.

### 🗂️ Takes

- Sound effects have their own heading on the project page instead of sitting
  under Generated songs. They are written from nothing, like a song, so the
  rule that told them apart is the page the task belongs to.

## 0.29.0 - September 20, 2026

### 🔊 Sound design

- A new page at `/projects/:id/sound`, reached from the project page. It holds
  the two tools that are not about writing songs.
- **Sound effects.** Write a short sound from a description of what happens, on
  Stable Audio 3 SFX. It moved off the generate form, where nobody found it.
- **Transcriptions.** Read the notes out of a WAV take and get a standard MIDI
  file, on MuScriptor. Each one lists the take it came from, its note count and
  its length, and can be played back as plain tones before you download it.

### 🎛️ Models

- MuScriptor is in the catalog and has a task behind it.
- ControlFoley and MiDashengLM-Gen are out again. Both were installed and
  measured first. ControlFoley costs five times the disk of Stable Audio SFX for
  mono audio at a fixed eight seconds and fifteen times the wait, and
  MiDashengLM-Gen answers at 16 kHz mono with every one of its prompt tags
  inert. The measurements are in `src/server/audiocpp/fixtures/README.md`.

### 🧹 Maintenance

- A job result can now be a file that is not audio. MIDI files live in their own
  table rather than beside takes, because nothing that lists takes could play,
  draw, export or mix one.
- Transcription gets a second of silence in front of its source, because the
  model drops a note starting at zero. The offset comes back off the note times.

## 0.28.0 - September 19, 2026

### 🎛️ Models

- Stable Audio 3 SFX has its own card on the models page. Its three sound effect packages
  used to sit behind a disclosure reading "8 other versions", where nobody found them.
- ControlFoley, MiDashengLM-Gen and MuScriptor are back in the catalog, so their weights can
  be installed and probed. Nothing in Miso runs them yet. They were removed in 0.26.0 for
  exactly that reason, and they come out again if the probe does not justify building the
  tasks behind them.

### 🧹 Maintenance

- The rule for which packages are sound effect models lives in one place,
  `src/server/catalog/sfx.ts`, shared by the catalog split and the Stable Audio task that
  keeps them off the music form.

## 0.27.0 - September 19, 2026

### 🔄 Conversion

- Importing a file that is not a WAV now asks whether to convert it first. Miso reads WAV on
  its own, and separation, voice conversion and mixing all need one, so an imported mp3 could
  not be used for any of them. Converting only changes the container and leaves the sample rate
  alone, because any WAV separates at any rate.
- Importing untouched is still offered, and still gives back exactly the bytes you imported
  when you export it.

### 📤 Export

- Takes, library rows and stems now export as either WAV or MP3.
- Asking for the format a file is already in stays instant and hands back the stored bytes.
  Only a format change does any work, and it says what it is doing while it does it.
- MP3 is an export format only. Nothing writes an MP3 into a project, because separation and
  voice conversion would then refuse to run on it.

### 📦 Dependencies

- Added `@breezystack/lamejs` for MP3 encoding. It is LGPL-3.0 in an Apache 2.0 project, which
  was a deliberate choice: every JavaScript MP3 encoder is a LAME derivative. It is unmodified,
  loaded dynamically into its own 163 KB chunk, and named in the README.

## 0.26.0 - September 19, 2026

### 🎛️ Audio workbench

- New page at `/projects/:id/tools`, reachable from the project tool row and from the import
  zone. It is the first tool in Miso with no model behind it: nothing queues, nothing waits on
  a GPU, and the service only hears about the work when you save.
- Convert MP3, M4A, FLAC or WAV to 16-bit PCM WAV at 44.1 kHz or 48 kHz. This is what makes an
  imported MP3 usable for stem separation, which refuses anything that is not 44.1 kHz.
- Work from a file on the disk or from a take already in the project. A file dropped here is
  not uploaded until you choose to save the result.
- Trim to a region, and split at a cut point into two takes.
- Fade in and fade out, each linear or exponential, gain in decibels, and peak normalize to a
  ceiling that defaults to -1 dB.
- Undo, and a numbered list of what is currently applied. The source is never modified, so
  undo re-renders from it rather than keeping a copy per step.
- The page says what the file actually is on the way in, including the sample rate, which is
  the thing that decides whether a model will accept it.
- Clipping is said before it happens. The peak a gain would leave is shown beside the gain box,
  in words and in a pill rather than in colour alone.

### 🐛 Fixes

- Reading a take into the browser no longer fails with "Failed to fetch". A whole file request
  is refused by some browser extensions, so stored audio is now read in 4 MB byte ranges, the
  same way the dock already streams it. See `DOCS/ERRORS.md`.

### 🧹 Maintenance

- The WAV writer and the sample rate converter moved to `src/shared/`, so the browser and the
  service write the same file through the same code. The WAV reader stayed on the service,
  where it is the only caller.
- `RegionControls` moved out of `components/remix/`, now that two pages place a region.
- No new dependency. `music-metadata` was already installed and is now also used in the
  browser, loaded dynamically so it stays out of the main bundle.

## 0.25.0 - September 19, 2026

### 📦 Models

- The catalog now only lists model families that something can actually run. Removed AudioSR,
  Seed-VC, MeanVC2, ControlFoley, MiDashengLM-Gen and MuScriptor, which were offered for
  install with no task behind them. Eight families remain and every one has a task.
- If you already installed any of the six, Miso no longer shows them and cannot uninstall
  them. Delete them from your audio.cpp models directory by hand.

### 🗺️ Roadmap

- Phase 7 is closed rather than complete. Upscale was built and dropped, denoise is not in
  this audio.cpp image at all, and the remaining four tasks were closed unbuilt. The reasoning
  is in `DOCS/ROADMAP.md`.

## 0.24.1 - September 19, 2026

### 🐛 Fixes

- Uploading a take that Miso converted before sending no longer fails past about 47 seconds
  of audio. Bytes already in memory are sent as bytes rather than wrapped in a stream, which
  sent them as one chunk and was refused by the upload route past eight megabytes. This
  affected separating any generated take, since generated takes are 48 kHz and get resampled
  to 44.1 kHz on the way in.
- A long task no longer dies partway through with "Could not reach" while the backend is
  running perfectly. Node's fetch enforces its own 300 second timeout regardless of the
  one-hour budget Miso sets, and audio.cpp sends nothing back until a task is finished.
  Separating a three minute song with BS-RoFormer crosses that line.
- A connection that times out mid-task now says so, instead of reporting a healthy backend
  as unreachable and sending you to check a container that is fine.

### 🧹 Maintenance

- Added `undici` so the run request can use a dispatcher with those timeouts disabled. Every
  other call keeps the defaults.

## 0.24.0 - September 19, 2026

### 🎤 Voices

- **Sing a vocal stem again in another voice.** A new **Convert the voice** tool runs RVC over
  any stem and writes the result back as a stem of its own. Four packaged voices ship with the
  model: Default, Manthos, Chocola and Fraise, and they sound clearly different from each
  other. About ten seconds of work for forty seconds of audio.
- **The way in is on the stem itself**, a microphone button on every track of the stems page,
  which opens the conversion form with that stem already chosen.
- **A conversion appears under the stem it came from**, on the stems page, with a line saying
  what it was converted from. Mute the original, leave the conversion and the backing up, and
  **Save mix** gives you the song in the new voice.
- **Semitone shift, retrieval blend and pitch smoothing** sit in the advanced drawer. The blend
  does change the voice, and on the packaged voices the change is subtle.

### 🎛️ Stems

- **Save mix now says what it is about to save**, before you press it. A line under the title
  names the tracks going in, and the button counts them when it is not all of them. Saving a
  mix while one track was soloed used to write that track on its own with nothing to warn you.
- **The mix route reaches converted stems.** It walked the separation's own outputs, so a
  conversion made from one of its stems could not be mixed back in at all.

### 🐛 Fixes

- **A converted stem comes back at the rate of the stem it came from.** RVC answers at 40 kHz
  whatever it is given, and the stems it has to sit beside are 44.1 kHz, which the mix route
  refuses to sum together.

### 🧹 Maintenance

- Task fields can now be a `choice`, drawn as a segmented control and checked against its own
  values on the server, rather than after a job has queued and loaded weights.
- Seed-VC and MeanVC2 were probed alongside RVC and left out on purpose. Seed-VC answers at
  22.05 kHz, takes four times as long, and is not reproducible even with a pinned seed.
  MeanVC2 answers at 16 kHz. Both need a reference clip rather than a packaged voice. The
  measurements are in `src/server/audiocpp/fixtures/README.md`.

## 0.23.0 - September 18, 2026

### 🎛️ Stems

- **Split a take into stems.** A new **Split into stems** tool runs HTDemucs, BS-RoFormer or
  Mel-Band RoFormer over any take and writes each part as its own labelled take. HTDemucs
  returns four parts, drums, bass, other and vocals, in about four seconds for forty seconds
  of audio. Both RoFormers return vocals and an instrumental, and BS-RoFormer is by far the
  slowest of the three.
- **A page for the set**, at `/projects/:id/stems/:jobId`. Every stem plays together under one
  transport, each with its own waveform, fader, mute and solo. Click or drag any waveform to
  move the whole set, or use the skip controls either side of Play.
- **Hear one stem on its own.** Each row has a play button that solos that stem and leaves the
  rest running silently, so switching between them is instant.
- **Export one stem or all of them.** Each row has its own download, and **Export all** answers
  with a zip of the whole set.
- **Recombine them.** **Save mix** sums what you can hear, faders, mutes and solos included,
  into a new take. Mixes get their own section on the project page, because a mix is a whole
  track and does not belong under the songs a model wrote.

### 🔎 Where to find it

- **Split into stems** is its own link on the project page and on a take's detail panel, rather
  than only an option inside Remix. Taking a take apart is not a remix of it.
- A finished separation gets a **Stems** link in the queue, and a stem's detail panel has
  **Open the stems** to reach the rest of the set.

### 🐛 Fixes

- **Stems are named after the take they came from**, so a separation of "Neon Night" produces
  `Neon Night (vocals)` rather than `Split into stems (vocals)`. Every set in a project used to
  come out with the same name, which made an export impossible to tell apart.
- **A single named output is the take, not a stem.** Stable Audio returns its one track under
  `named_audio_outputs`, and Miso was filing those as stems with a machine id in the name.
  Existing rows keep their old labels; only new takes are affected.

### 🧱 Under the hood

- Separation refuses anything but 44.1 kHz and every generated take is 48 kHz, so Miso now
  resamples on the way in with a windowed sinc written in TypeScript. No media binary is
  involved, which keeps the service runnable where ffmpeg is not installed.
- One task can now run on several model families, which is what lets three separation models
  sit behind one tool rather than three.
- Migration `008_mix.sql` rebuilds the assets table for the new `mix` kind, carrying
  `asset_lineage` and `staged_uploads` across by hand.

## 0.22.0 - September 18, 2026

### 🎧 Compare page

- A new **Compare** page holds any two takes you pick, from any project. Pick one on each side
  and both load, both waveforms are drawn, one transport plays them together, and the switch
  flips which one you hear at the same point in the song. Press **F** to flip without reaching
  for the mouse.
- Unlike the dock's compare, neither take has to have been made from the other, and they do not
  have to be in the same project. This is the first place in Miso where two projects meet.
- Three ways in: **Compare** in the sidebar, **Compare with** on a take's detail panel, which
  fills one side and leaves you to pick the other, and a button on the dock's armed compare
  that opens the page holding the two takes you were already comparing.
- Every comparison is in the address, so one can be bookmarked or sent to yourself. A link
  naming a take that has since been deleted opens with that side empty rather than failing.
- Opening the page pauses whatever the dock was playing, so two songs never play at once. Your
  take stays where it was, so going back resumes rather than restarts.
- Takes of different lengths behave sensibly. The shorter one ends and waits at its end while
  the longer one carries on, and scrubbing past the end of the shorter one parks it there.

### 🧹 Maintenance

- Everything that moves a pair of takes now lives in one place, `compareDeck.ts`, which both the
  dock and the new page call. The dock's behaviour is unchanged, and the extraction landed
  before the page was written so that it could be checked on its own.
- The two way switch is shared between the dock and the page, so the two cannot drift apart.
- Fetching a library take before playing it moved into `loadLibraryAsset`, which the library
  page and the compare page both use. A library row carries no waveform, so it is fetched whole
  first, and a fetch that fails still plays the take.

## 0.21.0 - September 17, 2026

### 🎧 Compare

- A take made from another one gets a **Compare** button in the dock. Press it and a single
  switch flips between the original and the new version, instantly, at the same point in the
  song. Both takes are held while you compare, which is why it is a button you press rather
  than something that happens to every take you play.
- The switch names both takes rather than calling them A and B, and says which one you are
  hearing in words as well as by style.
- Comparing ends when you move to another take, so nothing keeps streaming behind you. If the
  second take fails to load, what you were listening to keeps playing.

### 🧹 Maintenance

- The dock's wavesurfer setup moved into `createTakeSurfer`, unchanged, so the comparison can
  build an instance the same way the dock does. The effect that decides when to rebuild is
  untouched, which is the part `DOCS/ERRORS.md` records breaking playback when it goes wrong.

## 0.20.0 - September 17, 2026

### 🌳 Lineage

- A take's detail panel now says where it came from and what came out of it. **Made from** lists
  the chain it was built on, nearest first, and **Used in** lists the takes made directly from
  it. Clicking either moves the panel to that take, so walking a chain is clicking.
- When the take something was made from has been deleted, the panel says so. Deleting a take
  erases the record that anything was made from it, and without this a repaint would have read
  as though it were generated from nothing.
- An imported take gets **Used in** too. It has no prompt of its own, but it can still be the
  thing a repaint was built on.
- A job now carries what it read as well as what it wrote, which is what made all of this
  answerable without asking the service anything new.

## 0.19.0 - September 17, 2026

### 🔁 Reuse

- Every finished row in the queue offers **Reuse**. That reaches jobs a take cannot: a failed
  or cancelled job produced nothing, so it has no take to open, and what was typed into it had
  no way back to the form.

### 🐛 Fixes

- Reuse now genuinely works on a take whose job was cleared from the queue. 0.18.0 said it did
  and it did not: the create form looked the job up in the visible queue rather than the full
  history, so clearing finished work left the button opening an empty form. It reads the
  history now.

## 0.18.0 - September 17, 2026

### 🔁 Reuse

- A take's detail panel has a second way on from it: **Reuse these settings** fills the create
  form with everything that made that take. The prompt, the lyrics, every other setting the job
  recorded, the song title, the model, and the guided builder boxes when the builder is what
  wrote it. Change one word and generate again.
- It works on a take whose job was cleared from the queue. Clearing has always hidden finished
  work rather than deleting it, and this is the first thing that reads those rows back into a
  form.
- The form says so in the address, as `?from=<jobId>`, so a seeded form survives a reload and
  the back button returns to the take.
- When the model that made a take is no longer installed, the settings still load and a line
  above the form names the missing package, rather than quietly running on something else.

## 0.17.1 - September 15, 2026

### 🎛️ Remix

- The Lyrics box on both cover tools now says what leaving it empty does. A cover does not
  read the words out of the take you gave it, so an empty box returns an instrumental rather
  than the original words. Confirmed by ear.

## 0.17.0 - September 15, 2026

### 📚 Library

- A new Library page at `/library`, above the projects in the rail. It lists every take in
  Miso, whatever project it lives in, newest first, with the project named on each row.
- Search matches the take name, the project, the song title, the prompt, the lyrics, and the
  tool that made it. Every word you type has to match somewhere, so two words narrow the list
  rather than widening it.
- Play, export, rename and delete all work from the library, and a take renamed or deleted
  there updates its project straight away when that project is open.

### 🔌 API

- `GET /api/library` answers with every take across every project as metadata. Stored
  waveforms are left out: they are about 23 KB a row and nothing in the list draws one.
- `GET /api/projects/:id/assets/:assetId` answers with one take whole, waveform included.
  This is what the player is handed when you press play in the library, so the browser never
  has to download a whole track to draw its waveform.

## 0.16.1 - September 15, 2026

### 🎛️ Remix

- Both cover tools now say that a long take may not fit in video memory. They allocate on top
  of the model in proportion to the take's length, and on a 16 GB card a three minute source
  fails while two and a half minutes works. Worth knowing because the create form's own
  default is three minutes.

### 🩺 Errors

- A job that runs out of video memory now gives advice that works. For a tool that reads a
  take it suggests trying a shorter one, and it no longer suggests picking a smaller package:
  ACE-Step ships Q8 as its smallest, so there was never a smaller one to pick.

## 0.16.0 - September 15, 2026

### 🧠 Models

- The Models screen has an **Unload models** button, which frees the card without deleting
  anything. When a generation fails for want of video memory, the error says to free the card
  with Unload models, and until now no such control existed: the server route and the API call
  were both there with nothing calling them.

## 0.15.0 - September 15, 2026

### 🎛️ Remix

- You can import audio straight from the remix page. Every other project route gets an import
  zone from the takes column, and this page drops that column to take the full width, so
  bringing in a track to work from used to mean leaving the page and coming back.
- The page no longer calls itself "Repaint a section" while it is still asking which take you
  want. It names a tool once a take is loaded and the picker is on screen, and reads "Remix a
  take" before that.

### 🎹 Generate

- The takes column beside the generate form no longer offers an import zone. That column shows
  what the form generated, so an imported file landed in the project and then did not appear
  beside you. Import from the project page, which shows everything, or from the remix page
  while picking a source.

### 🖥️ Layout

- The Models and Settings screens take the full width. Both are app level, and the takes
  column beside them was showing whichever project happened to be open, which has nothing to
  do with installing a model or changing a setting.

## 0.14.0 - September 15, 2026

### 🎛️ Remix

- The remix page carries more than one tool. A picker chooses between them, and the heading,
  description, fields and button all come from whichever tool is in force.
- Two new tools: **Cover a take** performs a track again in a style you describe, keeping its
  structure and length, and **Light cover** does the same while staying much closer to the
  original recording.
- The region editor now appears only for a tool that asks for a region, so a cover no longer
  shows a control that does nothing.
- The take detail panel's action reads "Remix this take" rather than naming a single tool.

### 📁 The project page

- Section headings now read as names rather than instructions: "Repaints" over a list of
  takes instead of "Repaint a section".

### 🔬 Routes that were measured and left out

- `complete`, `lego`, `extract`, and Stable Audio's init-audio and inpainting were all probed
  against a live backend and none of them does what its name says. Each is written up in
  `DOCS/ERRORS.md` with the measurement, so none of them is a missing feature.

### 🧹 Maintenance

- The task registry was split into one module per model family. Behaviour is unchanged.
- Adds `scripts/probe-routes.mjs`, the tool that measured the routes above, so the findings
  can be re-checked when the audio.cpp image changes.

## 0.13.0 - September 14, 2026

### 📁 The project page

- Opening a project now shows the project. `/projects/:id` is a full width page holding
  everything in it, and the create form moved to `/projects/:id/create`.
- Takes are grouped by how they were made: generated songs first, then a section per remix
  tool, then imported audio, then stems. Each section says how many takes are in it.
- The page carries the project name with inline rename, the total size, links into the tools,
  the import zone, the queue, and the take detail panel.
- Arriving on the page moves focus to its heading, so a keyboard or screen reader lands at
  the top of the page rather than back at the document body.

### 🎛️ Create

- The takes column beside the create form now shows only what that form generated. Imports
  and anything made out of another take live on the project page.
- A shorter list says so rather than dropping rows quietly. The count follows the filtered
  list, and a line underneath links to the rest on the project page.
- The create page gained a back link to the project it sits under.

### 🧹 Maintenance

- Grouping rules live in one tested module, `takeGroups.ts`, shared by both pages so they
  cannot disagree about what counts as a generated take.
- `projectPath` joins `createPath` and `remixPath` in `routes.ts`, and the remix page's back
  link builds its path through it.

## 0.12.0 - September 14, 2026

### 🎛️ Remix

- A region editor at `/projects/:id/remix/:assetId`. Pick a take, select part of it on a tall
  waveform, and repaint just that span. Everything outside your selection comes back
  untouched.
- The region can be dragged on the waveform or typed as two numbers in seconds. Arrow keys
  move a boundary by a tenth of a second, and by a whole second with shift held. The numbers
  are the real control rather than a fallback, so the editor works without a mouse.
- Play just the selected region before you replace it. The dock pauses so the two players do
  not talk over each other.
- Two ways in: a Repaint action inside a take's detail panel, which opens the editor with
  that take already loaded, and a Remix a take link in the takes column for when you have not
  opened one.
- The remix page takes the full width and carries its own source picker and queue. Playback
  keeps going across the move, the same as every other route change.

### 🔍 What repaint actually does

- The prompt is optional, and the form says it nudges the result rather than instructing it.
  This route does not follow a caption: measured against a live server on two different
  ACE-Step builds, opposite styles came out 4 to 13 apart on a brightness measure where plain
  generation put the same two prompts 1098 apart. The planner that turns text into content is
  bypassed for repaint upstream.
- Lyrics lead the form, as the only content control that does anything here. They are
  followed on some runs and not others, the help says so, and it points at the seed, which is
  the thing that actually changes a take you did not like.
- A repaint repeats exactly for the same seed, so a take you liked can be got back.

### 🐛 Fixes

- Input assets are now checked against the project before a job is queued. A job naming a
  track from another project was previously accepted and staged to the backend, which no task
  could reach until this release added one that reads audio.
- A region that is inverted, empty, or past the end of the source is refused when the job is
  posted instead of failing a minute later with the GPU already busy.
- Opening a project, moving to a tool route and reloading no longer leaves the studio with no
  project. The route patterns now match nested paths.
- The playback queue is kept by the studio provider rather than the takes column, so a take
  that finishes while that column is off screen still reaches the dock's skip buttons.

## 0.11.0 - September 13, 2026

### ✨ Create

- A New song button clears the form so the next track starts from a blank one. The title,
  the prompt, the lyrics, and every builder setting go. Until now this meant reloading the
  page.
- The model stays selected. It is a machine setting rather than part of the song, and
  re-picking it for every track would have swapped one annoyance for another.
- A form holding anything asks before it clears, the same way replacing written lyrics
  already does. An empty form clears without the question.
- The lyrics card sits directly under the song title now, above Style. Writing the words is
  where a song usually starts.

## 0.10.0 - September 12, 2026

### 🎛️ Generation

- MiniMax Music 3, HeartMuLa, and Stable Audio generate alongside ACE-Step. Create is still
  one form, with a single Model list holding every model you have downloaded, grouped by
  model name. Picking one also picks the family it belongs to.
- Each model gets the prompt it actually reads. ACE-Step takes a run of descriptors, MiniMax
  takes a production caption, HeartMuLa takes a short summary with the detail in its tags,
  and Stable Audio takes the instruments and the texture. The compiled prompt is still shown
  in full before anything is queued.
- HeartMuLa's tags are written by the guided builder out of the same words the other models
  put in the prompt, so nothing is typed twice. Custom mode still asks for them.

### 🎤 Vocals

- A model that cannot sing says so. Stable Audio locks the Vocals control to Instrumental and
  explains why, rather than offering a setting it would ignore.
- Whether a model sings is declared by Miso rather than read from the vendored model spec,
  which claims Stable Audio handles lyrics and has nothing behind that claim.

### 🐛 Fixes

- MiniMax Music 3 and HeartMuLa now make a track as long as you asked for. Both were sent
  `duration_sec`, which is the name the command line takes rather than the one the server
  reads, so MiniMax quietly capped every take at its own 20 second default however long the
  form said. A 37 line lyric sheet came back cut off mid-song.
- MiniMax Music 3 says up front that it cannot do an instrumental. The server refuses a
  generation with no lyrics, so the Vocals control locks off Instrumental and explains why,
  the same way Stable Audio locks on to it. The job is refused in the form instead of failing
  after it queues.
- MiniMax Music 3 generates instead of failing with a 500. It loads its language model, depth
  decoder, and flow transformer as three separate files, and Miso now names the ones the
  package you installed actually ships. The backend's own defaults name a set that no package
  carries in full, so the load failed before the model was ever registered.
- An expanded prompt survives a model switch. It used to be dropped as soon as the compiled
  prompt changed, which meant another call to the provider to get it back. It now lasts until
  you change the style, mood, or voice it was written from, and the prompt box keeps what it
  was holding.
- Stable Audio's sound-effect packages no longer appear in the Model list. They looked like
  another build of the music model and would have produced a sound effect instead of a
  track.
- A compiled prompt now reads "an ambient song" rather than "A ambient song", and still reads
  "a euphoric song" where the word only begins with a vowel.

### 🏷️ Versioning

- Bumped the app version to 0.10.0.

## 0.9.0 - September 12, 2026

### ✨ Projects

- Projects can now be renamed from the workspace header. The new name also updates in the
  project sidebar without a reload.
- Clicking a song name now opens its generation details over the workspace. Generated takes
  show the exact prompt and lyrics stored with their job, including jobs hidden by Clear
  finished. Imported audio says that it has no generation history.

### 🎨 Workspace

- The audio file block now stays above the song list, so imports remain reachable in a busy
  project.
- Songs and queue jobs have separate desktop scroll areas. Both lists stay usable as they
  grow, while narrow windows keep one stacked page scroll.
- Songs and queue jobs now stay in complete lists instead of folding older entries behind
  expanders. Clear finished still hides completed queue rows without deleting their history.
- A cleared queue now says only that nothing is running. The longer explanation about hidden
  jobs has been removed from the panel.

### 🏷️ Versioning

- Bumped the app version to 0.9.0.

## 0.8.1 - September 12, 2026

### 🎨 Branding

- The Miso logo now sits beside the name in the sidebar and stays visible when the sidebar
  is collapsed.
- Browser and saved app icons now use the supplied Miso artwork.
- The app accent is warmer and more orange, matching the gold and orange in the logo.

### 🏷️ Versioning

- Bumped the app version to 0.8.1.

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
