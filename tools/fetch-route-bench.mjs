/**
 * Route-cache probe: does remembering which rung of the fetch ladder works actually pay?
 *
 * `resilient_fetch` walks direct -> alternates -> curl IPv6 -> curl IPv4. On a host whose direct
 * request is blocked (SNI-keyed), every call used to rediscover that by burning a timeout on rung 1
 * before rung 4 answered. Since 1.7.0 a non-direct success is stored as `network.route.<host>` and
 * the next call starts at that rung.
 *
 * This measures one blocked host: cold call (cache miss) vs warm calls (cache hit), printing
 * attempts and seconds, then checks the store holds the route fact.
 *
 * Run: node tools/fetch-route-bench.mjs [url] [timeoutMs]
 */
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const LIB = fileURLToPath(new URL('../lib/index.js', import.meta.url))
const url = process.argv[2] || 'https://en.wikipedia.org/wiki/Monte_Carlo_method'
const timeoutMs = Number(process.argv[3] || 6000)
const host = new URL(url).hostname

const { apply } = await import(pathToFileURL(LIB).href)
const mod = await import(pathToFileURL(LIB).href)
const tools = new Map()
const ctx = {
  effect(fn) {
    fn()
  },
  tools: {
    register(tool) {
      tools.set(tool.name, tool)
      return () => tools.delete(tool.name)
    }
  }
}
const storeDir = join(await mkdtemp(join(tmpdir(), 'limit-break-route-')), 'memory')
apply(ctx, { storeDir })
const fetchTool = tools.get('resilient_fetch')

const call = async (label) => {
  const started = Date.now()
  const result = await fetchTool.execute({ url, timeoutMs })
  const seconds = +((Date.now() - started) / 1000).toFixed(2)
  console.log(
    `${label}: ok=${result.ok} via=${result.via || '-'} route=${result.route || '-'} attempts=${(result.attempts || []).map((a) => a.via).join('>')} seconds=${seconds}`
  )
  return { result, seconds }
}

const cold = await call('cold')
if (!cold.result.ok || cold.result.via === 'direct') {
  console.log('SKIP: direct fetch to this host works today, so there is no failed rung to remember')
  process.exit(0)
}
const warm1 = await call('warm1')
const warm2 = await call('warm2')

const store = JSON.parse(await readFile(join(storeDir, 'facts.json'), 'utf8'))
const fact = store.facts.find((row) => row && row.id === `network.route.${host.toLowerCase()}`)
console.log(`route fact: ${fact ? JSON.stringify(fact.details) : 'MISSING'}`)

// Self-heal: if a host has a remembered route but a direct request now works, the stale route
// must be dropped instead of being trusted forever.
const healUrl = 'https://api.wikimedia.org/core/v1/wikipedia/en/page/Monte_Carlo_method'
const healHost = new URL(healUrl).hostname
const seeded = await mod.loadStore(storeDir)
seeded.facts.push({
  id: `network.route.${healHost}`,
  topic: 'network',
  statement: 'seeded stale route for the self-heal check',
  details: { host: healHost, via: 'alternate-host', url: healUrl, observedAt: new Date().toISOString(), millis: null },
  source: 'bench',
  timestamp: new Date().toISOString(),
  tags: ['network']
})
await mod.saveStore(storeDir, seeded)
const heal = await fetchTool.execute({ url: healUrl, timeoutMs })
const afterHeal = await mod.loadStore(storeDir)
const healDropped = !afterHeal.facts.some((row) => row && row.id === `network.route.${healHost}`)
console.log(`self-heal: ok=${heal.ok} via=${heal.via} route=${heal.route} factDropped=${healDropped}`)

const checks = [
  ['cold used a fallback rung', cold.result.via !== 'direct' && cold.result.attempts.length > 1],
  ['warm call starts at the remembered rung', warm1.result.attempts.length === 1 && warm1.result.attempts[0].via === cold.result.via],
  ['warm call is at least 2x faster', warm1.seconds * 2 <= cold.seconds],
  ['warm call is stable', warm2.result.via === cold.result.via && warm2.result.route === 'reused'],
  ['route fact written', Boolean(fact) && fact.details && fact.details.via === cold.result.via],
  ['stale route dropped once direct works', heal.ok && heal.via === 'direct' && heal.route === 'dropped' && healDropped]
]
let failed = 0
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`)
  if (!ok) failed += 1
}
console.log(`cold ${cold.seconds}s -> warm ${warm1.seconds}s / ${warm2.seconds}s (${(cold.seconds / Math.max(warm1.seconds, 0.01)).toFixed(1)}x faster)`)
process.exit(failed ? 1 : 0)
