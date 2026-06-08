import { useState } from "react";
import {
  X,
  ExternalLink,
  Github,
  Settings as SettingsIcon,
  ArrowRight,
  Lock,
  Database,
  Copy,
  Check,
} from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
};

const PROMPT_SECRETS = `Move the Runflow + OpenAI API keys from the browser SettingsModal to Replit Secrets so they never live in the client bundle.

1. Add a small Express (or Vite middleware) server route that proxies /api/runflow/* and /api/openai/* — read RUNFLOW_API_KEY and OPENAI_API_KEY from process.env (set as Replit Secrets, NOT VITE_-prefixed so they stay server-only).
2. The server adds the Authorization: Bearer <key> header before forwarding to api.runflow.io or api.openai.com. The browser never sees the keys.
3. Delete src/lib/keys.ts and src/components/SettingsModal.tsx. Remove key-related state from App.tsx.
4. Update the Header KEYS badge to ping /api/health which returns { runflow: true|false, openai: true|false } based on whether the env vars are set.

This is the production setup — keys in Replit Secrets, browser is dumb.`;

const PROMPT_DB = `Replace the IndexedDB brand-pack storage with Replit's Postgres database + object storage so packs persist across users and devices.

1. Create a Postgres table: packs (id uuid pk, created_at timestamp, product text, category text, analysis jsonb).
2. Store asset blobs in Replit Object Storage (or Postgres bytea if small) — one entry per asset, foreign-keyed to the pack id.
3. Add /api/packs endpoints: GET (list, newest first), GET /:id (one pack with all assets), POST (create a new pack), DELETE /:id.
4. Rewrite src/lib/history.ts to call these endpoints instead of IndexedDB. Keep the same exported function signatures (savePack, listPacks, deletePack) so the rest of the app doesn't change.
5. The RecentPacks UI should keep working unchanged — it just fetches from the API now.`;

export function HowToStartModal({ open, onClose, onOpenSettings }: Props) {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // silent — older browsers / iframes without clipboard permission
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(20,20,20,0.5)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="bg-panel border border-line rounded-xl w-full max-w-2xl max-h-[88vh] overflow-y-auto shadow-soft"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 pb-4 border-b border-line">
          <div>
            <div className="font-mono uppercase tracking-widest text-[10px] text-amber font-bold mb-1">
              Onboarding · 3 steps · ~3 minutes
            </div>
            <h2 className="text-lg font-semibold">Get started</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-panel-2 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-7">

          {/* STEP 1 */}
          <Step n={1} title="Make it yours">
            <p className="text-sm text-ink-2 leading-relaxed mb-3">
              If you're on a shared demo, fork the repo so you have your own copy that you can
              tweak, host, and run on your own credits.
            </p>
            <div className="flex flex-wrap gap-2.5">
              <a
                href="https://replit.com/github/runflow-io/dtc-ad-builder"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-3.5 py-2 bg-ink hover:bg-amber text-white text-xs font-semibold rounded-md transition-colors"
              >
                Open in Replit
                <ArrowRight className="w-3 h-3" />
              </a>
              <a
                href="https://github.com/runflow-io/dtc-ad-builder"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-3.5 py-2 bg-panel-2 hover:bg-line text-ink text-xs font-semibold rounded-md transition-colors"
              >
                <Github className="w-3.5 h-3.5" />
                Fork on GitHub
              </a>
            </div>
            <details className="mt-3 group">
              <summary className="text-xs text-muted cursor-pointer hover:text-ink">
                Prefer to run it locally?
              </summary>
              <pre className="mt-2 p-3 bg-panel-2 border border-line rounded-md text-[11px] font-mono text-ink-2 overflow-x-auto">
{`git clone https://github.com/runflow-io/dtc-ad-builder.git
cd dtc-ad-builder
npm install
npm run dev`}
              </pre>
            </details>
          </Step>

          {/* STEP 2 */}
          <Step n={2} title="Grab your two API keys">
            <p className="text-sm text-ink-2 leading-relaxed mb-3">
              Pay-as-you-go on your own accounts — no subscription, no middleman.
              The app talks to Runflow + OpenAI directly using your keys. Total cost
              per brand pack: <span className="font-semibold">~$0.26</span>.
            </p>

            <div className="space-y-2.5">
              <KeyCard
                label="Runflow API key"
                href="https://app.runflow.io/settings/api-keys"
                purpose="Object removal, product isolation, gpt-image-2 generation, outpaint, smart-resize"
                cost="~$0.25 per pack"
                placeholder="rf_..."
              />
              <KeyCard
                label="OpenAI API key"
                href="https://platform.openai.com/api-keys"
                purpose="gpt-4o vision · reads your product photo to pick scenes"
                cost="~$0.01 per pack"
                placeholder="sk-..."
              />
            </div>
          </Step>

          {/* STEP 3 */}
          <Step n={3} title="Paste keys, pick options, run">
            <p className="text-sm text-ink-2 leading-relaxed mb-3">
              Open Settings, paste both keys, drop a supplier image, pick the operations
              you want (isolate, remove object, lifestyle scenes, etc.) and the platforms
              you'll publish on (TikTok, Instagram, Amazon, etc.). Click{" "}
              <span className="font-semibold">Generate pack</span> — you'll get every
              selected output plus smart-resized variants for every selected platform's
              aspect ratios.
            </p>
            <button
              onClick={() => { onClose(); onOpenSettings(); }}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber hover:bg-amber/90 text-white text-sm font-semibold rounded-md transition-colors shadow-soft"
            >
              <SettingsIcon className="w-3.5 h-3.5" />
              Open Settings
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <p className="text-[11px] text-muted mt-3 leading-relaxed">
              Your keys never leave this browser — they sit in localStorage and are
              sent only to api.runflow.io and api.openai.com via the Vite dev-server proxy.
              Past brand packs live in IndexedDB on this device.
            </p>
          </Step>

          {/* STEP 4 — production hardening */}
          <div className="border-t border-line pt-6">
            <div className="flex gap-4">
              <div className="flex-shrink-0">
                <div className="w-7 h-7 rounded-full bg-panel-2 border border-line text-muted font-mono font-bold text-xs flex items-center justify-center">
                  4
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-sm font-semibold text-ink">Going further (optional)</h3>
                  <span className="font-mono uppercase tracking-wider text-[9px] px-1.5 py-[3px] rounded text-amber bg-amber-soft border border-amber-border font-bold">
                    PRODUCTION
                  </span>
                </div>
                <p className="text-sm text-ink-2 leading-relaxed mb-4">
                  The localStorage + IndexedDB setup is perfect for personal use. If you're
                  shipping this publicly, you'll want keys in Replit Secrets (not the browser)
                  and brand packs in a real database. Paste these into Replit AI and it'll
                  do the work for you.
                </p>

                <PromptCard
                  icon={<Lock className="w-3.5 h-3.5" />}
                  title="Move keys to Replit Secrets"
                  sub="Hide API keys server-side · ~3-step refactor"
                  copyKey="secrets"
                  prompt={PROMPT_SECRETS}
                  copiedKey={copied}
                  onCopy={copy}
                />
                <div className="h-2.5" />
                <PromptCard
                  icon={<Database className="w-3.5 h-3.5" />}
                  title="Persist brand packs in a database"
                  sub="Replit Postgres + object storage · per-pack persistence"
                  copyKey="db"
                  prompt={PROMPT_DB}
                  copiedKey={copied}
                  onCopy={copy}
                />

                <p className="text-[11px] text-muted mt-3 leading-relaxed">
                  Both prompts assume you're running this in a Replit project. Open the
                  Replit AI chat, paste, and watch it edit the files. You can also drop them
                  into Cursor or Claude Code if you're hosting elsewhere.
                </p>
              </div>
            </div>
          </div>

        </div>

        <div className="border-t border-line p-4 flex items-center justify-between gap-3 bg-panel-2/40">
          <div className="text-[11px] text-muted">
            Stuck? See the{" "}
            <a
              href="https://github.com/runflow-io/dtc-ad-builder#readme"
              target="_blank"
              rel="noreferrer"
              className="text-amber hover:underline inline-flex items-center gap-0.5"
            >
              README <ExternalLink className="w-2.5 h-2.5" />
            </a>{" "}
            or open an issue.
          </div>
          <button
            onClick={onClose}
            className="text-xs text-ink-2 hover:bg-panel-2 px-3 py-1.5 rounded-md"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0">
        <div className="w-7 h-7 rounded-full bg-amber-soft border border-amber-border text-amber font-mono font-bold text-xs flex items-center justify-center">
          {n}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-semibold text-ink mb-2">{title}</h3>
        {children}
      </div>
    </div>
  );
}

function KeyCard({
  label,
  href,
  purpose,
  cost,
  placeholder,
}: {
  label: string;
  href: string;
  purpose: string;
  cost: string;
  placeholder: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="block p-3 bg-panel border border-line rounded-lg hover:border-amber-border hover:shadow-soft transition-all group"
    >
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm text-ink">{label}</span>
          <code className="font-mono text-[10px] text-amber bg-amber-soft px-1.5 py-0.5 rounded">
            {placeholder}
          </code>
        </div>
        <span className="text-amber group-hover:translate-x-0.5 transition-transform">
          <ExternalLink className="w-3.5 h-3.5" />
        </span>
      </div>
      <div className="text-[11px] text-muted leading-snug">{purpose}</div>
      <div className="text-[11px] text-ink-2 mt-1 font-mono">{cost}</div>
    </a>
  );
}

function PromptCard({
  icon,
  title,
  sub,
  copyKey,
  prompt,
  copiedKey,
  onCopy,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  copyKey: string;
  prompt: string;
  copiedKey: string | null;
  onCopy: (key: string, text: string) => void;
}) {
  const isCopied = copiedKey === copyKey;
  return (
    <details className="bg-panel border border-line rounded-lg overflow-hidden group">
      <summary className="flex items-center gap-3 p-3 cursor-pointer hover:bg-panel-2/50 list-none">
        <div className="flex-shrink-0 w-7 h-7 rounded-md bg-panel-2 text-ink-2 flex items-center justify-center">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-ink">{title}</div>
          <div className="text-[11px] text-muted leading-snug">{sub}</div>
        </div>
        <span className="text-xs text-amber font-semibold opacity-60 group-open:hidden">Show prompt</span>
        <span className="text-xs text-amber font-semibold opacity-60 hidden group-open:inline">Hide</span>
      </summary>
      <div className="border-t border-line bg-panel-2/30 p-3">
        <div className="relative">
          <pre className="text-[11px] font-mono text-ink-2 whitespace-pre-wrap leading-relaxed bg-panel border border-line rounded-md p-3 pr-20 max-h-[260px] overflow-y-auto">
{prompt}
          </pre>
          <button
            onClick={(e) => { e.preventDefault(); onCopy(copyKey, prompt); }}
            className={
              "absolute top-2 right-2 inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold rounded-md transition-colors " +
              (isCopied
                ? "bg-green text-white"
                : "bg-ink hover:bg-amber text-white")
            }
          >
            {isCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            {isCopied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
    </details>
  );
}
