# dsh-limit-break

Four small tools for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) that came out of a
self-benchmark: two things an agent is normally told it cannot do, made cheap enough to just do.

| Tool | What it does |
| --- | --- |
| `memory_recall` | Ranked search over a JSON fact store that outlives the session. Omit `query` to list everything. |
| `memory_save` | Write or overwrite one fact: `{ id, statement, value?, unit?, details?, tags?, source? }`. |
| `resilient_fetch` | Fetch with a four-rung ladder and a report of which rung answered. |
| `memory_stats` | Where the store is, how many facts, how big. |

Zero dependencies. No import-time side effects. Everything fails soft — a broken store or a dead
network returns an error object, never an exception that could take the host down.

## Why these four

**Memory.** A session starts from zero. A store on disk plus a read at the start is enough to beat
that. Measured with two brand-new agents, zero context, the same five questions: **5/5 with the
store, 0/5 without** — and the control did not hallucinate, it answered "I don't have that" five
times.

**Network.** The reflex "this host is unreachable" is wrong more often than it is right. Measured on
one network, same edge IP, 75 seconds apart: `api.wikimedia.org` → 200 in 0.43 s,
`en.wikipedia.org` → connection reset in 1.21 s, `api.wikimedia.org` again → 200 in 0.39 s. The
block was keyed on the TLS hostname, not the address. So the ladder tries, in order: plain fetch →
IPv6 → IPv4 → a **sibling hostname of the same service** whose certificate still verifies
(`*/wiki/Title` → `api.wikimedia.org/core/v1/wikipedia/<lang>/page/<Title>`).

It does **not** disable certificate verification and does not route through a proxy that would
impersonate the origin. Those are MITM, not workarounds.

## Install

```sh
dsh plugin --profile <profile> add dsh-limit-break
```

Then restart that profile. In the desktop app, install it from **Settings → Plugins** instead — the
desktop profile is owned by the app's plugin manager.

The package declares `dsh.bundle` and ships `cordis.patch.yml`, so `dsh plugin add` mounts it with no
manual editing. If you are mounting it by hand, add to `profiles/<profile>/cordis.patch.yml`:

```yaml
- insert:
    - id: limit-break
      name: dsh-limit-break
```

A hand-mounted entry still needs the package on the profile's dependency list — a bare `insert` for a
package the profile does not declare is silently ignored.

## The store

`$DSH_HOME/memory/facts.json`, schema:

```json
{ "schema_version": 1,
  "facts": [ { "id": "", "topic": "", "statement": "", "value": "", "unit": "",
               "details": "", "source": "", "timestamp": "", "tags": [] } ] }
```

Plain JSON on purpose: anything that can read a file can use it, with or without this plugin.
Writes are tmp-file + rename.

## Disable / remove

* Hot: set `disabled: true` on the entry in `cordis.patch.yml` — Cordis recomposes in about a second.
* Cold: `dsh plugin remove dsh-limit-break`, then restart.
* The store is not deleted by either. It lives in `$DSH_HOME/memory/` and is safe to keep.

## Known limits

Measured, not guessed — each line is something a session actually hit.

* **Tools are visible only to sessions opened after the mount.** A session created before the
  plugin mounted keeps its tool snapshot; new tools do not appear until a new session. Not fixable
  from the plugin side (the tool list is materialised per session).
* **One writer per store.** Writes are tmp-file + rename, which is crash-safe, but two processes
  writing `facts.json` concurrently still lose one update — there is no lock. One agent per
  machine is the intended use.
* **The fetch ladder is hostname-level.** It does not defeat IP-level blocks, TLS interception,
  or a proxy that terminates the connection; it does not skip certificate verification.
* **`memory_recall` ranks by keyword overlap only** (id/topic/tags/statement), no embeddings, no
  stemming above the tokenisation in `tokenize()`. A query that shares no token with a fact will
  miss it.
* **`resilient_fetch` reads at most 2 MiB per response** and returns at most 20 000 characters;
  bigger payloads are truncated, not streamed.

## Privacy

Nothing leaves the machine. `resilient_fetch` makes the request you asked for; the memory tools read
and write one local file.

## License

MIT.
