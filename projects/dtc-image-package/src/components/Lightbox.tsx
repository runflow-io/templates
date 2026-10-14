import { useEffect, useState, useCallback } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

export type LightboxItem = { src: string; label: string; filename: string };

type Props = {
  items: LightboxItem[];
  index: number;
  onClose: () => void;
  onIndexChange: (i: number) => void;
};

export function Lightbox({ items, index, onClose, onIndexChange }: Props) {
  const next = useCallback(() => onIndexChange((index + 1) % items.length), [index, items.length, onIndexChange]);
  const prev = useCallback(() => onIndexChange((index - 1 + items.length) % items.length), [index, items.length, onIndexChange]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [next, prev, onClose]);

  if (!items.length) return null;
  const item = items[index];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-10 cursor-zoom-out"
      style={{ background: "rgba(20,20,20,0.82)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      {items.length > 1 ? (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); prev(); }}
            aria-label="Previous"
            className="absolute top-1/2 -translate-y-1/2 left-7 w-[52px] h-[52px] rounded-full bg-white/10 border border-white/20 text-white hover:bg-white/20 flex items-center justify-center"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); next(); }}
            aria-label="Next"
            className="absolute top-1/2 -translate-y-1/2 right-7 w-[52px] h-[52px] rounded-full bg-white/10 border border-white/20 text-white hover:bg-white/20 flex items-center justify-center"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </>
      ) : null}
      <button
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        aria-label="Close"
        className="absolute top-5 right-6 w-10 h-10 rounded-full bg-white/10 border border-white/20 text-white hover:bg-white/20 flex items-center justify-center"
      >
        <X className="w-5 h-5" />
      </button>
      <div className="flex flex-col items-center gap-3.5 cursor-default" onClick={(e) => e.stopPropagation()}>
        <img
          src={item.src}
          className="max-w-[90vw] max-h-[82vh] block rounded-[10px] bg-white"
          style={{ boxShadow: "0 30px 80px rgba(0,0,0,0.4)" }}
        />
        <div className="flex gap-3 items-center font-mono text-xs text-white">
          <span className="bg-amber text-white px-3 py-1.5 rounded-full font-bold uppercase tracking-wider text-[11px]">
            {item.label}
          </span>
          {items.length > 1 ? (
            <span className="text-white/60 text-[11px]">{index + 1} / {items.length}</span>
          ) : null}
          <a
            href={item.src}
            download={item.filename}
            className="text-white px-3.5 py-1.5 rounded-full border border-white/25 hover:bg-white/10 text-[11px] font-semibold"
          >
            Download
          </a>
        </div>
      </div>
    </div>
  );
}
