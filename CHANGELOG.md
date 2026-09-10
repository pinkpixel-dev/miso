# Changelog

Miso follows [semantic versioning](https://semver.org/). Development before 0.2.0 predates
this file, so the earlier history lives in the git log.

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
