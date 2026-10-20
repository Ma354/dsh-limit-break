#!/usr/bin/env python3
"""dsh-limit-break maintenance kit.

One script, three verbs. Every verb prints something a human can read and
writes JSON next to the memory store so the next round can diff against it.

    python tools/maintain.py status     # where the plugin stands, right now
    python tools/maintain.py probe      # re-measure the environment, diff vs last
    python tools/maintain.py verify     # contract test + install sanity

The loop this belongs to (see MAINTAIN.md):
    probe  -> find a limit that moved
    break  -> prove it with a measurement, not an opinion
    evolve -> turn it into a tool or a fix
    publish-> version, npm, git, listing
    record -> facts.json + CHANGELOG
"""
from __future__ import annotations

import json
import os
import platform
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path

HOME = Path(os.environ.get("DSH_HOME", Path.home() / ".dsh"))
TZ = timezone(timedelta(hours=8))
PKG = "dsh-limit-break"
REPO = "Ma354/dsh-limit-break"
LIST_REPO = "awesome-dsh-plugin/awesome-dsh-plugin"
HERE = Path(__file__).resolve().parent.parent          # .../dsh-limit-break
PROFILE = HOME / "profiles" / "desktop"
STORE = HOME / "memory"
BASELINE = STORE / "baseline-limit-break.json"
GPU_LIBS = Path(r"D:\deepseek-harness\default-workspace\capability-demo\breakthrough\gpu\libs")


def now() -> str:
    return datetime.now(TZ).isoformat(timespec="seconds")


def get(url: str, timeout: float = 12.0):
    """-> (http_code, seconds, body_text). Never raises."""
    t0 = time.time()
    req = urllib.request.Request(url, headers={"User-Agent": f"{PKG}-maintain/1"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, time.time() - t0, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, time.time() - t0, ""
    except Exception as e:                                   # noqa: BLE001
        return f"ERR:{type(e).__name__}", time.time() - t0, ""


def get_json(url: str):
    code, secs, body = get(url)
    if isinstance(code, int) and 200 <= code < 300:
        try:
            return code, secs, json.loads(body)
        except Exception:                                    # noqa: BLE001
            pass
    return code, secs, None


def sh(cmd: list[str], timeout: float = 30.0) -> str:
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return (p.stdout or "").strip() or (p.stderr or "").strip()
    except Exception as e:                                   # noqa: BLE001
        return f"ERR:{type(e).__name__}"


# --------------------------------------------------------------------------- status
def cmd_status() -> int:
    out: dict = {"checked_at": now(), "problems": []}

    local = {}
    try:
        local = json.loads((PROFILE / "node_modules" / PKG / "package.json").read_text(encoding="utf-8"))
    except Exception:                                        # noqa: BLE001
        out["problems"].append("installed copy missing under the profile")
    out["installed_version"] = local.get("version")
    out["installed_has_bundle"] = bool(local.get("dsh", {}).get("bundle"))

    prof = {}
    try:
        prof = json.loads((PROFILE / "package.json").read_text(encoding="utf-8"))
    except Exception:                                        # noqa: BLE001
        pass
    bundles = prof.get("dsh", {}).get("profile", {}).get("bundles", [])
    out["in_dependencies"] = prof.get("dependencies", {}).get(PKG)
    out["in_bundles"] = PKG in bundles
    out["bundle_position"] = bundles.index(PKG) if PKG in bundles else None
    if not out["in_bundles"]:
        out["problems"].append("not listed in dsh.profile.bundles -> the app will never load it")

    try:
        repo_ver = json.loads((HERE / "package.json").read_text(encoding="utf-8")).get("version")
    except Exception:                                        # noqa: BLE001
        repo_ver = None
    out["repo_version"] = repo_ver

    code, _, reg = get_json(f"https://registry.npmjs.org/{PKG}?t={int(time.time())}")
    out["npm_http"] = code
    if reg:
        out["npm_latest"] = reg.get("dist-tags", {}).get("latest")
        out["npm_versions"] = sorted(reg.get("versions", {}))
        if out["npm_latest"] != out["installed_version"]:
            out["problems"].append(
                f"drift: installed {out['installed_version']} != npm latest {out['npm_latest']}")
        if repo_ver and repo_ver != out["npm_latest"]:
            out["problems"].append(
                f"release pending: repo at {repo_ver}, npm latest {out['npm_latest']} (needs npm publish)")
    else:
        out["problems"].append(f"npm registry unreachable ({code})")

    code, _, gh = get_json(f"https://api.github.com/repos/{REPO}")
    out["github_http"] = code
    if gh:
        out["github_pushed_at"] = gh.get("pushed_at")
        out["github_stars"] = gh.get("stargazers_count")
        out["github_description"] = gh.get("description")

    code, _, raw = get(f"https://raw.githubusercontent.com/{LIST_REPO}/main/data/plugins/Ma354__{PKG}.yml")
    out["listing_http"] = code
    out["listed_in_market"] = code == 200

    code, _, prs = get_json(
        f"https://api.github.com/search/issues?q=repo:{LIST_REPO}+is:pr+{PKG}+in:title")
    if prs and prs.get("items"):
        pr = prs["items"][0]
        out["pr"] = {"number": pr["number"], "state": pr["state"], "merged": bool(pr.get("pull_request", {}).get("merged_at")),
                     "url": pr["html_url"]}
        if not out["listed_in_market"]:
            out["problems"].append(f"market listing not live yet (PR #{pr['number']} {pr['state']})")
    else:
        out["pr"] = None

    log = STORE / "plugin-load.log"
    if log.exists():
        lines = [l for l in log.read_text(encoding="utf-8").splitlines() if l.strip()]
        if lines:
            try:
                out["last_mount"] = json.loads(lines[-1])
            except Exception:                                # noqa: BLE001
                out["last_mount"] = lines[-1]

    print(json.dumps(out, ensure_ascii=False, indent=2))
    return 0


# ---------------------------------------------------------------------------- probe
def _cupy_probe() -> dict:
    res: dict = {}
    if not GPU_LIBS.exists():
        return {"available": False, "why": f"libs dir missing: {GPU_LIBS}"}
    sys.path.insert(0, str(GPU_LIBS))
    binx = GPU_LIBS / "bin"
    if binx.exists() and hasattr(os, "add_dll_directory"):
        try:
            os.add_dll_directory(str(binx))
        except Exception:                                    # noqa: BLE001
            pass
    try:
        import cupy as cp  # noqa: F401
    except Exception as e:                                   # noqa: BLE001
        return {"available": False, "why": f"{type(e).__name__}: {e}"}
    try:
        dev = cp.cuda.Device(0)
        props = cp.cuda.runtime.getDeviceProperties(0)
        res["device"] = props["name"].decode() if isinstance(props["name"], bytes) else str(props["name"])
        res["vram_mib"] = round(dev.mem_info[1] / 2**20, 1)
        n = 1 << 26
        x = cp.random.random(n, dtype=cp.float32)
        y = cp.random.random(n, dtype=cp.float32)
        for _ in range(3):                       # warm up kernels + allocator
            cp.count_nonzero(x * x + y * y <= 1.0)
        cp.cuda.Stream.null.synchronize()
        best = min(_mc_once(cp, x, y, n) for _ in range(3))
        res["mc_samples_per_sec"] = round(n / best)
        res["mc_seconds"] = round(best, 4)
        res["available"] = True
    except Exception as e:                                   # noqa: BLE001
        res["available"] = False
        res["why"] = f"runtime: {type(e).__name__}: {e}"
    return res


def _mc_once(cp, x, y, n):
    cp.cuda.Stream.null.synchronize()
    t0 = time.perf_counter()
    cp.count_nonzero(x * x + y * y <= 1.0)
    cp.cuda.Stream.null.synchronize()
    return time.perf_counter() - t0


def _cpu_gflops() -> float | None:
    try:
        import numpy as np
        n = 1024
        a = np.random.random((n, n))
        b = np.random.random((n, n))
        a @ b
        t0 = time.perf_counter()
        for _ in range(3):
            a @ b
        dt = (time.perf_counter() - t0) / 3
        return round(2 * n ** 3 / dt / 1e9, 1)
    except Exception:                                        # noqa: BLE001
        return None


NET_PROBES = [
    ("baseline.example", "https://example.com/"),
    ("npm", "https://registry.npmjs.org/"),
    ("github-api", "https://api.github.com/"),
    ("wikipedia-direct", "https://en.wikipedia.org/wiki/Artificial_intelligence"),
    ("wikimedia-api", "https://api.wikimedia.org/core/v1/wikipedia/en/page/Artificial_intelligence"),
]


def cmd_probe() -> int:
    snap: dict = {"probed_at": now(), "host": socket.gethostname()}
    snap["os"] = f"{platform.system()} {platform.release()}"
    snap["python"] = platform.python_version()
    node = Path(r"D:\dsh文件\resources\runtime\primary-runtime\dependencies\node\bin\node.exe")
    snap["node"] = sh([str(node), "-v"]) if node.exists() else "missing"
    snap["cpu_threads"] = os.cpu_count()
    snap["cpu_gflops"] = _cpu_gflops()

    nvsmi = sh(["nvidia-smi", "--query-gpu=name,memory.total,driver_version",
                "--format=csv,noheader"], timeout=20)
    snap["nvidia_smi"] = nvsmi or "unavailable"
    snap["cupy"] = _cupy_probe()

    ppt = Path(r"C:\Program Files\Microsoft Office\Root\Office16\POWERPNT.EXE")
    snap["powerpoint_com"] = ppt.exists()
    lo = Path(r"D:\dsh文件\resources\app.asar.unpacked\dsh\node_modules\@deepseek-ai\libreoffice-kit\lib\cli.js")
    snap["libreoffice_kit"] = lo.exists()

    net = {}
    for name, url in NET_PROBES:
        code, secs, body = get(url, timeout=8.0)
        net[name] = {"code": code, "seconds": round(secs, 3), "bytes": len(body)}
    snap["network"] = net

    try:
        import shutil
        free, total = shutil.disk_usage("D:\\")
        snap["disk_d_free_gib"] = round(free / 2**30, 1)
        snap["disk_d_total_gib"] = round(total / 2**30, 1)
    except Exception:                                        # noqa: BLE001
        pass

    prev = None
    if BASELINE.exists():
        try:
            prev = json.loads(BASELINE.read_text(encoding="utf-8"))
        except Exception:                                    # noqa: BLE001
            prev = None

    diffs: list[str] = []
    if prev:
        if prev.get("cupy", {}).get("available") != snap["cupy"].get("available"):
            diffs.append(f"cupy availability {prev['cupy'].get('available')} -> {snap['cupy'].get('available')}")
        p_mc = (prev.get("cupy") or {}).get("mc_samples_per_sec")
        n_mc = snap["cupy"].get("mc_samples_per_sec")
        if p_mc and n_mc and abs(n_mc - p_mc) / p_mc > 0.25:
            diffs.append(f"gpu mc throughput {p_mc} -> {n_mc} (>25%)")
        if prev.get("cpu_threads") != snap["cpu_threads"]:
            diffs.append(f"cpu threads {prev.get('cpu_threads')} -> {snap['cpu_threads']}")
        for k, v in snap["network"].items():
            pv = (prev.get("network") or {}).get(k, {}).get("code")
            if pv != v["code"]:
                diffs.append(f"network {k}: {pv} -> {v['code']}")
        if prev.get("powerpoint_com") != snap["powerpoint_com"]:
            diffs.append("powerpoint COM availability changed")
        snap["previous_probed_at"] = prev.get("probed_at")
    else:
        diffs.append("no previous baseline - this run becomes the baseline")

    snap["diffs_vs_previous"] = diffs
    STORE.mkdir(parents=True, exist_ok=True)
    BASELINE.write_text(json.dumps(snap, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(snap, ensure_ascii=False, indent=2))
    print(f"\nbaseline written to {BASELINE}", file=sys.stderr)
    return 0


# --------------------------------------------------------------------------- verify
def cmd_verify() -> int:
    node = Path(r"D:\dsh文件\resources\runtime\primary-runtime\dependencies\node\bin\node.exe")
    test = HERE.parent / "test_plugin.mjs"
    if not test.exists():
        test = Path(r"D:\deepseek-harness\default-workspace\capability-demo\plugin\test_plugin.mjs")
    if not test.exists():
        print(json.dumps({"contract_test": "SKIP", "why": f"test file not found near {HERE}"}))
        return 1
    p = subprocess.run([str(node), str(test)], capture_output=True, text=True, timeout=120)
    print(json.dumps({
        "checked_at": now(),
        "contract_test": "PASS" if p.returncode == 0 else "FAIL",
        "returncode": p.returncode,
        "stdout": (p.stdout or "").strip()[-1500:],
        "stderr": (p.stderr or "").strip()[-800:],
    }, ensure_ascii=False, indent=2))
    return 0 if p.returncode == 0 else 1


def main() -> int:
    verb = (sys.argv[1] if len(sys.argv) > 1 else "").lower()
    table = {"status": cmd_status, "probe": cmd_probe, "verify": cmd_verify}
    if verb not in table:
        print(__doc__)
        return 2
    return table[verb]()


if __name__ == "__main__":
    sys.exit(main())
