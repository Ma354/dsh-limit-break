/**
 * Self-test for memory_prune. Run: node tools/prune-selftest.mjs
 *
 * It builds a store with one of each redundancy shape, checks that the dry run changes
 * nothing, applies, and checks that a second run is a no-op. Exit code 1 on any mismatch.
 */
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pruneStore } from '../lib/index.js'

const dir = await mkdtemp(join(tmpdir(), 'limit-break-prune-'))
const facts = [
  { id: 'bench.latency_a', statement: 'Wikipedia via SNI api.wikimedia.org answers in 0.43 s', value: 0.43, unit: 's', topic: 'network' },
  { id: 'bench.latency_b', statement: 'Wikipedia via SNI api.wikimedia.org answered in 0.43 s', value: 0.43, unit: 's', topic: 'network' },
  { id: 'env.approval', statement: 'The approval policy changed in this session to never', topic: 'env' },
  { id: 'dup.a', statement: 'GIL means threads do not help CPU-bound Python', tags: ['python'] },
  { id: 'dup.b', statement: 'GIL means threads do not help CPU-bound Python', value: 1, details: { who: 'dynamodb' }, source: 'bench' },
  { id: 'net.pos', statement: 'Wikipedia is reachable from this host via SNI api.wikimedia.org', topic: 'network' },
  { id: 'net.neg', statement: 'Wikipedia is unreachable from this host', topic: 'network' },
  { id: 'stable', statement: 'crypto dyn32_b pow-32 measures 0.051 ms/sign', value: 0.051, unit: 'ms/sign', topic: 'crypto' }
]

await writeFile(
  join(dir, 'facts.json'),
  JSON.stringify({ schema_version: 1, kind: 'agent-memory-store', facts }, null, 2),
  'utf8'
)
const storeFile = join(dir, 'facts.json')
const hash = async () => createHash('sha256').update(await readFile(storeFile)).digest('hex')

const before = await hash()
const plan = await pruneStore(dir, {})
assert.equal(plan.ok, true)
assert.equal(plan.mode, 'plan')
assert.equal(plan.changed, false)
assert.deepEqual(plan.candidates.map((c) => c.id).sort(), ['dup.a', 'env.approval'])
assert.equal(plan.warnings.length >= 2, true)
assert.equal(plan.warnings.some((w) => w.rule === 'shared-numbers'), true)
assert.equal(plan.warnings.some((w) => w.rule === 'contradiction'), true)
assert.equal(await hash(), before, 'dry run must not touch facts.json')

const applied = await pruneStore(dir, { apply: true })
assert.equal(applied.mode, 'applied')
assert.equal(applied.changed, true)
assert.equal(applied.archived, 2)
assert.equal(applied.kept, 6)
assert.equal(applied.backupFile.includes('facts.json.bak-'), true)

const kept = JSON.parse(await readFile(storeFile, 'utf8'))
assert.equal(kept.facts.length, 6)
assert.equal(kept.facts.some((f) => f.id === 'env.approval' || f.id === 'dup.a'), false)
assert.equal(kept.facts.some((f) => f.id === 'dup.b'), true, 'the richer duplicate must survive')

const archive = JSON.parse(await readFile(applied.archiveFile, 'utf8'))
assert.equal(archive.length, 2)
assert.equal(archive.every((e) => e.archivedAt && e.rule && e.fact), true)

const again = await pruneStore(dir, { apply: true })
assert.equal(again.archived, 0)
assert.equal(again.changed, false)
const archiveAgain = JSON.parse(await readFile(applied.archiveFile, 'utf8'))
assert.equal(archiveAgain.length, 2, 'second run must not grow the archive')

const leftovers = (await readdir(dir)).filter((name) => name.endsWith('.tmp'))
assert.deepEqual(leftovers, [], 'no temp files left behind')

console.log('prune selftest: ok')
