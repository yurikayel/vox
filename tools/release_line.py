#!/usr/bin/env python3
"""Generate docs/release-metadata.json and sync README release table."""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SW_JS = ROOT / "client" / "sw.js"
README = ROOT / "README.md"
METADATA = ROOT / "docs" / "release-metadata.json"


def _run(cmd: list[str], *, cwd: Path = ROOT) -> str:
    out = subprocess.run(
        cmd,
        cwd=cwd,
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    return out.stdout.strip()


def git_short_sha() -> str:
    return _run(["git", "rev-parse", "--short", "HEAD"])


def git_branch() -> str:
    branch = _run(["git", "rev-parse", "--abbrev-ref", "HEAD"])
    return branch if branch != "HEAD" else "detached"


def parse_cache_name() -> str:
    text = SW_JS.read_text(encoding="utf-8")
    m = re.search(r'const\s+CACHE_NAME\s*=\s*"([^"]+)"', text)
    if not m:
        raise SystemExit(f"CACHE_NAME not found in {SW_JS}")
    return m.group(1)


def count_tests() -> tuple[int, int]:
    js_cmd = ["node", "--test", "tests/*.test.js"]
    py_cmd = [
        "python",
        "-m",
        "unittest",
        "discover",
        "-s",
        "relay",
        "-p",
        "test_*.py",
    ]
    run_kw = dict(
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        shell=sys.platform == "win32",
    )
    js_out = subprocess.run(js_cmd, **run_kw)
    py_out = subprocess.run(py_cmd, **run_kw)
    if js_out.returncode != 0:
        sys.stderr.write(js_out.stdout + js_out.stderr)
        raise SystemExit("test:client failed")
    if py_out.returncode != 0:
        sys.stderr.write(py_out.stdout + py_out.stderr)
        raise SystemExit("test:relay failed")
    js_m = re.search(r"ℹ tests (\d+)", js_out.stdout + js_out.stderr)
    py_m = re.search(r"Ran (\d+) tests", py_out.stdout + py_out.stderr)
    if not js_m or not py_m:
        raise SystemExit("Could not parse test counts from npm output")
    js_n = int(js_m.group(1))
    py_n = int(py_m.group(1))
    return js_n, py_n


def build_metadata(*, count: bool) -> dict:
    js_n, py_n = count_tests() if count else (None, None)
    if not count and METADATA.is_file():
        prev = json.loads(METADATA.read_text(encoding="utf-8"))
        js_n = int(prev["test_js"])
        py_n = int(prev["test_python"])
    elif js_n is None or py_n is None:
        raise SystemExit("test counts required")
    return {
        "git_sha": git_short_sha(),
        "branch": git_branch(),
        "test_js": js_n,
        "test_python": py_n,
        "test_total": js_n + py_n,
        "cache_name": parse_cache_name(),
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


def write_metadata(meta: dict) -> None:
    METADATA.parent.mkdir(parents=True, exist_ok=True)
    METADATA.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")


def patch_readme(meta: dict) -> bool:
    text = README.read_text(encoding="utf-8")
    sha = meta["git_sha"]
    js_n = meta["test_js"]
    py_n = meta["test_python"]
    total = meta["test_total"]
    cache = meta["cache_name"]

    replacements = [
        (
            re.compile(r"(\| \*\*SHA\*\* \| `)[^`]+(` \|)"),
            rf"\g<1>{sha}\2",
        ),
        (
            re.compile(r"\| \*\*Testes\*\* \|[^\n]+\n"),
            f"| **Testes** | **{total}** (`{js_n}` JS + `{py_n}` Python) — `npm test` na raiz |\n",
        ),
        (
            re.compile(r"(\| \*\*Service worker\*\* \| `)[^`]+(` \|)"),
            rf"\g<1>{cache}\2",
        ),
        (
            re.compile(
                r"(Executa a su.{0,3}te de \*\*)\d+ testes(\*\* \(`)\d+(` JS via `node:test` e `)\d+(` Python via `unittest`\)\.)"
            ),
            rf"\g<1>{total} testes\2{js_n}\3{py_n}\4",
        ),
        (
            re.compile(
                r"(su.{0,3}te completa de \*\*)\d+ testes(\*\* e auditoria)"
            ),
            rf"\g<1>{total} testes\2",
        ),
    ]
    new_text = text
    for pattern, repl in replacements:
        new_text = pattern.sub(repl, new_text, count=1)
    if new_text == text:
        print("README: no release-line patterns matched (table/footer unchanged)")
        return False
    README.write_text(new_text, encoding="utf-8")
    return True


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--metadata-only",
        action="store_true",
        help="Write docs/release-metadata.json only (no README)",
    )
    parser.add_argument(
        "--no-test-run",
        action="store_true",
        help="Reuse test counts from existing metadata if present",
    )
    args = parser.parse_args()
    meta = build_metadata(count=not args.no_test_run)
    write_metadata(meta)
    print(json.dumps(meta, indent=2))
    if not args.metadata_only:
        if patch_readme(meta):
            print(f"Updated {README.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
