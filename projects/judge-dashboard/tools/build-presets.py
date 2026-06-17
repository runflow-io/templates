#!/usr/bin/env python3
"""Pre-run the Runflow workflow for each (preset × hero × angle × format)
and download the resulting images into projects/judge-dashboard/presets/
so judges see results immediately when they pick a preset, no Generate
click needed.

Reads RUNFLOW_API_KEY from ~/runflow-docs/.env. Assumes the preset hero/
logo images are already deployed at https://templates.runflow.io/judge-
dashboard/presets/<id>/<file>. Run from the repo root:

    python3 projects/judge-dashboard/tools/build-presets.py

Writes the run output to /tmp/presets-output.json. The runs[] array is
what gets pasted into the PRESETS const in index.html.
"""

import json, os, pathlib, re, sys, time, urllib.request, urllib.error

HERE = pathlib.Path(__file__).resolve().parent
PRESETS_DIR = HERE.parent / "presets"
ENV_FILE = pathlib.Path.home() / "runflow-docs" / ".env"

API_BASE = "https://api.runflow.io"
WORKFLOW = f"{API_BASE}/v1/comfyui-workflows/runflow-access/brand-locked-variant-nux/runs"
ASSET_BASE = "https://templates.runflow.io/judge-dashboard/presets"

def load_env():
    for line in ENV_FILE.read_text().splitlines():
        if line.startswith("RUNFLOW_API_KEY="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise RuntimeError("RUNFLOW_API_KEY missing in .env")

KEY = load_env()
HEADERS = {"Authorization": f"Bearer {KEY}"}

def http(method, url, *, data=None, expect_json=True, timeout=120):
    h = dict(HEADERS)
    body = data
    if isinstance(data, dict):
        body = json.dumps(data).encode()
        h.setdefault("content-type", "application/json")
    req = urllib.request.Request(url, method=method, headers=h, data=body)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read()
            return json.loads(raw or b"{}") if expect_json else raw
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"{method} {url} → {e.code} {e.read().decode(errors='replace')[:500]}")

URL_KEYS = {"url", "signed_url", "public_url", "image_url", "output_url",
            "asset_url", "cdn_url", "download_url", "src", "href", "image"}
BAD = re.compile(r"\.(html?|json|txt|pdf|mp4|mov|webm|mp3|wav)(\?|$)", re.I)

def extract_images(out):
    urls = []
    def is_img(s):
        return isinstance(s, str) and s.startswith("http") and not BAD.search(s)
    def walk(v):
        if v is None: return
        if isinstance(v, str):
            if is_img(v): urls.append(v); return
            return
        if isinstance(v, list):
            for x in v: walk(x)
            return
        if isinstance(v, dict):
            for k, val in v.items():
                if k in URL_KEYS and is_img(val): urls.append(val)
                walk(val)
    walk(out)
    seen, deduped = set(), []
    for u in urls:
        if u in seen: continue
        seen.add(u); deduped.append(u)
    return deduped

def submit(payload):
    return http("POST", WORKFLOW, data={"input": payload, "client_ref": None})

def poll(run_id, max_wait=900, interval=5):
    t0 = time.monotonic()
    while True:
        r = http("GET", f"{API_BASE}/v1/runs/{run_id}")
        sc = r.get("status_code")
        if sc in ("succeeded", "failed", "cancelled", "timeout"): return r
        if time.monotonic() - t0 > max_wait:
            return {"status_code": "timeout", "failure_message": "client poll timeout", "output": r.get("output")}
        time.sleep(interval)

def build_payload(hero_url, aspect, cut, brand, logo_url, aux1_url, aux2_url):
    lines = [
        "Produce a brand-locked ad variant from the provided primary design reference.",
        f'Headline text: "{cut["headline"]}".' if cut.get("headline") else "",
        f'Subhead text: "{cut["subhead"]}".' if cut.get("subhead") else "",
        f'Call to action: "{cut["cta"]}".' if cut.get("cta") else "",
        f'Audience: {cut["label"]}.' if cut.get("label") else "",
        f'Primary brand color: {brand["brandColor1"]}.' if brand.get("brandColor1") else "",
        f'Secondary brand color: {brand["brandColor2"]}.' if brand.get("brandColor2") else "",
        f'Use the typography of: {brand["brandFont"]}.' if brand.get("brandFont") else "",
        f'Visual tone: {brand["brandTone"]}.' if brand.get("brandTone") else "",
        "Place the provided logo in a prominent corner safe zone." if logo_url else "",
        "Preserve the focal subject from the primary design reference. Avoid warped text or floating overlays.",
    ]
    return {
        "prompt": " ".join(x for x in lines if x),
        "aspect_ratio": aspect or "1:1",
        "logo": logo_url or "",
        "primary_design_ref": hero_url,
        "Aux Reference 1": aux1_url or logo_url or hero_url,
        "Aux Reference 2": aux2_url or logo_url or hero_url,
    }

def download(url, dest):
    req = urllib.request.Request(url, headers={"User-Agent": "preset-builder/1.0"})
    with urllib.request.urlopen(req, timeout=180) as r:
        dest.write_bytes(r.read())

PRESETS = [
    {
        "id": "chanel",
        "heroes": ["hero1.jpg", "hero2.jpg", "hero3.jpg"],
        "logo": "logo.png",
        "brand": {"brandColor1": "#09090B", "brandColor2": "", "brandFont": "Couture", "brandTone": "premium"},
        "cuts": [
            {"label": "Holiday gift",         "headline": "Make hers unforgettable", "subhead": "From the icon to the everyday", "cta": "Shop the collection"},
            {"label": "Fragrance loyalist",   "headline": "Your signature, refined", "subhead": "Three icons, one collection",   "cta": "Discover"},
        ],
        "formats": ["1:1", "9:16"],
    },
    {
        "id": "runflow",
        "heroes": ["hero1.jpg", "hero2.jpg", "hero3.jpg"],
        "logo": "logo.png",
        "brand": {"brandColor1": "#09090B", "brandColor2": "#FBBF24", "brandFont": "Bricolage Grotesque", "brandTone": "minimal"},
        "cuts": [
            {"label": "Performance marketer", "headline": "Variants overnight, on-brand", "subhead": "Cut creative-refresh costs by 4x", "cta": "Get started"},
            {"label": "Indie founder",        "headline": "Ship the ad today",            "subhead": "From one hero to a full set",      "cta": "Try Runflow"},
        ],
        "formats": ["16:9", "4:5"],
    },
    {
        "id": "ikea",
        "heroes": ["hero1.jpg", "hero2.jpg", "hero3.jpg"],
        "logo": "logo.jpg",
        "brand": {"brandColor1": "#0058A3", "brandColor2": "#FFDB00", "brandFont": "Noto Sans", "brandTone": "playful"},
        "cuts": [
            {"label": "Performance marketer", "headline": "Variants overnight, on-brand", "subhead": "Cut creative-refresh costs by 4x", "cta": "Get started"},
            {"label": "Indie founder",        "headline": "Ship the ad today",            "subhead": "From one hero to a full set",      "cta": "Try Runflow"},
        ],
        "formats": ["9:16", "16:9"],
    },
]

def main():
    # Phase 1: submit every (hero × cut × format) in parallel — Runflow handles
    # the queue, we just collect run_ids and poll them as a batch afterwards.
    jobs = []  # list of dicts: pid, hi, ci, fmt, run_id
    for p in PRESETS:
        pid = p["id"]
        pdir = PRESETS_DIR / pid
        (pdir / "runs").mkdir(exist_ok=True)
        hero_urls = [f"{ASSET_BASE}/{pid}/{f}" for f in p["heroes"]]
        logo_url = f"{ASSET_BASE}/{pid}/{p['logo']}" if p.get("logo") else ""
        for hi, hero_url in enumerate(hero_urls, 1):
            for ci, cut in enumerate(p["cuts"], 1):
                for fmt in p["formats"]:
                    local_name = f"h{hi}-c{ci}-{fmt.replace(':','x')}.jpg"
                    if (pdir / "runs" / local_name).exists():
                        print(f"  ⏭ {pid} h{hi}c{ci}{fmt}: already on disk, skip")
                        continue
                    payload = build_payload(
                        hero_url, fmt, cut, p["brand"], logo_url,
                        hero_urls[1] if len(hero_urls) > 1 else hero_url,
                        hero_urls[2] if len(hero_urls) > 2 else hero_url,
                    )
                    try:
                        sub = submit(payload)
                        rid = sub.get("run_id") or sub.get("id")
                        if not rid:
                            print(f"  ✗ {pid} h{hi}c{ci}{fmt}: submit had no run id")
                            continue
                        print(f"  → {pid} h{hi}c{ci}{fmt}: submitted {rid}")
                        jobs.append({"pid": pid, "hi": hi, "ci": ci, "fmt": fmt, "run_id": rid})
                    except Exception as e:
                        print(f"  ✗ {pid} h{hi}c{ci}{fmt}: submit error: {e}")
    print(f"\nsubmitted {len(jobs)} runs, polling…\n")

    # Phase 2: poll each run to completion in parallel using threads.
    import concurrent.futures
    results_by_key = {}
    def poll_job(job):
        try:
            final = poll(job["run_id"])
        except Exception as e:
            return {**job, "_error": str(e)}
        return {**job, "_final": final}
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as ex:
        for done in concurrent.futures.as_completed([ex.submit(poll_job, j) for j in jobs]):
            r = done.result()
            key = f"{r['pid']}/h{r['hi']}c{r['ci']}{r['fmt']}"
            if r.get("_error"):
                print(f"  ✗ {key}: poll error: {r['_error']}")
                results_by_key[key] = {**r, "status": "failed", "image": None, "error": r["_error"]}
                continue
            final = r["_final"]
            sc = final.get("status_code")
            imgs = extract_images(final.get("output"))
            if sc != "succeeded" or not imgs:
                print(f"  ✗ {key}: {sc} — {final.get('failure_message')!r}")
                results_by_key[key] = {**r, "status": sc, "image": None}
                continue
            img_url = imgs[0]
            local_name = f"h{r['hi']}-c{r['ci']}-{r['fmt'].replace(':','x')}.jpg"
            local_dest = PRESETS_DIR / r["pid"] / "runs" / local_name
            try:
                # Download PNG to memory, convert to JPEG quality-85 to save space.
                import urllib.request, io
                from PIL import Image
                req = urllib.request.Request(img_url, headers={"User-Agent": "preset-builder/1.0"})
                with urllib.request.urlopen(req, timeout=180) as resp:
                    raw = resp.read()
                img = Image.open(io.BytesIO(raw)).convert("RGB")
                img.save(local_dest, "JPEG", quality=85, optimize=True)
                results_by_key[key] = {**r, "status": "succeeded", "image": f"{ASSET_BASE}/{r['pid']}/runs/{local_name}", "cost": float(final.get("cost") or 0) or None, "duration_ms": final.get("duration_ms")}
                print(f"  ✓ {key}: {local_name}")
            except Exception as e:
                results_by_key[key] = {**r, "status": "succeeded", "image": img_url, "cost": float(final.get("cost") or 0) or None, "duration_ms": final.get("duration_ms")}
                print(f"  ⚠ {key}: download failed: {e}")

    # Phase 3: assemble output by preset.
    out_presets = []
    for p in PRESETS:
        pid = p["id"]
        runs = []
        for hi in range(1, len(p["heroes"]) + 1):
            for ci in range(1, len(p["cuts"]) + 1):
                for fmt in p["formats"]:
                    key = f"{pid}/h{hi}c{ci}{fmt}"
                    r = results_by_key.get(key, {})
                    # Fall back to disk if a prior pass already saved this combo.
                    local_name = f"h{hi}-c{ci}-{fmt.replace(':','x')}.jpg"
                    local_path = PRESETS_DIR / pid / "runs" / local_name
                    if not r and local_path.exists():
                        r = {"status": "succeeded", "image": f"{ASSET_BASE}/{pid}/runs/{local_name}"}
                    runs.append({
                        "hero_idx": hi, "cut_idx": ci, "format": fmt,
                        "status": r.get("status") or "failed",
                        "image": r.get("image"),
                        "cost": r.get("cost"),
                        "duration_ms": r.get("duration_ms"),
                    })
        out_presets.append({"id": pid, "runs": runs})
    pathlib.Path("/tmp/presets-output.json").write_text(json.dumps(out_presets, indent=2))
    print(f"\n✓ wrote /tmp/presets-output.json")

if __name__ == "__main__":
    main()
