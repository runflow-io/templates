// Shared types and presets for operations + platforms.
//
// These drive both the picker UI and the pipeline orchestration.

import {
  Scissors,
  Eraser,
  User,
  Image as ImageIcon,
  Sparkles,
  Tag,
  Crop,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type Operation =
  | "isolate"
  | "remove_object"
  | "remove_model"
  | "background_replace"
  | "lifestyle_scenes"
  | "logo_inpaint"
  | "resize_only";

export type OperationDef = {
  key: Operation;
  title: string;
  description: string;
  icon: LucideIcon;
  /** Outputs produced by this operation (filename hints) */
  outputs: string[];
  /** Coming soon — clickable but pipeline returns a noop */
  soon?: boolean;
};

export const OPERATIONS: OperationDef[] = [
  {
    key: "isolate",
    title: "Isolate product",
    description: "Clean RGBA cutout — PDP / catalog ready",
    icon: Scissors,
    outputs: ["cutout.png"],
  },
  {
    key: "remove_object",
    title: "Remove object",
    description: "Strip watermarks, supplier text, hands, props",
    icon: Eraser,
    outputs: ["cleaned.jpg"],
  },
  {
    key: "remove_model",
    title: "Remove model",
    description: "Ghost mannequin effect — keep just the garment",
    icon: User,
    outputs: ["ghost_mannequin.jpg"],
  },
  {
    key: "background_replace",
    title: "Replace background",
    description: "White studio shot (Amazon main image style)",
    icon: ImageIcon,
    outputs: ["white_studio.jpg"],
  },
  {
    key: "lifestyle_scenes",
    title: "Lifestyle scenes",
    description: "3 AI-picked scenes per product category",
    icon: Sparkles,
    outputs: ["lifestyle_a.jpg", "lifestyle_b.jpg", "lifestyle_c.jpg"],
  },
  {
    key: "logo_inpaint",
    title: "Inpaint logo",
    description: "Place your brand logo onto the product (requires a logo upload)",
    icon: Tag,
    outputs: [],
    soon: true,
  },
  {
    key: "resize_only",
    title: "Resize ad creative",
    description: "Skip the brand pack — just smart-resize an existing image to every platform ratio",
    icon: Crop,
    outputs: [],
  },
];

/** Aspect ratios that runflow/smart-resize accepts. Keep in sync with the API. */
export type AspectRatio = "1:1" | "2:3" | "3:2" | "3:4" | "4:3" | "4:5" | "5:4" | "9:16" | "16:9" | "21:9";

export type Platform =
  | "tiktok"
  | "instagram_feed"
  | "instagram_reel"
  | "facebook_feed"
  | "youtube"
  | "youtube_shorts"
  | "pinterest"
  | "amazon_main"
  | "shopify_pdp";

export type PlatformDef = {
  key: Platform;
  label: string;
  hint: string;
  ratios: AspectRatio[];
};

export const PLATFORMS: PlatformDef[] = [
  { key: "tiktok",          label: "TikTok",            hint: "vertical feed",     ratios: ["9:16"] },
  { key: "instagram_feed",  label: "Instagram Feed",    hint: "square + portrait", ratios: ["1:1", "4:5"] },
  { key: "instagram_reel",  label: "Instagram Reel",    hint: "vertical",          ratios: ["9:16"] },
  { key: "facebook_feed",   label: "Facebook Feed",     hint: "landscape + sq.",   ratios: ["16:9", "1:1"] },
  { key: "youtube",         label: "YouTube",           hint: "widescreen",        ratios: ["16:9"] },
  { key: "youtube_shorts",  label: "YouTube Shorts",    hint: "vertical",          ratios: ["9:16"] },
  { key: "pinterest",       label: "Pinterest",         hint: "pin format",        ratios: ["2:3"] },
  { key: "amazon_main",     label: "Amazon main image", hint: "compliant square",  ratios: ["1:1"] },
  { key: "shopify_pdp",     label: "Shopify PDP",       hint: "product page",      ratios: ["1:1", "4:5"] },
];

/** Collapse a set of selected platforms down to the unique aspect ratios. */
export function uniqueRatios(selected: Platform[]): AspectRatio[] {
  const set = new Set<AspectRatio>();
  for (const key of selected) {
    const def = PLATFORMS.find((p) => p.key === key);
    if (def) for (const r of def.ratios) set.add(r);
  }
  return Array.from(set);
}

// ---------- workflow metadata (for PackDetail "under the hood" links) ----------

export type WorkflowMeta = {
  label: string;
  /** URL of the workflow / model page on runflow.io (where the user can see how it works) */
  url: string;
  /** When false, no Runflow page (e.g. OpenAI direct calls) */
  external?: boolean;
};

// Every workflow page lives on app.runflow.io at /models/<provider>/<slug>.
// Direct (non-Runflow) calls — currently only gpt-4o vision — link to the
// provider's own docs since they don't have a Runflow page.
export const WORKFLOW_META: Record<string, WorkflowMeta> = {
  "runflow/product-isolation": {
    label: "Product Isolation",
    url: "https://app.runflow.io/models/runflow/product-isolation",
  },
  "runflow/object-removal/prompt": {
    label: "Object Removal (Prompt)",
    url: "https://app.runflow.io/models/runflow/object-removal/prompt",
  },
  "runflow/object-removal": {
    label: "Object Removal",
    url: "https://app.runflow.io/models/runflow/object-removal",
  },
  "runflow/smart-resize": {
    label: "Smart Resize",
    url: "https://app.runflow.io/models/runflow/smart-resize",
  },
  "runflow/smart-segmentation": {
    label: "Smart Segmentation",
    url: "https://app.runflow.io/models/runflow/smart-segmentation",
  },
  "runflow/outpaint/aspect-ratio": {
    label: "Outpaint (Aspect Ratio)",
    url: "https://app.runflow.io/models/runflow/outpaint/aspect-ratio",
  },
  "runflow/model-removal": {
    label: "Model Removal",
    url: "https://app.runflow.io/models/runflow/model-removal",
  },
  "runflow/background-replace": {
    label: "Background Replace",
    url: "https://app.runflow.io/models/runflow/background-replace",
  },
  "openai/gpt-image-2/edit": {
    label: "GPT Image 2 — Edit",
    url: "https://app.runflow.io/models/openai/gpt-image-2/edit",
  },
  "openai/gpt-4o": {
    label: "GPT-4o (vision)",
    url: "https://platform.openai.com/docs/models/gpt-4o",
    external: true,
  },
};

export function workflowMeta(slug: string): WorkflowMeta {
  if (WORKFLOW_META[slug]) return WORKFLOW_META[slug];
  // Fallback: every slug lives on app.runflow.io/models/<slug>
  return {
    label: slug,
    url: `https://app.runflow.io/models/${slug}`,
  };
}
