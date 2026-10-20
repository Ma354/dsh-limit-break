# PR 文案（提给你的 GitHub 账号用）

**仓库**：`awesome-dsh-plugin/awesome-dsh-plugin`
**改动**：新增一个文件 `data/plugins/<owner>__dsh-limit-break.yml`（只加这一个文件，不要动 README）
**标题**：`Add dsh-limit-break — durable memory + fetch ladder`

---

## 正文

Adds `dsh-limit-break`, four tools for the harness:

- `memory_recall` / `memory_save` — a durable fact store at `$DSH_HOME/memory/facts.json`, so a fresh session can read what an earlier one measured. In a controlled A/B (two brand-new zero-context agents, same five questions) the one with the store answered 5/5 and the control 0/5.
- `resilient_fetch` — a four-rung ladder: fetch → IPv6 → IPv4 → a sibling hostname of the same service whose certificate still verifies. It exists because "this host is unreachable" is usually a hostname-keyed block: on one network, same edge IP, 75 s apart, `api.wikimedia.org` returned 200 while `en.wikipedia.org` was reset. The tool reports which rung answered, so a failure names the layer.
- `memory_stats` — where the store is, how many facts, how big.

Details a reviewer will want checked:

- `package.json` declares `dsh.bundle.patch` and ships `cordis.patch.yml`; installs with `dsh plugin add dsh-limit-break`.
- Zero dependencies, no import-time side effects, no network at import. Every tool returns an error object instead of throwing.
- No certificate verification is disabled and no proxy impersonates the origin — the fourth rung only uses hostnames the service itself publishes.
- Nothing is uploaded anywhere; the store is one local JSON file.
- The four tools are counted in `lib/index.js` — the README says four, and there are four.

Category: `memory` (the network ladder is the smaller half; happy to move it if you disagree).

---

## 提交前你要做的三件事

1. 把 `dsh-limit-break/` 推到一个**公开仓库**（名字建议就叫 `dsh-limit-break`）。
2. 改 `data/plugins/` 里那个文件名与内容里的 `YOUR-GITHUB-USER`，改成你的账号名。
3. （强烈建议）发 npm：`npm publish`。不发也能收录，但用户会走源码构建；包名 `dsh-limit-break` 目前**未被占用**（registry 返回 404）。

首次提 PR 记得先在 `package.json` 里填上 `repository`、`author` 和真实版权人名字（LICENSE 里现在是占位符）。
