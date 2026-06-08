// API key management — stored in browser localStorage only.
// Never sent anywhere except the Runflow / OpenAI endpoints they belong to.

export type Keys = {
  runflow: string;
  openai: string;
};

const STORAGE_KEY = "runflow.dtc.keys";

export function loadKeys(): Keys {
  if (typeof window === "undefined") return { runflow: "", openai: "" };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { runflow: "", openai: "" };
    const parsed = JSON.parse(raw);
    return {
      runflow: typeof parsed.runflow === "string" ? parsed.runflow : "",
      openai: typeof parsed.openai === "string" ? parsed.openai : "",
    };
  } catch {
    return { runflow: "", openai: "" };
  }
}

export function saveKeys(keys: Keys) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
}

export function clearKeys() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}
