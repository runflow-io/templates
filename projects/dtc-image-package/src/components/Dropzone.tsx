import { useRef, useState, useEffect } from "react";
import { X, Crop as CropIcon } from "lucide-react";

type Props = {
  label: string;
  required?: boolean;
  hint?: string;
  subHint?: string;
  file: File | null;
  onChange: (file: File | null) => void;
  /** Optional — shows a "Crop" affordance on the preview tile. */
  onCrop?: () => void;
};

export function Dropzone({ label, required, hint, subHint, file, onChange, onCrop }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const accept = (f: File | null | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) return;
    onChange(f);
  };

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onChange(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-2.5">
        <span className="font-mono uppercase tracking-wider text-[11px] text-muted font-semibold">
          {label}
        </span>
        {required ? (
          <span className="font-mono uppercase tracking-wider text-[9px] px-1.5 py-[3px] rounded text-amber bg-amber-soft border border-amber-border font-bold">
            REQUIRED
          </span>
        ) : (
          <span className="font-mono uppercase tracking-wider text-[9px] px-1.5 py-[3px] rounded text-muted bg-panel-2 border border-line font-bold">
            OPTIONAL
          </span>
        )}
      </div>

      <div
        // NB: do NOT add onClick={() => inputRef.current?.click()} here — the
        // <input> below covers the entire area (absolute inset-0) and already
        // opens the file picker on click. Adding a parent onClick causes the
        // click to bubble + fire a second picker.
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          accept(e.dataTransfer.files[0]);
          // reset input so re-uploading the same filename still fires onChange
          if (inputRef.current) inputRef.current.value = "";
        }}
        className={
          "relative rounded-xl transition-colors overflow-hidden flex items-center justify-center min-h-[180px] " +
          (file
            ? "border border-line bg-panel"
            : drag
            ? "border-2 border-dashed border-amber bg-amber-soft"
            : "border-2 border-dashed border-line bg-panel hover:border-amber-border hover:bg-amber-soft")
        }
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="absolute inset-0 opacity-0 cursor-pointer z-10"
          onChange={(e) => {
            accept(e.target.files?.[0]);
            // reset so re-uploading the same file still triggers onChange next time
            e.target.value = "";
          }}
        />
        {preview ? (
          <>
            <img src={preview} className="max-w-full max-h-[260px] block pointer-events-none" />
            <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5">
              {onCrop ? (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); e.preventDefault(); onCrop(); }}
                  aria-label="Crop image"
                  title="Crop image"
                  className="inline-flex items-center gap-1 h-8 px-2.5 rounded-full bg-black/65 hover:bg-amber text-white text-[11px] font-semibold shadow-soft transition-colors"
                >
                  <CropIcon className="w-3.5 h-3.5" strokeWidth={2.5} />
                  Crop
                </button>
              ) : null}
              <button
                type="button"
                onClick={clear}
                aria-label="Remove image"
                className="w-8 h-8 rounded-full bg-black/65 hover:bg-red text-white flex items-center justify-center shadow-soft transition-colors"
              >
                <X className="w-4 h-4" strokeWidth={2.5} />
              </button>
            </div>
          </>
        ) : (
          <div className="text-center px-5 pointer-events-none">
            <div className="font-semibold text-[15px] mb-2">{hint}</div>
            {subHint ? <div className="text-muted text-[13px] leading-relaxed">{subHint}</div> : null}
            <div className="text-faint text-[11px] mt-1.5">JPG / PNG / WebP · or click to browse</div>
          </div>
        )}
      </div>
    </div>
  );
}
