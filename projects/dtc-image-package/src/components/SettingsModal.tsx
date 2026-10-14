import { useEffect, useState } from "react";
import { X, ExternalLink } from "lucide-react";
import type { Keys } from "../lib/keys";

type Props = {
  open: boolean;
  initial: Keys;
  onClose: () => void;
  onSave: (keys: Keys) => void;
};

export function SettingsModal({ open, initial, onClose, onSave }: Props) {
  const [runflow, setRunflow] = useState(initial.runflow);
  const [openai, setOpenai] = useState(initial.openai);

  useEffect(() => {
    if (open) {
      setRunflow(initial.runflow);
      setOpenai(initial.openai);
    }
  }, [open, initial.runflow, initial.openai]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(20,20,20,0.5)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="bg-panel border border-line rounded-xl w-full max-w-md p-6 shadow-soft"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold">API keys</h2>
          <button onClick={onClose} className="p-1 hover:bg-panel-2 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-muted leading-relaxed mb-5">
          Keys are stored only in this browser's localStorage. They're sent to Runflow
          and OpenAI directly and never to any third party. You pay Runflow + OpenAI
          per use on your own accounts.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1.5">
              Runflow API key
            </label>
            <input
              type="password"
              value={runflow}
              onChange={(e) => setRunflow(e.target.value)}
              placeholder="rf_..."
              className="w-full px-3 py-2 text-sm font-mono bg-panel border border-line rounded-md focus:outline-none focus:border-amber focus:ring-2 focus:ring-amber/20"
            />
            <a
              href="https://app.runflow.io/settings/api-keys"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-amber mt-1.5 hover:underline"
            >
              Get one at app.runflow.io <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1.5">
              OpenAI API key
            </label>
            <input
              type="password"
              value={openai}
              onChange={(e) => setOpenai(e.target.value)}
              placeholder="sk-..."
              className="w-full px-3 py-2 text-sm font-mono bg-panel border border-line rounded-md focus:outline-none focus:border-amber focus:ring-2 focus:ring-amber/20"
            />
            <a
              href="https://platform.openai.com/api-keys"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-amber mt-1.5 hover:underline"
            >
              Get one at platform.openai.com <ExternalLink className="w-3 h-3" />
            </a>
            <p className="text-[11px] text-faint mt-1.5">
              Used only for the gpt-4o scene-analysis step. All image generation goes through Runflow.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-ink-2 hover:bg-panel-2 rounded-md"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave({ runflow: runflow.trim(), openai: openai.trim() })}
            disabled={!runflow.trim() || !openai.trim()}
            className="px-5 py-2 text-sm font-semibold text-white bg-ink hover:bg-amber rounded-md transition-colors disabled:bg-faint disabled:cursor-not-allowed"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
