/**
 * Benchmark: does remembering a hard failure actually save the ladder?
 *
 * A blocked host costs one timeout per rung (~3 s per rung at timeoutMs=3000). Before 1.8.0 a
 * second call to the same dead URL paid that again in full; now it should come back in ~0 ms
 * from the ten-minute failure memory, while a *different* URL on the same host still gets a real
 * attempt (no over-blocking), and an expired entry stops short-circuiting.
 *
 * Usage: node tools/fetch-fail-bench.mjs [url]
 */
import { apply } from '../lib/index.js'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const URL_DEAD = process.argv[2] || 'https://en.wikipedia.org/robots.txt'
const PER = 3000

function register(dir) {
  const tools = new Map()
  const ctx = {
    effect(fn) {
      fn()
    },
    tools: {
      register(def) {
        tools.set(def.name, def)
        return () => tools.delete(def.name)
      }
    }
  }
  apply(ctx, { storeDir: dir })
  return tools
}

async function timed(tool, url) {
  const t0 = Date.now()
  const res = await tool.execute({ url, timeoutMs: PER })
  return { res, seconds: (Date.now() - t0) / 1000 }
}

const dir = await mkdtemp(join(tmpdir(), 'dsh-fail-bench-'))
const tools = register(dir)
const tool = tools.get('resilient_fetch')
if (!tool) throw new Error('resilient_fetch was not registered')

const first = await timed(tool, URL_DEAD)
const second = await timed(tool, URL_DEAD)

const sidecar = JSON.parse(await readFile(join(dir, 'fetch-failures.json'), 'utf8').catch(() => '{"failures":{}}'))
const entries = Object.values(sidecar.failures || {})

const other = await timed(tool, URL_DEAD.replace(/[^/]+$/, 'index.html'))

// Expire the entry by hand: an old failure must not keep short-circuiting.
if (entries.length) {
  const key = Object.keys(sidecar.failures)[0]
  sidecar.failures[key].lastFailedAt = new Date(Date.now() - 11 * 60 * 1000).toISOString()
  await writeFile(join(dir, 'fetch-failures.json'), JSON.stringify(sidecar, null, 2))
}
const expired = await timed(tool, URL_DEAD)

// 10 minutes of blindness is the designed cost of the cache, so the cached reply has to say when
// to retry. Separately: an *expired* entry must be cleaned up when the URL finally answers, so
// the sidecar does not accumulate dead entries for hosts that came back.
import { createServer } from 'node:http'
const server = createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain' })
  res.end('ok')
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const liveUrl = `http://127.0.0.1:${server.address().port}/ok`
const keyOf = (u) => String(u).replace(/#.*$/, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 120)
const planted = JSON.parse(await readFile(join(dir, 'fetch-failures.json'), 'utf8').catch(() => '{"failures":{}}'))
planted.failures[keyOf(liveUrl)] = {
  url: liveUrl,
  host: '127.0.0.1',
  lastFailedAt: new Date(Date.now() - 11 * 60 * 1000).toISOString(),
  count: 1,
  millis: 9000,
  attempts: []
}
await writeFile(join(dir, 'fetch-failures.json'), JSON.stringify(planted, null, 2))
const healed = await timed(tool, liveUrl)
const afterHeal = JSON.parse(await readFile(join(dir, 'fetch-failures.json'), 'utf8').catch(() => '{"failures":{}}'))
server.close()

const rows = [
  ['first call (cold, really walks the ladder)', first.seconds, first.res.cached === true ? 'CACHED?!' : `${first.res.attempts.length} attempts`],
  ['second call, same URL', second.seconds, second.res.cached ? 'cached failure' : 'NOT CACHED'],
  ['different path, same host', other.seconds, other.res.cached ? 'CACHED (over-blocking!)' : `${other.res.attempts.length} attempts`],
  ['same URL after the 10 min TTL', expired.seconds, expired.res.cached ? 'STILL CACHED' : `${expired.res.attempts.length} attempts`],
  ['expired entry, host works again', healed.seconds, healed.res.ok ? `ok via ${healed.res.via}` : 'FAILED']
]
console.log('url:', URL_DEAD, 'timeoutMs:', PER)
for (const [label, seconds, note] of rows) console.log(`  ${label.padEnd(44)} ${seconds.toFixed(2).padStart(7)}s  ${note}`)

const saved = first.seconds - second.seconds
const checks = [
  ['failure recorded in sidecar', entries.length === 1],
  ['first call really failed hard', first.res.ok === false && first.seconds > 2],
  ['second call served from memory', second.res.cached === true && second.seconds < 0.5],
  ['second call saves the ladder time', second.seconds < first.seconds / 3],
  ['different path is not blocked by the cache', other.res.cached !== true],
  ['expired entry is retried', expired.res.cached !== true],
  ['cached reply says when to retry', Number(second.res.retryAfterMs) > 0 && Number(second.res.retryAfterMs) <= 10 * 60 * 1000],
  ['an expired entry does not block a working URL', healed.res.ok === true],
  ['the healed URL forgets its failure', !(afterHeal.failures && afterHeal.failures[keyOf(liveUrl)])],
  ['no fake success', second.res.ok === false]
]
let failed = 0
for (const [name, ok] of checks) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) failed++
}
console.log(`saved ${saved.toFixed(2)}s on the retry (${first.seconds > 0 ? (first.seconds / Math.max(second.seconds, 0.001)).toFixed(0) : '?'}x)`)
await rm(dir, { recursive: true, force: true })
if (failed) {
  console.log(`FAILED: ${failed} check(s)`)
  process.exit(1)
}
console.log('PASS: fetch failure memory')
