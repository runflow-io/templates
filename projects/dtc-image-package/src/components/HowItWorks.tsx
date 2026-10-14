import { Upload, Sliders, PackageOpen } from "lucide-react";

const STEPS = [
  {
    n: 1,
    icon: Upload,
    title: "Drop a product image",
    body: "Any supplier photo — AliExpress, 1688, Alibaba, your own. We extract the product and clean it up.",
  },
  {
    n: 2,
    icon: Sliders,
    title: "Pick operations + platforms",
    body: "Isolate, remove objects, swap background, generate lifestyle scenes — then choose where you'll publish (TikTok, Instagram, Pinterest, Amazon).",
  },
  {
    n: 3,
    icon: PackageOpen,
    title: "Get a ZIP with every variant",
    body: "Runflow's smart-resize fans out to every selected aspect ratio. One pack, every platform, ready to upload.",
  },
];

export function HowItWorks() {
  return (
    <section className="mb-10">
      <div className="font-mono uppercase tracking-wider text-[11px] text-muted font-bold mb-3">
        How it works
      </div>
      <div className="grid grid-cols-3 gap-5">
        {STEPS.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.n} className="min-w-0">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-9 h-9 rounded-full bg-green text-white flex items-center justify-center shadow-soft flex-shrink-0">
                  <Icon className="w-4 h-4" />
                </div>
                <span className="font-mono font-bold text-[11px] text-muted">
                  STEP {s.n}
                </span>
              </div>
              <h3 className="text-sm font-semibold mb-1.5 leading-snug">{s.title}</h3>
              <p className="text-[12px] text-ink-2 leading-relaxed">{s.body}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
