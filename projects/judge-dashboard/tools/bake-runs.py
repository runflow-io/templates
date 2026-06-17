#!/usr/bin/env python3
"""Read /tmp/presets-output.json (produced by build-presets.py) and patch
the PRESETS const in projects/judge-dashboard/index.html so each preset's
runs[] array is filled in. Idempotent — re-run after each prerun pass."""

import json, pathlib, re

HERE = pathlib.Path(__file__).resolve().parent
INDEX = HERE.parent / "index.html"
OUT = pathlib.Path("/tmp/presets-output.json")

def main():
    out = json.loads(OUT.read_text())
    by_id = {p["id"]: p["runs"] for p in out}
    html = INDEX.read_text()
    for pid, runs in by_id.items():
        runs_js = ",\n      ".join(
            json.dumps(r, separators=(", ", ": ")) for r in runs
        )
        # Replace any existing runs:[...] block within the preset object.
        # Match the preset by id then swap runs: [...] up to the closing }.
        pattern = re.compile(
            r'(\{\s*\n\s*id: "' + re.escape(pid) + r'",.*?runs:\s*)\[[^\]]*\]',
            re.DOTALL,
        )
        new = pattern.sub(lambda m: f"{m.group(1)}[\n      {runs_js}\n    ]", html, count=1)
        if new == html:
            print(f"  ✗ couldn't patch preset '{pid}' — pattern not found")
            continue
        html = new
        print(f"  ✓ patched {pid} runs ({len(runs)} entries)")
    INDEX.write_text(html)
    print(f"\n✓ wrote {INDEX}")

if __name__ == "__main__":
    main()
