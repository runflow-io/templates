// How outputs are grouped in PackDetail / ResultGrid / ZIP folders.
//
// Each asset key is mapped to a category + (optionally) a sub-bucket like the
// aspect ratio for resized variants.

import { PLATFORMS } from "./options";

export type AssetCategory = "cutout" | "studio" | "lifestyle" | "ad_original" | "ratios" | "other";

export type Categorized = {
  category: AssetCategory;
  /** Subcategory — for ratios, the aspect ratio string (e.g. "9:16"). */
  subKey?: string;
};

export function categorizeAsset(key: string): Categorized {
  if (key === "cutout" || key === "cleaned") return { category: "cutout" };
  if (key === "white") return { category: "studio" };
  if (/^life_[a-z]$/.test(key)) return { category: "lifestyle" };
  if (key === "ad_original") return { category: "ad_original" };

  // dynamic ratio outputs: e.g. life_a_9x16, white_4x5, ad_9x16
  const m = key.match(/^(.+)_(\d+x\d+)$/);
  if (m) {
    const ratio = m[2].replace("x", ":");
    return { category: "ratios", subKey: ratio };
  }

  return { category: "other" };
}

/** Which platforms use a given aspect ratio? (e.g. "9:16" → ["TikTok", "Instagram Reel", "YouTube Shorts"]) */
export function platformsForRatio(ratio: string): string[] {
  return PLATFORMS.filter((p) => p.ratios.includes(ratio as any)).map((p) => p.label);
}

export type GroupedSection = {
  title: string;
  hint: string;
  /** Filesystem-safe slug for ZIP subfolder name. */
  folder: string;
  /** Asset keys belonging to this section in display order. */
  keys: string[];
};

export type CategorySpec = {
  category: AssetCategory;
  title: string;
  hint: string;
  folder: string;
};

const CATEGORY_SPECS: Record<AssetCategory, CategorySpec> = {
  cutout: {
    category: "cutout",
    title: "Cutout",
    hint: "RGBA PNG — drop into PDPs, ads, anywhere you need a transparent product",
    folder: "1-cutout",
  },
  studio: {
    category: "studio",
    title: "White studio",
    hint: "Clean pure-white seamless backdrop · square version is Amazon-compliant",
    folder: "2-studio",
  },
  lifestyle: {
    category: "lifestyle",
    title: "Lifestyle scenes",
    hint: "AI-picked scenes per product category — PDP gallery / IG feed",
    folder: "3-lifestyle",
  },
  ad_original: {
    category: "ad_original",
    title: "Original",
    hint: "Your input image, untouched",
    folder: "0-original",
  },
  ratios: {
    category: "ratios",
    title: "Per-platform ratios",
    hint: "Smart-resized variants for each selected platform's native aspect ratio",
    folder: "4-ratios",
  },
  other: {
    category: "other",
    title: "Other",
    hint: "",
    folder: "5-other",
  },
};

export function groupAssets<T extends { key: string }>(assets: T[]): Array<GroupedSection & { items: T[] }> {
  // group by category then by subKey (for ratios)
  const buckets = new Map<string, { spec: CategorySpec; subKey?: string; items: T[] }>();

  for (const a of assets) {
    const { category, subKey } = categorizeAsset(a.key);
    const bucketKey = subKey ? `${category}:${subKey}` : category;
    const entry = buckets.get(bucketKey);
    if (entry) {
      entry.items.push(a);
    } else {
      buckets.set(bucketKey, {
        spec: CATEGORY_SPECS[category],
        subKey,
        items: [a],
      });
    }
  }

  // sort sections in a stable display order
  const ORDER: AssetCategory[] = ["ad_original", "cutout", "studio", "lifestyle", "ratios", "other"];
  return Array.from(buckets.values())
    .sort((a, b) => {
      const aIdx = ORDER.indexOf(a.spec.category);
      const bIdx = ORDER.indexOf(b.spec.category);
      if (aIdx !== bIdx) return aIdx - bIdx;
      // within ratios, sort by ratio string (1:1, 4:5, 9:16, etc.)
      return (a.subKey || "").localeCompare(b.subKey || "");
    })
    .map((b) => {
      let title = b.spec.title;
      let hint = b.spec.hint;
      let folder = b.spec.folder;
      if (b.subKey) {
        // ratio section: prepend the ratio + list the platforms using it
        const platforms = platformsForRatio(b.subKey);
        title = `${b.subKey} — ${platforms.join(" · ") || "ratio"}`;
        hint = `Variants smart-resized for ${platforms.length ? platforms.join(", ") : `${b.subKey} ratio`}`;
        folder = `${b.spec.folder}-${b.subKey.replace(":", "x")}`;
      }
      return {
        title,
        hint,
        folder,
        keys: b.items.map((i) => i.key),
        items: b.items,
      };
    });
}
