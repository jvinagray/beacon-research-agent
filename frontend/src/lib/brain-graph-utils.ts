import type { ContentCategory } from "@/types/brain-graph";

export function lerp(min: number, max: number, t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return min + (max - min) * clamped;
}

const CONTENT_TYPE_MAP: Record<string, ContentCategory> = {
  paper: "academic",
  opinion: "news",
  forum: "news",
  docs: "docs",
  tutorial: "docs",
  course: "docs",
  repository: "media",
  video: "media",
  other: "other",
};

export function mapContentType(contentType: string): ContentCategory {
  return CONTENT_TYPE_MAP[contentType] ?? "other";
}

export const CONTENT_CATEGORY_COLORS: Record<ContentCategory, string> = {
  academic: "hsl(217, 91%, 60%)",
  news: "hsl(38, 92%, 50%)",
  docs: "hsl(142, 71%, 45%)",
  media: "hsl(262, 83%, 58%)",
  other: "hsl(220, 9%, 46%)",
};

export function getContentColor(category: ContentCategory): string {
  return CONTENT_CATEGORY_COLORS[category];
}

export function computeSourceRadius(score: number): number {
  return lerp(8, 24, score / 10);
}

export function computeSourceOpacity(score: number): number {
  return score < 3 ? 0.4 : 1.0;
}
