import { ArrowLeft, ExternalLink, Download, Info, Image as ImageIcon, Plus, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { workflowMeta } from "../lib/options";
import { groupAssets } from "../lib/categories";
import type { RecentPack } from "../lib/history";
import { buildZip } from "../lib/zip";
import type { LightboxItem } from "./Lightbox";
import type { ZoomFn } from "./Pipeline";

type Props = {
  pack: RecentPack;
  onClose: () => void;
  onZoom: ZoomFn;
  onExtend?: () => void;
  /** True if an extend job is currently running for THIS pack. */
  extending?: boolean;
};

export function PackDetail({ pack, onClose, onZoom, onExtend, extending }: Props) {
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const [sourceUrl, setSourceUrl] = useState<string>("");
  const [originalSourceUrl, setOriginalSourceUrl] = useState<string>("");
  const [zipUrl, setZipUrl] = useState<string>("");

  useEffect(() => {
    const urls: Record<string, string> = {};
    for (const a of pack.assets) {
      urls[a.key] = URL.createObjectURL(a.blob);
    }
    setAssetUrls(urls);
    const sUrl = pack.source ? URL.createObjectURL(pack.source.blob) : "";
    const oUrl = pack.originalSource ? URL.createObjectURL(pack.originalSource.blob) : "";
    setSourceUrl(sUrl);
    setOriginalSourceUrl(oUrl);
    (async () => {
      try {
        const z = await buildZip(pack.assets);
        setZipUrl(URL.createObjectURL(z));
      } catch {
        /* silent — broken pack */
      }
    })();
    return () => {
      Object.values(urls).forEach((u) => URL.revokeObjectURL(u));
      if (sUrl) URL.revokeObjectURL(sUrl);
      if (oUrl) URL.revokeObjectURL(oUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pack.id]);

  const workflows = pack.workflows || [];

  // Build a stable, ordered list of LightboxItems for THIS pack so the
  // global lightbox can step through the right URLs (App.tsx's assetUrls
  // are scoped to the live pipeline run, not historical packs). The
  // pre-crop original (if saved) leads, then the cropped supplier image
  // (what the pipeline actually used), then the generated assets.
  const lightboxItems: LightboxItem[] = useMemo(() => {
    const items: LightboxItem[] = [];
    const seen = new Set<string>();
    if (originalSourceUrl && pack.originalSource) {
      items.push({
        src: originalSourceUrl,
        label: "Original upload (pre-crop)",
        filename: `runflow-pack-${pack.id}-original-${pack.originalSource.filename}`,
      });
      seen.add(originalSourceUrl);
    }
    if (sourceUrl && pack.source && !seen.has(sourceUrl)) {
      items.push({
        src: sourceUrl,
        label: pack.originalSource ? "Cropped supplier image" : "Supplier image",
        filename: `runflow-pack-${pack.id}-source-${pack.source.filename}`,
      });
      seen.add(sourceUrl);
    }
    for (const a of pack.assets) {
      const src = assetUrls[a.key];
      if (!src || seen.has(src)) continue;
      seen.add(src);
      items.push({ src, label: a.label, filename: `runflow-pack-${pack.id}-${a.filename}` });
    }
    return items;
  }, [pack.assets, pack.id, pack.source, pack.originalSource, assetUrls, sourceUrl, originalSourceUrl]);

  const handleZoom = (clickedSrc: string) => {
    if (!lightboxItems.length) return;
    const idx = Math.max(0, lightboxItems.findIndex((i) => i.src === clickedSrc));
    onZoom(lightboxItems, idx);
  };

  const openAtUrl = (url: string) => {
    if (!url) return;
    const idx = Math.max(0, lightboxItems.findIndex((i) => i.src === url));
    onZoom(lightboxItems, idx);
  };

  return (
    <div>
      {/* header bar */}
      <div className="flex items-center justify-between mb-5">
        <button
          onClick={onClose}
          className="inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-amber"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to collection
        </button>
        <div className="flex items-center gap-2">
          {onExtend ? (
            <button
              type="button"
              onClick={onExtend}
              disabled={extending}
              className="inline-flex items-center gap-2 px-4 py-2 bg-panel border border-line hover:border-amber-border hover:text-amber text-sm font-semibold text-ink-2 rounded-md transition-colors shadow-soft disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {extending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin-slow" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
              {extending ? "Extending…" : "Add more formats"}
            </button>
          ) : null}
          {zipUrl ? (
            <a
              href={zipUrl}
              download={`runflow-pack-${pack.id}.zip`}
              className="inline-flex items-center gap-2 px-4 py-2 bg-ink hover:bg-amber text-white text-sm font-semibold rounded-md transition-colors shadow-soft"
            >
              <Download className="w-3.5 h-3.5" />
              Download all (zip)
            </a>
          ) : null}
        </div>
      </div>

      {/* product header */}
      <div className="mb-6">
        <div className="font-mono uppercase tracking-wider text-[11px] text-amber font-bold mb-1.5">
          {pack.category || "Pack"} ·{" "}
          {new Date(pack.createdAt).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
        <h1 className="text-[28px] font-bold tracking-tight leading-snug mb-1">{pack.product}</h1>
        <div className="text-ink-2 text-sm">
          {pack.assets.length} asset{pack.assets.length === 1 ? "" : "s"} in this pack
        </div>
      </div>

      {/* workflows used */}
      <div className="mb-7 p-4 bg-panel-2/50 border border-line rounded-xl">
        <div className="font-mono uppercase tracking-wider text-[11px] text-muted font-bold mb-2.5">
          Workflows under the hood
        </div>
        {workflows.length > 0 ? (
          <>
            <div className="flex flex-wrap gap-2">
              {workflows.map((slug) => {
                const meta = workflowMeta(slug);
                return (
                  <a
                    key={slug}
                    href={meta.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-panel border border-line hover:border-amber-border hover:shadow-soft rounded-full text-[12px] font-semibold text-ink-2 hover:text-amber transition-all"
                  >
                    <code className="font-mono text-[10px] text-amber">{slug}</code>
                    <span>·</span>
                    <span>{meta.label}</span>
                    <ExternalLink className="w-3 h-3 opacity-60" />
                  </a>
                );
              })}
            </div>
            <p className="text-[11px] text-muted mt-3 leading-relaxed">
              Each chip links to the Runflow workflow page so you can see inputs, outputs,
              and pricing under the hood.
            </p>
          </>
        ) : (
          <div className="flex items-start gap-2.5 text-[12px] text-muted leading-relaxed">
            <Info className="w-4 h-4 mt-0.5 flex-shrink-0 text-amber" />
            <p>
              This pack was generated before workflow tracking was added (v0.3). Newer
              packs show every Runflow / OpenAI Solution that ran, each linked to its
              workflow page. Generate a new pack to see the chips.
            </p>
          </div>
        )}
      </div>

      {/* supplier photo chips — show both the cropped version (used by the
          pipeline) and the pre-crop original when both exist. */}
      {sourceUrl || originalSourceUrl ? (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          {sourceUrl ? (
            <button
              type="button"
              onClick={() => openAtUrl(sourceUrl)}
              className="inline-flex items-center gap-3 pl-1.5 pr-4 py-1.5 bg-panel border border-line hover:border-amber-border hover:shadow-soft rounded-full transition-all group"
            >
              <img
                src={sourceUrl}
                alt="Supplier photo used by the pipeline"
                className="w-10 h-10 rounded-full object-cover border border-line"
              />
              <span className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-2 group-hover:text-amber">
                <ImageIcon className="w-3.5 h-3.5" />
                {pack.originalSource ? "View cropped supplier image" : "View supplier image"}
              </span>
            </button>
          ) : null}
          {originalSourceUrl ? (
            <button
              type="button"
              onClick={() => openAtUrl(originalSourceUrl)}
              className="inline-flex items-center gap-3 pl-1.5 pr-4 py-1.5 bg-panel border border-line hover:border-amber-border hover:shadow-soft rounded-full transition-all group"
            >
              <img
                src={originalSourceUrl}
                alt="Original supplier photo before crop"
                className="w-10 h-10 rounded-full object-cover border border-line"
              />
              <span className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-2 group-hover:text-amber">
                <ImageIcon className="w-3.5 h-3.5" />
                View original supplier image
              </span>
            </button>
          ) : null}
        </div>
      ) : null}

      {/* grouped asset sections */}
      <div className="grid grid-cols-12 gap-x-6 gap-y-8 mb-10">
        {groupAssets(pack.assets).map((section) => (
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
                      <img
                        src={url}
                        loading="lazy"
                        className="max-w-full max-h-full object-contain"
                      />
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
                        download={`runflow-pack-${pack.id}-${a.filename}`}
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
    </div>
  );
}
