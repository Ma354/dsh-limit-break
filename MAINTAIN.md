# MAINTAIN.md — 维护与进化 runbook

这份文件是给"下一个我"看的。每轮维护从一个冷启动的会话开始，不共享上一轮的上下文；
能指望的只有三样东西：**这个仓库**、**`D:\dsh-data\home\memory\facts.json`**、**`tools/maintain.py`**。

方法沿用 2026-10-20 那两轮自测：**测极限 → 突破 → 进化插件 → 同步线上 → 记录**。

---

## 0. 开工（30 秒）

```bash
cd D:/deepseek-harness/default-workspace/capability-demo/plugin/dsh-limit-break
PY="C:/Users/lenovo/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/python/python.exe"
$PY tools/maintain.py status      # 我发布的版本在哪、PR 合没合、装的是不是 latest
$PY tools/maintain.py probe       # 重新测一遍环境，和上次的 baseline 做 diff
$PY tools/maintain.py verify      # 契约测试：5 个工具是否仍然注册成功
```

先读 `facts.json` 里 `topic` 为 `maintenance` / `release` 的条目，再看 `probe` 的
`diffs_vs_previous`——**diff 就是这一轮的线索**。若是空数组，说明环境没动，
那就去 backlog 里挑一条，而不是假装有进展。

## 1. 测极限

`probe` 覆盖：CPU 线程/GFLOPS、GPU 名称/显存/蒙特卡洛吞吐、nvidia-smi、CuPy 可用性、
PowerPoint COM、LibreOffice Kit、5 条网络探针、磁盘余量。

读数落在 `C:\Users\lenovo\.dsh\memory\baseline-limit-break.json`，下一轮自动 diff。

**不要**只跑 probe 就交差。probe 的用途是发现"世界变了"（驱动升级、被封的域名活了、
CUDA 掉了、Office 卸载了），任何一项变化都可能是一个新的突破点。

## 2. 找缺口

按优先级从这几个来源取一条：

1. `probe` 的 diff（环境变了 = 新机会或新故障）
2. 用户当轮的原话（最高优先级，永远压倒自己的选题）
3. 本文件末尾的 **Backlog**
4. npm / GitHub 上别人的 issue（如果有）

一轮只做**一件**。做不完的写回 Backlog，不要开第二战线。

## 3. 突破

规则和上次一样，也是这个项目唯一值得守的规则：

> 结论必须是**测出来的**，不是形容出来的。

- 能做就写脚本，用数字说话（秒、字节、比率、像素差、样本/秒）
- 做不到也写下来：**缺什么**（缺编译器？缺凭据？缺物理接口？），以及**试过什么**
- 失败要留在 Backlog 里，注明失败原因；下一轮不要重复同一个死胡同

## 4. 进化

改代码 → 跑 `verify` → 语义化版本：

| 改动 | 版本 |
| --- | --- |
| 新工具 / 不兼容改动 | minor（1.x.0） |
| 修 bug、改默认值、加参数 | patch（1.0.x） |

同步两处副本（**仓库里的**才是源头）：

```
capability-demo/plugin/dsh-limit-break/            <- 改这里
D:\dsh-data\home\profiles\desktop\node_modules\dsh-limit-break\   <- 复制到这里才生效
```

只需重启 DSH 应用才加载新代码；**不要**替用户重启 GUI，告诉他自己重启。

## 5. 同步线上

```bash
# npm（先看 http 状态，409 是 staged publishing 残留，解法：把 latest 指走再发）
export PATH="/c/Users/lenovo/AppData/Local/nodejs:$PATH"
npm publish --no-fund --no-audit
npm view dsh-limit-break version dist-tags

# git（这台机器到 GitHub 会间歇性 Recv failure，重试 3 次再判断）
git add -A && git commit -m "..." && git push
```

市场目录（awesome-dsh-plugin）**不是自动同步的**：条目文件合并后才出现在市场里。
- 列表没上线时，先看 PR 状态；不要重复提同一个 PR
- 版本升级不需要重提条目（条目只指向仓库 URL），只有换包名/换分类才需要

## 6. 记录

- `facts.json` 追加/更新 1–3 条，`topic` 用 `maintenance` 或 `release`
- 更新 `CHANGELOG.md` 的 `Unreleased`
- `baseline-limit-break.json` 由 probe 自动覆盖，不用手改

---

## 每轮的完成标准（DoD）

一轮算做完，必须同时满足：

1. `status` 里 `problems` 数组的每一条，要么被修掉，要么被解释成"不在我控制内"
2. 有一句可以用数字反驳的话（"X 从 A 变成 B"）
3. 代码有改动 → 版本升了 + `verify` PASS + npm 上是新版本
4. 没有代码改动 → `CHANGELOG.md` 记一条"本轮无发布，原因：…"
5. 有失败 → Backlog 里有一行带原因的记录

**最差的结果不是失败，是一轮结束后什么都没变、也没写下来。**

---

## Backlog（按 2026-10-22 20:10 的真实状态）

- [x] **1.5.0 已上线**（2026-10-22T12:20:22Z）：npm `latest` = `1.5.0`（用户 OTP 发布），GitHub
      `origin/main` = `cd5f409`（github.com:443 被掐，改用 api.github.com + GraphQL 推送），
      desktop profile 已从 1.2.1 升到 **1.5.0**，`verify` PASS。四工具 ABI 未变，老会话不会 brick。
- [ ] 基准里剩下的 miss（“monte carlo pi benchmark on the CPU”）是 `bench.cpu_suite` 与
      `bench.gpu_monte_carlo` 的真实歧义；再往上做要引入上下文/近义词表，性价比低，当作已知上限。
- [x] desktop profile 版本漂移已消（1.2.1 → 1.5.0）。以后每次发布都跟一条
      `dsh.cmd plugin --profile desktop add dsh-limit-break@<version>`。

- [x] **1.2.0 已上线**（2026-10-20T12:02:52Z）：npm `latest` = `1.2.0`，GitHub `origin/main` =
      `fd844a4`，`verify` PASS，`test_plugin.mjs` 6/6 PASS。用户 20:04 完成了 OTP 发布和推送。
      `env.node_npm` 与 `release.dsh-limit-break` 两条事实已回写。
- [x] 旧定时任务 `schedule-803cdbdc`（会话 5133bee1）已由用户在面板删除；`storages/schedule.json`
      里只剩 `schedule-0b6c60ea`（hello world）和新的 `schedule-b3675d28`。无需再处理。
- [x] 市场条目**已合并上线**（2026-10-22 之后）：`awesome-dsh-plugin/awesome-dsh-plugin#8296`
      merged，条目文件 `data/plugins/Ma354__dsh-limit-break.yml`（category: memory）；
      2026-10-27 01:06 的 `#9282`（加 storefront icon，`assets/icon-180.png`）也已 merged。
      `maintain.py status` 现在 `listed_in_market: true`、`problems: []`。不要再提新 PR。
- [ ] 本地仓库落后远端：本地 `94eafb7`，远端 `b84161a`（用户 10-25 推了 icon 等）；
      `github.com:443` 被掐，`git fetch` 连试 3 次全失败。等网络恢复后跑
      `git fetch origin && git reset --hard origin/main`。在此之前文档改动走
      `..\_maintain\ghpush.mjs`（GraphQL，按远端 head 建提交，内容全量替换，不受分叉影响）。
- [ ] npm 上还挂着占位包 `0.0.0-stage`（`stub: true`）。`npm deprecate` 也要 OTP（本轮 EOTP 失败）；
      用户一条命令即可：`npm deprecate dsh-limit-break@0.0.0-stage "placeholder - use 1.2.0"`。
- [ ] `1.0.0` 是无元数据的旧包体（author/repository 都不在）。同样一条 `npm deprecate` 可清掉噪音（需 OTP）。
- [x] `facts.json` 的 `env.gpu` 已改写成“GPU compute throughput is recorded separately in
      bench.gpu_monte_carlo and bench.render”（2026-10-21 的回写），陈旧描述不再存在。
- [x] 插件工具对**已经打开的会话**不可见：已在 README「Known limits」第 1 条写明
      （tool list 是 per-session 快照，插件侧修不了）。事实 `harness.plugin-tool-visibility` 有实测。
- [ ] `resilient_fetch` 目前按"主机名别名"降级，可以继续加：`--resolve` 到已知 IP、
      IPv6 优先、以及把成功路径写回记忆库（现在是只读阶梯）。
- [x] **`memory_save` 的并发写已有自动化覆盖**（1.6.0，2026-10-29）：`tools/concurrency-selftest.mjs`
      起 N 个独立进程同时写同一个 store，再读回数存活条数，另测“陈旧锁被接管”。同机 8 进程 × 6 次 × 3 轮：
      修复前丢 16–17/48、且最多 25/48 直接 `EPERM`（rename 输家）；加 `O_EXCL` 锁后 0 丢 0 失败，
      12 × 5 × 4 = 240 次同样全存活。改了 `memory_save` 的写入路径就跑一遍它（约 20 s）。
