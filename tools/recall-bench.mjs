/**
 * Recall benchmark: how often does memory_recall's ranking put the intended fact first?
 *
 * It reads the live store (read-only) and runs a fixed query set whose expected ids were
 * written by hand from the fact statements. Hit@1 is the number that matters: an agent asks
 * one question and reads the top answer. Run: node tools/recall-bench.mjs [--json]
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { rankFacts } from '../lib/index.js'

const STORE = join(homedir(), '.dsh', 'memory', 'facts.json')

/** query -> expected fact id. Phrased the way a later session actually asks. */
const CASES = [
  ['which CPU is in this machine', 'env.cpu'],
  ['how many cores does the processor have', 'env.cpu'],
  ['how much VRAM does the GPU have', 'env.gpu'],
  ['what python version is bundled', 'env.python'],
  ['where is cupy installed', 'gpu.cupy_installed'],
  ['what is the DSH home directory', 'env.dsh_home'],
  ['which node and npm versions are installed', 'env.node_npm'],
  ['monte carlo pi benchmark on the CPU', 'bench.cpu_suite'],
  ['how long did the ray tracer take at 1080p', 'bench.render'],
  ['GPU monte carlo speedup over CPU', 'bench.gpu_monte_carlo'],
  ['how long did the batch of four pipelines run', 'batch.summary'],
  ['why is wikipedia blocked by SNI', 'net.wikipedia_access'],
  ['is github push failing', 'network.github-git'],
  ['deck rating for physical world execution', 'deck.ratings'],
  ['how many slides in the round 2 deck', 'deck.round2'],
  ['which tools does the memory plugin provide', 'tool.limit_break_plugin'],
  ['weekly maintenance objective for the plugin', 'task.limit-break.maintenance'],
  ['what is the latest npm release', 'release.dsh-limit-break'],
  ['why was memory_prune removed', 'tool.memory_prune'],
  ['what renders the film with numpy', 'film.wotaiyang']
]

const raw = JSON.parse(await readFile(STORE, 'utf8'))
const facts = (raw.facts || []).filter(Boolean)

let hit1 = 0
let hit3 = 0
let rr = 0
const misses = []
for (const [query, want] of CASES) {
  const ranked = rankFacts(facts, query).map((row) => row.fact.id)
  const at = ranked.indexOf(want)
  if (at === 0) hit1 += 1
  if (at >= 0 && at < 3) hit3 += 1
  if (at >= 0) rr += 1 / (at + 1)
  if (at !== 0) misses.push({ query, want, at: at < 0 ? 'miss' : at + 1, top: ranked.slice(0, 3) })
}

const report = {
  store: STORE,
  facts: facts.length,
  cases: CASES.length,
  hit_at_1: +(hit1 / CASES.length).toFixed(3),
  hit_at_3: +(hit3 / CASES.length).toFixed(3),
  mrr: +(rr / CASES.length).toFixed(3),
  misses
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2))
} else {
  console.log(`facts=${report.facts} cases=${report.cases} hit@1=${report.hit_at_1} hit@3=${report.hit_at_3} mrr=${report.mrr}`)
  for (const miss of report.misses) {
    console.log(`  miss: "${miss.query}" wanted ${miss.want} got rank ${miss.at} -> ${miss.top.join(', ')}`)
  }
}
