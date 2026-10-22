# Changelog

All notable changes to `dsh-limit-break`. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versions follow semver.

## Unreleased

## 1.5.0 — 2026-10-22

### Changed
- **`memory_recall` looks where you point it.** The scorer used raw substring counts over five
  lowercased blobs, which let common words outvote the one term that identifies a fact ("the",
  "how", "long"). It now drops English stopwords, stems (`slides`/`slide`, `rendering`/`render`),
  matches whole words with a prefix fallback (`ray` → `raytracer`), splits dotted ids into segments
  (`bench.gpu_monte_carlo` → `bench`/`gpu`/`monte`/`carlo`), weights each query token by idf
  against the live store, and adds a bonus for a whole-phrase hit in the statement.
- **`tools/recall-bench.mjs`** (new): 20 hand-labelled questions → hit@1, hit@3, MRR, misses
  printed. Same 20-fact store, before and after: **hit@1 0.75 → 0.95**, MRR **0.867 → 0.975**,
  hit@3 1.0 → 1.0. The remaining miss ("monte carlo pi benchmark on the CPU") is ambiguous
  between `bench.cpu_suite` and `bench.gpu_monte_carlo` and ranks second.

### Notes
- No tool added, removed or renamed: the four-tool ABI is untouched (see 1.4.0). `tokenize`,
  `scoreFact` and `rankFacts` are newly exported from `lib/index.js` only so the benchmark measures
  the shipped scorer instead of a copy of it.
- Store format unchanged; 1.2.x–1.4.0 stores load as-is.

## 1.4.0 — 2026-10-22

### Removed
- **`memory_prune` is gone.** Added in 1.3.0 and removed 18 hours later, because adding a tool
  to a running plugin **bricks existing sessions**: DSH projects the new tool as a
  `tool_addition` block when an old session resumes, and the API rejects the whole turn
  (`messages.196: tool_addition blocks can only be in system messages`). Two sessions died
  that way. The pruner logic was sound; the delivery was not. A plugin's tool set is part of
  the session ABI, not an implementation detail.
- `tools/prune-selftest.mjs` removed with the tool; `writeJsonAtomic` was only used by the
  pruner and went with it.

### Rules adopted
- The four tools are **frozen for the 1.x line**. No new tool, no removal: both change the
  tool set that old sessions were created under.
- Nothing is lost by removing the pruner: the store schema is unchanged, `facts.archive.json`
  stays valid, and 1.2.x / 1.3.0 stores load as-is.
## 1.3.0 — 2026-10-22

### Added
- **`memory_prune`: the manual cleanup, made repeatable.** The 2026-10-21 session pruned a
  27-fact store to 17 by hand — merging benchmark facts into a suite, deleting session state,
  dropping derivative copies. That judgment is now a tool with deterministic rules:
  `session-state` (a fact that reads as conversational state) and `exact-duplicate` (same
  statement; the richer fact survives). It reports a plan first, applies only with
  `apply: true`, copies the store to `facts.json.bak-<timestamp>`, and moves removed facts to
  `facts.archive.json`. Nothing is ever deleted. Softer suspicions — two facts citing the same
  measurements, two facts claiming opposite things on one topic — are returned as read-only
  warnings, since they need a human call.
- `tools/prune-selftest.mjs` covers the dry run (must not touch the store), the apply path
  (archive + backup), the richer-duplicate rule, and idempotence (a second run must not grow
  the archive).

## 1.2.1 — 2026-10-21

### Fixed
- **The log could not tell you which copy was live.** `User-Agent` and every
  `plugin-load.log` record now carry the version read from the installed `package.json`
  instead of a hard-coded string, and mount records add `moduleDir`. A rolled-back or
  hand-copied install is now visible in one line instead of a guess.
- **A doubly-activated plugin looked like a broken switch.** When a profile patch keeps a
  second `insert` row for the same id, the loader mounts the plugin twice, the bundle switch
  has nothing left to turn off, and the row switch is locked as *unaddressable*. Mounts are
  now counted per store and a second live mount writes a `duplicate-apply` record with a
  hint, so the misconfiguration is diagnosable from the log instead of from the symptom.

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
