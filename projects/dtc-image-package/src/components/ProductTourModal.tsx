// Loom-embed walkthrough — opens from the "Product tour" button in the header.

import { useEffect } from "react";
import { X } from "lucide-react";

const LOOM_EMBED_URL = "https://www.loom.com/embed/d3c5a5245b7b459cb89ad64acd074dd9";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function ProductTourModal({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(20,20,20,0.6)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl bg-bg border border-line rounded-xl shadow-card overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-line">
          <div>
            <div className="font-mono uppercase tracking-wider text-[10px] text-muted font-bold">
              Walkthrough
            </div>
            <h3 className="text-base font-semibold leading-tight">Product tour</h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-full text-ink-2 hover:bg-panel-2 flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="bg-black" style={{ position: "relative", paddingBottom: "83.33333333333334%", height: 0 }}>
          <iframe
            src={LOOM_EMBED_URL}
            title="Runflow template — product tour"
            allow="fullscreen"
            allowFullScreen
            style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0 }}
          />
        </div>
      </div>
    </div>
  );
}
