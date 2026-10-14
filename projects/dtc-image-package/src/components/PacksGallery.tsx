import { useEffect, useState } from "react";
import { Plus, Library as LibraryIcon, Trash2 } from "lucide-react";
import { listPacks, deletePack, type RecentPack, makeBlobUrl } from "../lib/history";

type Props = {
  refreshKey: number;
  onOpen: (pack: RecentPack) => void;
  onNew: () => void;
  onAfterDelete?: () => void;
};

export function PacksGallery({ refreshKey, onOpen, onNew, onAfterDelete }: Props) {
  const [packs, setPacks] = useState<RecentPack[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = () => {
    listPacks(60).then((list) => {
      setPacks(list);
      const next: Record<string, string> = {};
      list.forEach((p) => {
        next[p.id] = makeBlobUrl(p.thumb);
      });
      setThumbs((prev) => {
        Object.values(prev).forEach((u) => URL.revokeObjectURL(u));
        return next;
      });
    });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const handleDelete = async (e: React.MouseEvent, pack: RecentPack) => {
    e.stopPropagation();
    e.preventDefault();
    const ok = window.confirm(
      `Delete "${pack.product || "this pack"}"? This removes the pack and its ${pack.assets.length} asset${pack.assets.length === 1 ? "" : "s"} from your collection. This can't be undone.`
    );
    if (!ok) return;
    setDeletingId(pack.id);
    try {
      await deletePack(pack.id);
      load();
      onAfterDelete?.();
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section>
      <div className="flex items-baseline justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold">Packs collection</h2>
          <p className="text-xs text-muted mt-1">
            Every pack you've generated. Click any to see the assets + which Runflow
            workflows ran. Stored in this browser only (IndexedDB).
          </p>
        </div>
        <button
          onClick={onNew}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-ink hover:bg-amber text-white text-xs font-semibold rounded-md transition-colors shadow-soft"
        >
          <Plus className="w-3.5 h-3.5" />
          New pack
        </button>
      </div>

      {packs.length === 0 ? (
        <div className="bg-panel border border-line rounded-xl py-16 px-6 text-center">
          <div className="w-12 h-12 rounded-full bg-panel-2 text-muted flex items-center justify-center mx-auto mb-3">
            <LibraryIcon className="w-5 h-5" />
          </div>
          <h3 className="text-base font-semibold mb-1.5">No packs yet</h3>
          <p className="text-sm text-muted leading-relaxed max-w-md mx-auto mb-4">
            Generate your first pack — it'll save here automatically.
          </p>
          <button
            onClick={onNew}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-ink hover:bg-amber text-white text-sm font-semibold rounded-md transition-colors shadow-soft"
          >
            Start
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
          {packs.map((p) => {
            const isDeleting = deletingId === p.id;
            return (
              <div
                key={p.id}
                className="relative group bg-panel border border-line rounded-lg overflow-hidden flex flex-col hover:border-amber-border hover:shadow-soft hover:-translate-y-px transition-all"
              >
                <button
                  onClick={() => onOpen(p)}
                  className="text-left flex flex-col"
                  disabled={isDeleting}
                >
                  <div className="aspect-square bg-panel-2 overflow-hidden relative">
                    <img
                      src={thumbs[p.id]}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    <span className="absolute top-1.5 right-1.5 font-mono uppercase tracking-wider text-[9px] font-bold px-1.5 py-[3px] rounded bg-green/85 text-white">
                      done
                    </span>
                    <span className="absolute bottom-1.5 right-1.5 font-mono text-[10px] font-bold px-1.5 py-[3px] rounded bg-black/60 text-white">
                      {p.assets.length} files
                    </span>
                  </div>
                  <div className="px-3 py-2.5 flex flex-col gap-0.5">
                    <div
                      className="text-sm font-semibold leading-snug truncate"
                      title={p.product}
                    >
                      {p.product}
                    </div>
                    <div className="text-[10px] text-muted font-mono">
                      {new Date(p.createdAt).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                </button>

                {/* delete button — appears on hover, top-left of thumb */}
                <button
                  type="button"
                  onClick={(e) => handleDelete(e, p)}
                  disabled={isDeleting}
                  aria-label="Delete pack"
                  title="Delete pack"
                  className={
                    "absolute top-1.5 left-1.5 w-7 h-7 rounded-full bg-black/65 hover:bg-red text-white flex items-center justify-center transition-all shadow-soft " +
                    (isDeleting
                      ? "opacity-100"
                      : "opacity-0 group-hover:opacity-100 focus:opacity-100")
                  }
                >
                  <Trash2 className="w-3.5 h-3.5" strokeWidth={2.25} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
