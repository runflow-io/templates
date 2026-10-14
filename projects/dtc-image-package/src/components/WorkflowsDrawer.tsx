// Slide-out drawer that mirrors https://www.runflow.io/models so users can
// browse every Runflow model + workflow without leaving the template.
// Catalog is fetched once per session and cached on the window.

import { useEffect, useMemo, useState } from "react";
import { X, ExternalLink, Search } from "lucide-react";

type CatalogItem = {
  slug: string;
  model_name: string;
  category: string;
  page_url: string;
  price_label?: string;
  provider_name?: string;
  thumbnail_url?: string;
  active?: boolean;
  isWorkflow?: boolean;
};

type DrawerTab = "workflows" | "models";

const CATALOG_URL = "https://www.runflow.io/models-catalog.json";

// Cache across drawer open/close within the same page-load.
let cached: CatalogItem[] | null = null;

type Props = {
  open: boolean;
  onClose: () => void;
};

export function WorkflowsDrawer({ open, onClose }: Props) {
  const [items, setItems] = useState<CatalogItem[] | null>(cached);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [tab, setTab] = useState<DrawerTab>("workflows");

  useEffect(() => {
    if (!open || cached) return;
    let cancelled = false;
    setError(null);
    fetch(CATALOG_URL)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data: CatalogItem[]) => {
        if (cancelled) return;
        cached = data;
        setItems(data);
      })
      .catch((e) => !cancelled && setError(String(e?.message || e)));
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  // Items scoped to the current tab — workflows (Runflow's curated pipelines,
  // isWorkflow=true) vs models (raw model catalog).
  const tabItems = useMemo(() => {
    if (!items) return [];
    return items.filter((i) => (tab === "workflows" ? i.isWorkflow : !i.isWorkflow));
  }, [items, tab]);

  const counts = useMemo(() => {
    if (!items) return { workflows: 0, models: 0 };
    let w = 0;
    let m = 0;
    for (const i of items) {
      if (i.active === false) continue;
      if (i.isWorkflow) w++;
      else m++;
    }
    return { workflows: w, models: m };
  }, [items]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    tabItems.forEach((i) => i.category && set.add(i.category));
    return Array.from(set).sort();
  }, [tabItems]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tabItems.filter((i) => {
      if (i.active === false) return false;
      if (category !== "all" && i.category !== category) return false;
      if (!q) return true;
      return (
        i.model_name?.toLowerCase().includes(q) ||
        i.slug.toLowerCase().includes(q) ||
        i.provider_name?.toLowerCase().includes(q)
      );
    });
  }, [tabItems, query, category]);

  // Reset category filter when switching tabs so a stale category doesn't
  // leave the list empty (workflows + models have different categories).
  useEffect(() => {
    setCategory("all");
  }, [tab]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <aside className="relative w-full max-w-[480px] h-full bg-bg border-l border-line flex flex-col shadow-card">
        {/* header */}
        <div className="px-5 pt-4 pb-0 border-b border-line">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="font-mono uppercase tracking-wider text-[10px] text-muted font-bold">
                Runflow catalog
              </div>
              <h3 className="text-base font-semibold leading-tight">
                {tab === "workflows" ? "Workflows" : "Models"}
              </h3>
              <p className="text-[11px] text-muted mt-0.5">
                {tab === "workflows"
                  ? "Ready-made pipelines, one API call"
                  : "Raw models from every provider in the catalog"}
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="w-8 h-8 rounded-full text-ink-2 hover:bg-panel-2 flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {/* sub-tabs */}
          <div className="flex gap-1 -mb-px">
            <DrawerTabButton
              active={tab === "workflows"}
              onClick={() => setTab("workflows")}
              count={counts.workflows}
            >
              Workflows
            </DrawerTabButton>
            <DrawerTabButton
              active={tab === "models"}
              onClick={() => setTab("models")}
              count={counts.models}
            >
              Models
            </DrawerTabButton>
          </div>
        </div>

        {/* filters */}
        <div className="px-5 py-3 border-b border-line space-y-2.5 bg-panel-2/40">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search models, providers, slugs…"
              className="w-full pl-8 pr-3 py-2 text-[13px] bg-panel border border-line rounded-md focus:outline-none focus:border-amber-border"
            />
          </div>
          {categories.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              <CategoryChip active={category === "all"} onClick={() => setCategory("all")}>
                All
              </CategoryChip>
              {categories.map((c) => (
                <CategoryChip key={c} active={category === c} onClick={() => setCategory(c)}>
                  {c.replace(/-/g, " → ")}
                </CategoryChip>
              ))}
            </div>
          ) : null}
        </div>

        {/* list */}
        <div className="flex-1 overflow-y-auto">
          {!items && !error ? (
            <div className="p-8 text-center text-sm text-muted">Loading catalog…</div>
          ) : error ? (
            <div className="p-8 text-center text-sm text-red">
              Could not load catalog · {error}
              <div className="mt-2">
                <a
                  href="https://www.runflow.io/models"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-amber hover:underline text-xs font-semibold"
                >
                  Open runflow.io/models <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted">No models match.</div>
          ) : (
            <ul className="divide-y divide-line">
              {filtered.map((it) => (
                <li key={it.slug}>
                  <a
                    href={`https://app.runflow.io${it.page_url}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-3 px-5 py-3 hover:bg-panel-2/60 transition-colors group"
                  >
                    {it.thumbnail_url ? (
                      <img
                        src={it.thumbnail_url}
                        loading="lazy"
                        alt=""
                        className="w-12 h-12 rounded-md object-cover bg-panel-2 flex-shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-md bg-panel-2 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <div className="text-[13px] font-semibold truncate">{it.model_name}</div>
                        <ExternalLink className="w-3 h-3 text-muted opacity-0 group-hover:opacity-100 flex-shrink-0" />
                      </div>
                      <div className="font-mono text-[10px] text-muted truncate">{it.slug}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] uppercase font-mono tracking-wider text-muted">
                          {it.category}
                        </span>
                        {it.price_label ? (
                          <>
                            <span className="text-muted">·</span>
                            <span className="text-[11px] font-semibold text-amber">{it.price_label}</span>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* footer */}
        <div className="px-5 py-3 border-t border-line bg-panel">
          <a
            href="https://www.runflow.io/models"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-2 hover:text-amber"
          >
            View on runflow.io/models <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </aside>
    </div>
  );
}

function DrawerTabButton({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "relative flex items-center gap-1.5 px-3 py-2 text-[13px] font-semibold border-b-2 transition-all -mb-[1px] " +
        (active
          ? "border-amber text-amber"
          : "border-transparent text-ink-2 hover:text-ink hover:border-line")
      }
    >
      {children}
      <span
        className={
          "font-mono text-[10px] " + (active ? "text-amber/80" : "text-muted")
        }
      >
        ({count})
      </span>
    </button>
  );
}

function CategoryChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "px-2.5 py-1 rounded-full text-[10px] font-mono uppercase tracking-wider font-bold transition-colors " +
        (active
          ? "bg-amber text-white"
          : "bg-panel border border-line text-muted hover:border-amber-border hover:text-amber")
      }
    >
      {children}
    </button>
  );
}
