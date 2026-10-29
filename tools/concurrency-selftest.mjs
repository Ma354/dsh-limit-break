/**
 * Concurrency probe: do simultaneous memory_save calls lose facts?
 *
 * memory_save is load -> mutate -> save (tmp file + rename). Without a lock, two processes that
 * load the same store each write their own version back and the later rename wins, so the other
 * process' fact disappears. On Windows the losing writer can even fail the rename outright
 * (EPERM: the target is open in the other process).
 *
 * This test makes the damage visible in plain numbers: N worker processes each attempt M saves,
 * then the store is read back and the surviving ids are counted.
 *
 * Run: node tools/concurrency-selftest.mjs [workers] [saves-per-worker] [rounds]
 */
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readdir, readFile, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const LIB = fileURLToPath(new URL('../lib/index.js', import.meta.url))
const workers = Number(process.argv[2] || 8)
const perWorker = Number(process.argv[3] || 6)
const rounds = Number(process.argv[4] || 3)

const worker = `
import(process.env.LIB).then(async (m) => {
  const tools = new Map()
  const ctx = {
    effect(fn) { fn() },
    tools: { register(d) { tools.set(d.name, d); return () => tools.delete(d.name) } }
  }
  m.apply(ctx, { storeDir: process.env.STORE_DIR })
  const save = tools.get('memory_save')
  const w = Number(process.env.WORKER)
  let ok = 0
  const errors = []
  for (let i = 0; i < ${perWorker}; i += 1) {
    try {
      const res = await save.execute({ id: 'race.w' + w + '_' + i, statement: 'concurrent write w' + w + ' i' + i + ' from a separate process' })
      if (res && res.ok) ok += 1
      else errors.push((res && res.code ? res.code : 'not-ok') + ' ' + JSON.stringify(res))
    } catch (e) {
      const detail = [e && e.code, e && e.syscall, e && e.path, e && e.message].filter(Boolean).join(' | ')
      errors.push(detail || String(e))
    }
  }
  console.log('RESULT ' + JSON.stringify({ worker: w, ok, errors }))
  process.exit(0)
}).catch((e) => { console.error(e); process.exit(1) })
`

const results = []
for (let round = 1; round <= rounds; round += 1) {
  const dir = await mkdtemp(join(tmpdir(), 'limit-break-race-'))
  const storeDir = join(dir, 'memory')
  const replies = await Promise.all(
    Array.from({ length: workers }, (_, w) =>
      exec(process.execPath, ['--input-type=module', '-e', worker], {
        env: { ...process.env, LIB: `file:///${LIB.replaceAll('\\', '/')}`, STORE_DIR: storeDir, WORKER: String(w) },
        timeout: 120000
      }).then((r) => r.stdout)
    )
  )
  const reports = replies.flatMap((out) =>
    out.split('\n').filter((line) => line.startsWith('RESULT ')).map((line) => JSON.parse(line.slice(7)))
  )
  const succeeded = reports.reduce((sum, r) => sum + r.ok, 0)
  const errorCodes = reports.flatMap((r) => r.errors)
  const store = JSON.parse(await readFile(join(storeDir, 'facts.json'), 'utf8'))
  const kept = store.facts.filter((f) => f && /^race\.w/.test(String(f.id))).length
  const leftover = (await readdir(storeDir)).filter((name) => name !== 'facts.json' && name !== 'plugin-load.log')
  results.push({ round, attempted: workers * perWorker, succeeded, kept, lost: succeeded - kept, failed: workers * perWorker - succeeded, errorCodes, leftover })
  await rm(dir, { recursive: true, force: true })
}

for (const r of results) {
  const codes = r.errorCodes.length ? ` (errors: ${[...new Set(r.errorCodes)].join(',')})` : ''
  console.log(`round ${r.round}: attempted ${r.attempted}, save-ok ${r.succeeded}, kept ${r.kept}, lost ${r.lost}${codes}${r.leftover.length ? ` leftover: ${r.leftover.join(',')}` : ''}`)
}
// A writer that dies while holding the lock must not wedge the store forever: a lock older than
// the stale window is stolen, and the save goes through.
const staleDir = await mkdtemp(join(tmpdir(), 'limit-break-stale-'))
const staleStore = join(staleDir, 'memory')
await mkdir(staleStore, { recursive: true })
await writeFile(join(staleStore, '.facts.lock'), '999999 2020-01-01T00:00:00.000Z\n')
const past = new Date(Date.now() - 60000)
await utimes(join(staleStore, '.facts.lock'), past, past)
const staleOut = await exec(process.execPath, ['--input-type=module', '-e', worker], {
  env: { ...process.env, LIB: `file:///${LIB.replaceAll('\\', '/')}`, STORE_DIR: staleStore, WORKER: '99' },
  timeout: 120000
})
const stale = JSON.parse(staleOut.stdout.split('\n').filter((line) => line.startsWith('RESULT ')).map((line) => line.slice(7))[0])
const staleStoreJson = JSON.parse(await readFile(join(staleStore, 'facts.json'), 'utf8'))
const staleKept = staleStoreJson.facts.filter((f) => f && /^race\.w99/.test(String(f.id))).length
const staleLeftover = (await readdir(staleStore)).filter((name) => name !== 'facts.json' && name !== 'plugin-load.log')
await rm(staleDir, { recursive: true, force: true })
console.log(`stale lock: save-ok ${stale.ok}/${perWorker}, kept ${staleKept}, leftover ${staleLeftover.length ? staleLeftover.join(',') : 'none'}`)

const lost = results.map((r) => r.lost)
const failed = results.map((r) => r.failed)
const worstLost = Math.max(...lost)
const avgLost = +(lost.reduce((a, b) => a + b, 0) / lost.length).toFixed(1)
const worstFailed = Math.max(...failed)
console.log(`${workers} workers x ${perWorker} saves x ${rounds} rounds -> lost facts: worst ${worstLost}, average ${avgLost}; failed saves: worst ${worstFailed}`)
const staleBad = stale.ok !== perWorker || staleKept !== perWorker || staleLeftover.length > 0
if (worstLost > 0 || worstFailed > 0 || staleBad) {
  console.log('FAIL: concurrent saves lose facts or fail outright')
  process.exit(1)
}
console.log('PASS: every concurrent save survived and none failed')
