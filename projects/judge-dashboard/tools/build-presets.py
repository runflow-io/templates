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
            {"label": "Performance marketer", "headline": "Variants overnight, on-brand", "subhead": "Cut creative-refresh costs by 4x", "cta": "Get started"},
            {"label": "Indie founder",        "headline": "Ship the ad today",            "subhead": "From one hero to a full set",      "cta": "Try Runflow"},
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
    out_presets = []
    for p in PRESETS:
        pid = p["id"]
        pdir = PRESETS_DIR / pid
        print(f"\n=== {pid} ===")
        hero_urls = [f"{ASSET_BASE}/{pid}/{f}" for f in p["heroes"]]
        logo_url = f"{ASSET_BASE}/{pid}/{p['logo']}" if p.get("logo") else ""
        runs_dir = pdir / "runs"
        runs_dir.mkdir(exist_ok=True)
        runs = []
        for hi, hero_url in enumerate(hero_urls, 1):
            for ci, cut in enumerate(p["cuts"], 1):
                for fmt in p["formats"]:
                    print(f"  hero{hi} · cut{ci} · {fmt}…", end=" ", flush=True)
                    payload = build_payload(
                        hero_url, fmt, cut, p["brand"], logo_url,
                        hero_urls[1] if len(hero_urls) > 1 else hero_url,
                        hero_urls[2] if len(hero_urls) > 2 else hero_url,
                    )
                    try:
                        sub = submit(payload)
                        run_id = sub.get("run_id") or sub.get("id")
                        if not run_id:
                            print(f"no run id: {sub}")
                            continue
                        final = poll(run_id)
                        imgs = extract_images(final.get("output"))
                        sc = final.get("status_code")
                        if sc != "succeeded" or not imgs:
                            print(f"✗ {sc} — {final.get('failure_message')!r}; out={json.dumps(final.get('output'))[:300]}")
                            runs.append({"hero_idx": hi, "cut_idx": ci, "format": fmt, "status": sc, "image": None})
                            continue
                        img_url = imgs[0]
                        local_name = f"h{hi}-c{ci}-{fmt.replace(':','x')}.png"
                        try:
                            download(img_url, runs_dir / local_name)
                        except Exception as e:
                            print(f"download err: {e}")
                            runs.append({"hero_idx": hi, "cut_idx": ci, "format": fmt, "status": "succeeded", "image": img_url, "cost": float(final.get("cost") or 0) or None, "duration_ms": final.get("duration_ms")})
                            continue
                        runs.append({
                            "hero_idx": hi, "cut_idx": ci, "format": fmt,
                            "status": "succeeded",
                            "image": f"{ASSET_BASE}/{pid}/runs/{local_name}",
                            "cost": float(final.get("cost") or 0) or None,
                            "duration_ms": final.get("duration_ms"),
                        })
                        print(f"✓ {local_name}")
                    except Exception as e:
                        print(f"err: {e}")
                        runs.append({"hero_idx": hi, "cut_idx": ci, "format": fmt, "status": "failed", "image": None, "error": str(e)})
        out_presets.append({"id": pid, "runs": runs})
    pathlib.Path("/tmp/presets-output.json").write_text(json.dumps(out_presets, indent=2))
    print(f"\n✓ wrote /tmp/presets-output.json")

if __name__ == "__main__":
    main()
