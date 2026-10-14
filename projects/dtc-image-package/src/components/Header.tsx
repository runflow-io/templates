import { Settings, Sparkles, PlayCircle } from "lucide-react";

type Props = {
  keysOk: boolean;
  onOpenSettings: () => void;
  onOpenHowToStart: () => void;
  onOpenProductTour: () => void;
};

export function Header({ keysOk, onOpenSettings, onOpenHowToStart, onOpenProductTour }: Props) {
  return (
    <header className="flex items-center justify-between mb-8">
      <div className="flex items-center gap-3">
        <div
          className="w-8 h-3.5 rounded-full"
          style={{ background: "linear-gradient(90deg, #18181B 0%, #F59E0B 100%)" }}
        />
        <div className="font-bold text-lg tracking-tight">
          Run<span className="text-amber">flow</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={onOpenProductTour}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-ink hover:bg-ink/85 text-white text-xs font-semibold rounded-full shadow-soft transition-colors"
        >
          <PlayCircle className="w-3.5 h-3.5" />
          Product tour
        </button>
        <button
          onClick={onOpenHowToStart}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber hover:bg-amber/90 text-white text-xs font-semibold rounded-full shadow-soft transition-colors"
        >
          <Sparkles className="w-3.5 h-3.5" />
          How to start?
        </button>
        <span
          className={
            "font-mono uppercase tracking-wider text-[10px] px-2.5 py-1 rounded-full border " +
            (keysOk
              ? "text-green border-green/30 bg-green-soft"
              : "text-red border-red/30 bg-red-soft")
          }
        >
          {keysOk ? "KEYS ✓" : "KEYS MISSING"}
        </span>
        <button
          onClick={onOpenSettings}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-ink-2 hover:bg-panel-2 transition-colors"
        >
          <Settings className="w-3.5 h-3.5" />
          Settings
        </button>
      </div>
    </header>
  );
}
