type ParagraphValue =
  | string
  | null
  | undefined
  | object;

export const normalizeWhitespace = (value: string) =>
  value.trim().replace(/\s+/g, " ");

export const normalizeSubjectName = (value: string) =>
  normalizeWhitespace(value).toLowerCase();

export const normalizeOptionalText = (value?: string | null) => {
  if (typeof value !== "string") return null;
  const normalized = normalizeWhitespace(value);
  return normalized || null;
};

export const normalizeCategory = (value?: string | null) => {
  if (typeof value !== "string") return null;
  const normalized = normalizeWhitespace(value);
  return normalized || null;
};

export const buildCaseInsensitiveNameFilter = (value: string) => ({
  equals: normalizeSubjectName(value),
  mode: "insensitive" as const,
});

export const extractPlainParagraphText = (value?: ParagraphValue) => {
  if (typeof value === "string") {
    return normalizeWhitespace(value);
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "";
  }

  const parts = Object.entries(value)
    .map(([language, content]) => {
      const text = typeof content === "string" ? normalizeWhitespace(content) : "";
      if (!text) return "";
      return `${language}: ${text}`;
    })
    .filter(Boolean);

  return parts.join("\n");
};

export const dedupeNormalizedNames = <T extends { name: string }>(items: T[]) => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const normalizedName = normalizeSubjectName(item.name);
    if (!normalizedName || seen.has(normalizedName)) return false;
    seen.add(normalizedName);
    return true;
  });
};
