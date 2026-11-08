#!/usr/bin/env python3
"""Linter and syntax validator for relay Python code."""
import ast
import glob
import os
import subprocess
import sys

def run_external_linter():
    for cmd in [["ruff", "check", "relay/"], ["flake8", "relay/"]]:
        try:
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            print(res.stdout)
            if res.stderr:
                print(res.stderr, file=sys.stderr)
            return res.returncode
        except FileNotFoundError:
            continue
    return None

def ast_lint_relay():
    relay_dir = os.path.join(os.path.dirname(__file__), "..", "relay")
    py_files = glob.glob(os.path.join(relay_dir, "*.py"))
    has_error = False

    print(f"Checking {len(py_files)} Python files in relay/ with AST...")
    for path in sorted(py_files):
        rel = os.path.relpath(path)
        try:
            with open(path, "r", encoding="utf-8") as f:
                source = f.read()
            ast.parse(source, filename=path)
            print(f"  OK: {rel}")
        except SyntaxError as e:
            print(f"  SYNTAX ERROR in {rel}: {e}", file=sys.stderr)
            has_error = True

    return 1 if has_error else 0

def main():
    ext_result = run_external_linter()
    if ext_result is not None:
        sys.exit(ext_result)
    sys.exit(ast_lint_relay())

if __name__ == "__main__":
    main()
