# Changelog

All notable changes to `dsh-limit-break`. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versions follow semver.

## Unreleased

## 1.2.0 — 2026-10-20

### Fixed
- **A corrupt `facts.json` used to be silently replaced.** `loadStore` returned an empty
  store on `SyntaxError`, and the next `memory_save` overwrote the unreadable file. The file
  is now moved aside as `facts.json.corrupt-<epoch-ms>` before any new save, so recovery is
  possible and `memory_stats.corrupt` is not a silent wipe.
- **`memory_recall({ limit })` accepted `Infinity`/negative/NaN.** `Number(input.limit) || 8`
  let `Infinity` through to `slice()` (returns everything) and `-5` meant "all". The limit is
  now clamped to `[1, 12]`, non-numeric falls back to 8.
- **A relative `DSH_HOME` put the store in the host's cwd.** Resolution now anchors a relative
  value against `process.cwd()` and returns an absolute path, so the same store is found on
  every launch.
- **`plugin-load.log` could grow forever.** The log is now trimmed to the last 500 lines and
  capped at 256 KiB (a single un-newlined line cannot bypass the cap).
- **`resilient_fetch` buffered the whole response before clipping it.** One large page could
  exhaust memory; the body is now read with a 2 MiB cap (`readCapped`), then clipped to 20 000
  chars as before.
- `memory_save` rejects ids over 200 chars and statements over 20 000 chars instead of writing
  them.

### Added
- `test_plugin.mjs` grew six contract cases: limit clamping, corrupt-store recovery, log
  trimming, relative `DSH_HOME` resolution, long-id rejection, plus the original round trip,
  fetch ladder and alternate-host rewrite.
- README section "Known limits" — the honest list of what these tools still cannot do.

## 1.1.0 — 2026-10-20

### Added
- `MAINTAIN.md` — the maintenance runbook (probe → break → evolve → publish → record).
- `CHANGELOG.md` — this file.
- `tools/maintain.py` — three verbs: `status` (npm / GitHub / listing / drift),
  `probe` (environment baseline with diff-against-previous), `verify` (contract test).
  Shipped in the tarball so the loop is reproducible on any machine, not just this one.

## 1.0.2 — 2026-10-20

### Fixed
- Package metadata: `author` and `repository` now present in the published tarball.

## 1.0.1 — 2026-10-20

### Added
- Real implementation of the four tools (`memory_recall`, `memory_save`,
  `resilient_fetch`, `memory_stats`) plus `dsh.bundle` so the app can mount it.

## 1.0.0 — 2026-10-20

### Added
- First published tarball. Shipped without metadata (superseded by 1.0.1).

## 0.0.0-stage — 2026-10-20

### Added
- Placeholder version created while npm staged publishing was blocking 1.0.0.
  Not installable in any meaningful sense.
