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
$PY tools/maintain.py verify      # 契约测试：4 个工具是否仍然注册成功
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

## Backlog（按 2026-10-20 结束时的真实状态）

- [ ] **1.2.0 待上线**：commit `69b726f` 只在本地。`git push origin main` 连续 3 次失败
      （github.com:443 连接重置 / 连不上；api.github.com 仍 200，所以是 SNI 级封锁）。
      `npm publish` 需要用户的 OTP，本轮未执行。恢复网络后跑：
      `git push origin main && npm publish`（仓库与 `profiles/desktop/node_modules/dsh-limit-break`
      两份副本已同步且 `verify` PASS）。
- [ ] 旧定时任务 `schedule-803cdbdc`（会话 5133bee1）跨会话删不掉（`schedule_not_found`），
      已从 `storages/schedule.json` 摘行；运行中的 hub 会从内存回写，**重启后才彻底消失**，
      或由用户在 5133bee1 的定时任务面板手动删。INDEX.md 里留了自删提示。
- [ ] 市场条目 PR `awesome-dsh-plugin/awesome-dsh-plugin#8296` 仍是 open；合并前 `status` 会一直报
      `market listing not live yet`。找合并节奏，不要重提。
- [ ] npm 上还挂着占位包 `0.0.0-stage`（`stub: true`）。可以考虑 `npm deprecate dsh-limit-break@0.0.0-stage "placeholder"`。
- [ ] `1.0.0` 是无元数据的旧包体（author/repository 都不在）。可以 deprecate 掉，减少噪音。
- [ ] `facts.json` 里 `env.gpu` 仍写着"no GPU compute benchmark was run"——已过时（GPU 实测 54.3×）。
- [ ] 插件工具对**已经打开的会话**不可见：插件在 `19:07:45` mount 成功（4 个工具都在），
      但那个时间点之前启动的会话，工具集里没有 `memory_*`。新会话才有。
      值得查清：是工具清单在会话创建时快照，还是 hub 与 agent 进程的工具注册面不同。
      查清后要么修（如果能在插件侧解决），要么写进 README 作为已知限制。
- [ ] `resilient_fetch` 目前按"主机名别名"降级，可以继续加：`--resolve` 到已知 IP、
      IPv6 优先、以及把成功路径写回记忆库（现在是只读阶梯）。
- [ ] 没有任何自动化测试覆盖 `memory_save` 的并发写。单进程够用，多进程未验证。
