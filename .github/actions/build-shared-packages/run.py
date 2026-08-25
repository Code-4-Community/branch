#!/usr/bin/env python3
"""Discover shared/* packages, install/build in @branch-dep order, optionally test.

A new directory under shared/ with a package.json is picked up automatically.
Packages with no build/test script (e.g. @branch/types) are no-ops for those
steps. Dependency order comes from each package.json's @branch/* deps, so a
cycle fails the run instead of compiling against a missing dist/.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

ROOT = Path.cwd()
SHARED = ROOT / "shared"


def load_packages() -> list[tuple[Path, dict]]:
    pkgs: list[tuple[Path, dict]] = []
    if not SHARED.is_dir():
        sys.exit(f"missing {SHARED}")
    for d in sorted(SHARED.iterdir()):
        pj = d / "package.json"
        if d.is_dir() and pj.is_file():
            pkgs.append((d, json.loads(pj.read_text())))
    if not pkgs:
        sys.exit("no shared/*/package.json found")
    return pkgs


def topo_order(pkgs: list[tuple[Path, dict]]) -> list[Path]:
    name_to_dir = {data["name"]: d for d, data in pkgs}
    dirs = [d for d, _ in pkgs]
    dependents: dict[Path, set[Path]] = {d: set() for d in dirs}
    indeg = {d: 0 for d in dirs}

    for d, data in pkgs:
        seen: set[Path] = set()
        for section in ("dependencies", "devDependencies"):
            for name in data.get(section) or {}:
                other = name_to_dir.get(name)
                if other is None or other == d or other in seen:
                    continue
                seen.add(other)
                dependents[other].add(d)
                indeg[d] += 1

    queue = sorted((d for d in dirs if indeg[d] == 0), key=lambda p: p.name)
    order: list[Path] = []
    while queue:
        n = queue.pop(0)
        order.append(n)
        for m in sorted(dependents[n], key=lambda p: p.name):
            indeg[m] -= 1
            if indeg[m] == 0:
                queue.append(m)
                queue.sort(key=lambda p: p.name)

    if len(order) != len(dirs):
        leftover = ", ".join(sorted(d.name for d in dirs if d not in order))
        sys.exit(f"cycle in shared/ @branch dependencies involving: {leftover}")
    return order


def has_script(data: dict, name: str) -> bool:
    return bool((data.get("scripts") or {}).get(name))


def npm(args: list[str], prefix: Path) -> None:
    subprocess.check_call(["npm", *args, "--prefix", str(prefix)])


def main() -> None:
    do_test = "test" in sys.argv[1:]
    pkgs = load_packages()
    data_by_dir = {d: data for d, data in pkgs}
    order = topo_order(pkgs)
    print("shared package order:", " -> ".join(d.name for d in order), flush=True)

    for d in order:
        data = data_by_dir[d]
        rel = d.relative_to(ROOT).as_posix()
        if (d / "package-lock.json").is_file():
            npm(["ci", "--no-audit", "--no-fund"], d)
        else:
            print(f"skip npm ci ({rel}: no package-lock.json)", flush=True)
        if has_script(data, "build"):
            npm(["run", "build"], d)
        else:
            print(f"skip build ({rel}: no build script)", flush=True)

    if not do_test:
        return

    for d in order:
        data = data_by_dir[d]
        rel = d.relative_to(ROOT).as_posix()
        if has_script(data, "test"):
            npm(["test"], d)
        else:
            print(f"skip test ({rel}: no test script)", flush=True)


if __name__ == "__main__":
    main()
