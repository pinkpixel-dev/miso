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
