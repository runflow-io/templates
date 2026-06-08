// Recent packs — stored in IndexedDB so they survive reloads.
// One record per pack: metadata + thumbnail blob (a single representative asset).

import type { Analysis, AssetFile } from "./pipeline";

const DB_NAME = "runflow.dtc";
const STORE = "packs";
const VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export type RecentPack = {
  id: string;
  createdAt: number;
  product: string;
  category: string;
  analysis: Analysis;
  thumb: Blob;          // representative thumbnail
  thumbName: string;
  /** Supplier photo as it entered the pipeline (post-crop if a crop was applied). */
  source?: { blob: Blob; filename: string };
  /** Pre-crop supplier photo, kept only when the user actually cropped. */
  originalSource?: { blob: Blob; filename: string };
  assets: { key: string; label: string; description?: string; filename: string; blob: Blob }[];
  /** Runflow / OpenAI workflow slugs that ran for this pack (for "under the hood" links) */
  workflows?: string[];
};

export async function savePack(pack: RecentPack): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(pack);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listPacks(limit = 30): Promise<RecentPack[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    const req = store.getAll();
    req.onsuccess = () => {
      const all = (req.result as RecentPack[]) || [];
      all.sort((a, b) => b.createdAt - a.createdAt);
      resolve(all.slice(0, limit));
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deletePack(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function makeBlobUrl(blob: Blob): string {
  return URL.createObjectURL(blob);
}
