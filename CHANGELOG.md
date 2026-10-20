# Changelog

All notable changes to `dsh-limit-break`. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versions follow semver.

## Unreleased

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
