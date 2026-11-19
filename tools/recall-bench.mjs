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

/**
 * Held-out set: written after the 1.9.0 ranking change and never used to pick it, so
 * the two numbers answer different questions — CASES tracks regressions on tuned
 * phrases, HOLDOUT says whether freshly worded questions find their fact.
 */
const HOLDOUT = [
  ['what GPU does this laptop have', 'env.gpu'],
  ['what happens if I edit config live with HMR', 'dsh.hmr_live_config_edit'],
  ['why do cookies get 431 errors in the desktop app', 'dsh.cookie_431_rootfix'],
  ['how does the film use raymarching in numpy', 'film.wotaiyang'],
  ['what is the route cache TTL', 'plugin.fetch_route_cache'],
  ['can the browser post to github', 'env.browser.github_posting'],
  ['what does the weekly maintenance schedule do', 'task.limit-break.maintenance'],
  ['how many samples per second did the GPU do', 'bench.gpu_monte_carlo'],
  ['what did the disk cleanup free', 'env.disk_cleanup_20261029']
]

const raw = JSON.parse(await readFile(STORE, 'utf8'))
const facts = (raw.facts || []).filter(Boolean)

function evaluate(cases) {
  let hit1 = 0
  let hit3 = 0
  let rr = 0
  const misses = []
  for (const [query, want] of cases) {
    const ranked = rankFacts(facts, query).map((row) => row.fact.id)
    const at = ranked.indexOf(want)
    if (at === 0) hit1 += 1
    if (at >= 0 && at < 3) hit3 += 1
    if (at >= 0) rr += 1 / (at + 1)
    if (at !== 0) misses.push({ query, want, at: at < 0 ? 'miss' : at + 1, top: ranked.slice(0, 3) })
  }
  return {
    cases: cases.length,
    hit_at_1: +(hit1 / cases.length).toFixed(3),
    hit_at_3: +(hit3 / cases.length).toFixed(3),
    mrr: +(rr / cases.length).toFixed(3),
    misses
  }
}

const report = {
  store: STORE,
  facts: facts.length,
  tuned: evaluate(CASES),
  holdout: evaluate(HOLDOUT)
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2))
} else {
  console.log(`facts=${report.facts}`)
  for (const part of ['tuned', 'holdout']) {
    const r = report[part]
    console.log(`${part}: cases=${r.cases} hit@1=${r.hit_at_1} hit@3=${r.hit_at_3} mrr=${r.mrr}`)
    for (const miss of r.misses) {
      console.log(`  miss: "${miss.query}" wanted ${miss.want} got rank ${miss.at} -> ${miss.top.join(', ')}`)
    }
  }
}
