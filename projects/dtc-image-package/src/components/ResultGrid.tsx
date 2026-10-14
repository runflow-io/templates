import { Download, Info } from "lucide-react";
import type { AssetFile } from "../lib/pipeline";
import type { LightboxItem } from "./Lightbox";
import type { ZoomFn } from "./Pipeline";
import { groupAssets } from "../lib/categories";

type Props = {
  assets: AssetFile[];
  assetUrls: Record<string, string>;
  zipUrl: string | null;
  jobId: string;
  onZoom: ZoomFn;
};

function buildItemsFromAssets(assets: AssetFile[], assetUrls: Record<string, string>, jobId: string): LightboxItem[] {
  const items: LightboxItem[] = [];
  const seen = new Set<string>();
  for (const a of assets) {
    const src = assetUrls[a.key];
    if (!src || seen.has(src)) continue;
    seen.add(src);
    items.push({ src, label: a.label || a.key, filename: `runflow-pack-${jobId}-${a.filename}` });
  }
  return items;
}

export function ResultGrid({ assets, assetUrls, zipUrl, jobId, onZoom }: Props) {
  if (!assets.length) return null;
  const handleZoom = (clickedSrc: string) => {
    const items = buildItemsFromAssets(assets, assetUrls, jobId);
    if (!items.length) return;
    const idx = Math.max(0, items.findIndex((i) => i.src === clickedSrc));
    onZoom(items, idx);
  };
  const sections = groupAssets(assets);
  return (
    <section className="mb-10">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-base font-semibold">Your brand pack</h2>
        {zipUrl ? (
          <a
            href={zipUrl}
            download={`runflow-pack-${jobId}.zip`}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-ink hover:bg-amber text-white text-sm font-semibold rounded-md transition-colors shadow-soft"
          >
            Download all (zip) →
          </a>
        ) : null}
      </div>
      <div className="grid grid-cols-12 gap-x-6 gap-y-8">
        {sections.map((section) => (
          <div
            key={section.folder}
            className={section.items.length === 1 ? "col-span-12 md:col-span-6" : "col-span-12"}
          >
            <div className="flex items-baseline justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-ink">{section.title}</h3>
                <div className="text-[11px] text-muted mt-0.5">{section.hint}</div>
              </div>
              <span className="font-mono text-[10px] text-muted">
                {section.items.length} file{section.items.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
              {section.items.map((a) => {
                const url = assetUrls[a.key];
                if (!url) return null;
                return (
                  <figure
                    key={a.key}
                    className="bg-panel border border-line rounded-[10px] flex flex-col hover:border-amber-border hover:shadow-soft transition-all"
                  >
                    <button
                      onClick={() => handleZoom(url)}
                      className={
                        "aspect-square flex items-center justify-center overflow-hidden rounded-t-[10px] cursor-zoom-in " +
                        (a.key === "cutout" ? "checker" : "bg-panel-2")
                      }
                    >
                      <img src={url} loading="lazy" className="max-w-full max-h-full object-contain" />
                    </button>
                    <figcaption className="p-3 flex flex-col gap-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <div className="text-xs font-semibold leading-snug truncate">
                          {a.label || a.key}
                        </div>
                        {a.description ? (
                          <div className="relative inline-flex group">
                            <Info className="w-3 h-3 text-muted hover:text-amber flex-shrink-0 cursor-help" />
                            <div
                              role="tooltip"
                              className="invisible group-hover:visible pointer-events-none absolute z-40 left-1/2 -translate-x-1/2 bottom-full mb-2 w-56 p-2.5 bg-ink text-white text-[11px] leading-snug rounded-md shadow-card"
                            >
                              {a.description}
                            </div>
                          </div>
                        ) : null}
                      </div>
                      <a
                        href={url}
                        download={`runflow-pack-${jobId}-${a.filename}`}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber hover:underline"
                      >
                        <Download className="w-3 h-3" />
                        Download
                      </a>
                    </figcaption>
                  </figure>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
