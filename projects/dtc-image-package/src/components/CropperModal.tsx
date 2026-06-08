// Free-form crop modal — opens after the supplier image is dropped so the
// user can isolate the part of the photo they actually want the pipeline
// to work on. Confirms with a cropped File; cancels with the original.

import { useEffect, useRef, useState } from "react";
import ReactCrop, { type Crop, type PixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { Check, X } from "lucide-react";

type Props = {
  file: File;
  onConfirm: (file: File) => void;
  onCancel: () => void;
};

async function cropToFile(
  image: HTMLImageElement,
  crop: PixelCrop,
  originalName: string,
  originalType: string
): Promise<File> {
  // Convert displayed-pixel crop to natural-pixel crop so we cut at full res.
  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;
  const sx = Math.round(crop.x * scaleX);
  const sy = Math.round(crop.y * scaleY);
  const sw = Math.round(crop.width * scaleX);
  const sh = Math.round(crop.height * scaleY);

  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, sw, sh);

  // Keep PNG if original was PNG (preserves transparency); JPEG otherwise.
  const outType = originalType === "image/png" ? "image/png" : "image/jpeg";
  const ext = outType === "image/png" ? "png" : "jpg";
  const base = originalName.replace(/\.[^.]+$/, "") || "supplier";
  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob returned null"))),
      outType,
      0.95
    )
  );
  return new File([blob], `${base}-cropped.${ext}`, { type: outType });
}

export function CropperModal({ file, onConfirm, onCancel }: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completed, setCompleted] = useState<PixelCrop | null>(null);
  const [busy, setBusy] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const onImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    imgRef.current = img;
    // default crop: full image
    const c: PixelCrop = { unit: "px", x: 0, y: 0, width: img.width, height: img.height };
    setCrop(c);
    setCompleted(c);
  };

  const confirm = async () => {
    if (!imgRef.current || !completed || completed.width < 4 || completed.height < 4) {
      onConfirm(file);
      return;
    }
    setBusy(true);
    try {
      const out = await cropToFile(imgRef.current, completed, file.name, file.type);
      onConfirm(out);
    } catch {
      onConfirm(file);
    } finally {
      setBusy(false);
    }
  };

  const useOriginal = () => onConfirm(file);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-bg border border-line rounded-xl shadow-card max-w-4xl w-full max-h-[92vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-line">
          <div>
            <h3 className="font-semibold text-base leading-tight">Crop your supplier photo</h3>
            <p className="text-[12px] text-muted mt-0.5">
              Drag to isolate the product. Skip if the whole image is fine.
            </p>
          </div>
          <button
            onClick={onCancel}
            aria-label="Cancel"
            className="w-8 h-8 rounded-full text-ink-2 hover:bg-panel-2 flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-auto bg-panel-2 p-5 flex items-center justify-center checker">
          {src ? (
            <ReactCrop
              crop={crop}
              onChange={(_, percent) => setCrop(percent)}
              onComplete={(c) => setCompleted(c)}
              keepSelection
              className="max-h-[60vh]"
            >
              <img
                src={src}
                onLoad={onImgLoad}
                className="block max-h-[60vh] max-w-full"
                alt="crop preview"
              />
            </ReactCrop>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-t border-line bg-panel">
          <button
            onClick={useOriginal}
            disabled={busy}
            className="text-xs font-semibold text-ink-2 hover:text-amber disabled:opacity-50"
          >
            Use original (skip crop)
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onCancel}
              disabled={busy}
              className="px-4 py-2 text-xs font-semibold text-ink-2 hover:bg-panel-2 rounded-md disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={confirm}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-ink hover:bg-amber text-white text-xs font-semibold rounded-md shadow-soft transition-colors disabled:bg-faint disabled:cursor-not-allowed"
            >
              <Check className="w-3.5 h-3.5" />
              {busy ? "Cropping…" : "Use crop"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
