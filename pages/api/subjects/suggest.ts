import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "@/lib/prisma";
import { getUserIdFromRequest } from "@/lib/auth";
import {
  extractPlainParagraphText,
  normalizeCategory,
  normalizeSubjectName,
  normalizeWhitespace,
} from "@/lib/subjects/normalization";

type SubjectCandidate = {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  _count?: {
    summaryTransactions: number;
  };
};

type SuggestionShape = {
  name?: string;
  reason?: string;
  category?: string | null;
};

const SARVAM_API_URL = process.env.SARVAM_API_URL || "https://api.sarvam.ai/v1/chat/completions";
const SARVAM_MODEL = process.env.SARVAM_MODEL || "sarvam-m";
const GENERIC_LIMIT = 6;
const SPECIFIC_LIMIT = 8;
const CANDIDATE_LIMIT = 24;
const SOURCE_TEXT_LIMIT = 3200;

const STOP_WORDS = new Set([
  "about",
  "after",
  "before",
  "being",
  "between",
  "book",
  "books",
  "from",
  "have",
  "into",
  "more",
  "most",
  "much",
  "only",
  "page",
  "pages",
  "paragraph",
  "summary",
  "than",
  "that",
  "their",
  "there",
  "these",
  "this",
  "transaction",
  "transactions",
  "title",
  "with",
]);

const clipText = (value?: string | null, maxLength = 140) => {
  const normalized = normalizeWhitespace(value || "");
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3)}...`;
};

const tokenize = (value: string) =>
  Array.from(
    new Set(
      normalizeSubjectName(value)
        .split(/[^a-z0-9\u0900-\u097f\u0a80-\u0aff]+/i)
        .map((token) => token.trim())
        .filter((token) => token.length > 2 && !STOP_WORDS.has(token))
    )
  );

const buildSourceText = (title?: string, relevantParagraph?: unknown) => {
  const parts = [
    normalizeWhitespace(String(title || "")),
    extractPlainParagraphText(relevantParagraph as any),
  ].filter(Boolean);

  return parts.join("\n\n").slice(0, SOURCE_TEXT_LIMIT);
};

const rankSubjects = (
  subjects: SubjectCandidate[],
  sourceText: string,
  selectedIds: Set<string>,
  limit: number
) => {
  const sourceLower = sourceText.toLowerCase();
  const sourceTokens = new Set(tokenize(sourceText));

  const scored = subjects
    .map((subject) => {
      const normalizedName = normalizeSubjectName(subject.name);
      const nameTokens = tokenize(subject.name);
      const auxiliaryTokens = tokenize(
        [subject.description || "", subject.category || ""].join(" ")
      );

      let score = 0;

      if (normalizedName && sourceLower.includes(normalizedName)) {
        score += 32;
      }

      for (const token of nameTokens) {
        if (sourceTokens.has(token)) score += 6;
      }

      for (const token of auxiliaryTokens) {
        if (sourceTokens.has(token)) score += 2;
      }

      if (selectedIds.has(subject.id)) {
        score += 3;
      }

      score += Math.min(subject._count?.summaryTransactions || 0, 20) * 0.2;

      return { ...subject, score };
    })
    .filter((subject) => subject.score > 0)
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return a.name.localeCompare(b.name);
    });

  return scored.slice(0, limit);
};

const formatCandidateList = (subjects: SubjectCandidate[]) =>
  subjects
    .map((subject) => {
      const category = subject.category ? ` [${subject.category}]` : "";
      const description = subject.description ? ` :: ${clipText(subject.description)}` : "";
      return `- ${subject.name}${category}${description}`;
    })
    .join("\n");

const buildPrompt = ({
  title,
  sourceText,
  currentGenericNames,
  currentSpecificNames,
  genericCandidates,
  specificCandidates,
}: {
  title: string;
  sourceText: string;
  currentGenericNames: string[];
  currentSpecificNames: string[];
  genericCandidates: SubjectCandidate[];
  specificCandidates: SubjectCandidate[];
}) => `
You are helping label a research summary transaction.

Rules:
1. Return strict JSON only.
2. Suggest broad umbrella themes in "genericSubjects".
3. Suggest precise granular subjects in "specificSubjects".
4. Prefer existing candidates when they fit. Use the candidate name exactly as written.
5. If no existing candidate fits, propose a new short lowercase name.
6. Every subject name must be completely lowercase.
7. Avoid duplicates. Avoid vague filler like "miscellaneous".
8. Include a short reason for every suggestion.
9. For a new specific subject, include a short category if helpful. Otherwise use null.

JSON schema:
{
  "genericSubjects": [
    { "name": "string", "reason": "string" }
  ],
  "specificSubjects": [
    { "name": "string", "reason": "string", "category": "string|null" }
  ]
}

Transaction title:
${title || "(none)"}

Reference text:
${sourceText || "(none)"}

Current generic subjects:
${currentGenericNames.length ? currentGenericNames.join(", ") : "(none)"}

Current specific subjects:
${currentSpecificNames.length ? currentSpecificNames.join(", ") : "(none)"}

Existing generic candidates:
${genericCandidates.length ? formatCandidateList(genericCandidates) : "(none)"}

Existing specific candidates:
${specificCandidates.length ? formatCandidateList(specificCandidates) : "(none)"}
`;

const extractJsonPayload = (value: string) => {
  const trimmed = value.trim();
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("No JSON object found in AI response");
  }

  return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
};

const normalizeSuggestions = ({
  suggestions,
  subjectsByName,
  selectedIds,
  limit,
}: {
  suggestions: SuggestionShape[];
  subjectsByName: Map<string, SubjectCandidate>;
  selectedIds: Set<string>;
  limit: number;
}) => {
  const results: Array<{
    name: string;
    subjectId?: string;
    description?: string | null;
    category?: string | null;
    reason: string;
    source: "existing" | "new";
    selected: boolean;
  }> = [];
  const seen = new Set<string>();

  for (const suggestion of suggestions || []) {
    const normalizedName = normalizeSubjectName(String(suggestion?.name || ""));
    if (!normalizedName || seen.has(normalizedName)) continue;

    const existing = subjectsByName.get(normalizedName);
    const reason = clipText(String(suggestion?.reason || "Relevant to the title and paragraph."), 180);

    results.push({
      name: existing?.name || normalizedName,
      subjectId: existing?.id,
      description: existing?.description ?? null,
      category: existing?.category ?? normalizeCategory(suggestion?.category || null),
      reason,
      source: existing ? "existing" : "new",
      selected: existing ? selectedIds.has(existing.id) : false,
    });

    seen.add(normalizedName);
    if (results.length >= limit) break;
  }

  return results;
};

const buildFallbackSuggestions = ({
  candidates,
  selectedIds,
  limit,
}: {
  candidates: SubjectCandidate[];
  selectedIds: Set<string>;
  limit: number;
}) =>
  candidates.slice(0, limit).map((candidate) => ({
    name: candidate.name,
    subjectId: candidate.id,
    description: candidate.description ?? null,
    category: candidate.category ?? null,
    reason: "Matched from existing subject names and metadata against the title and paragraph.",
    source: "existing" as const,
    selected: selectedIds.has(candidate.id),
  }));

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const userId = getUserIdFromRequest(req);
  if (!userId) return res.status(401).json({ error: "Authentication required" });

  try {
    const {
      title,
      relevantParagraph,
      genericSubjectIds = [],
      specificSubjectIds = [],
    } = req.body ?? {};

    const safeTitle = normalizeWhitespace(String(title || ""));
    const sourceText = buildSourceText(safeTitle, relevantParagraph);
    if (!safeTitle && !sourceText) {
      return res.status(400).json({ error: "Provide a title or relevant paragraph for AI suggestions" });
    }

    const genericSelectedIds = new Set(
      Array.isArray(genericSubjectIds)
        ? genericSubjectIds.map((value: unknown) => String(value)).filter(Boolean)
        : []
    );
    const specificSelectedIds = new Set(
      Array.isArray(specificSubjectIds)
        ? specificSubjectIds.map((value: unknown) => String(value)).filter(Boolean)
        : []
    );

    const [allGenericSubjects, allSpecificSubjects] = await Promise.all([
      prisma.genericSubjectMaster.findMany({
        select: {
          id: true,
          name: true,
          description: true,
          _count: {
            select: {
              summaryTransactions: true,
            },
          },
        },
        orderBy: [{ name: "asc" }],
      }),
      prisma.tagMaster.findMany({
        select: {
          id: true,
          name: true,
          description: true,
          category: true,
          _count: {
            select: {
              summaryTransactions: true,
            },
          },
        },
        orderBy: [{ name: "asc" }],
      }),
    ]);

    const genericCandidates = rankSubjects(
      allGenericSubjects,
      sourceText,
      genericSelectedIds,
      CANDIDATE_LIMIT
    );
    const specificCandidates = rankSubjects(
      allSpecificSubjects,
      sourceText,
      specificSelectedIds,
      CANDIDATE_LIMIT
    );

    const genericSubjectsByName = new Map(
      allGenericSubjects.map((subject) => [normalizeSubjectName(subject.name), subject])
    );
    const specificSubjectsByName = new Map(
      allSpecificSubjects.map((subject) => [normalizeSubjectName(subject.name), subject])
    );

    const currentGenericNames = allGenericSubjects
      .filter((subject) => genericSelectedIds.has(subject.id))
      .map((subject) => subject.name);
    const currentSpecificNames = allSpecificSubjects
      .filter((subject) => specificSelectedIds.has(subject.id))
      .map((subject) => subject.name);

    const fallbackPayload = {
      genericSuggestions: buildFallbackSuggestions({
        candidates: genericCandidates,
        selectedIds: genericSelectedIds,
        limit: GENERIC_LIMIT,
      }),
      specificSuggestions: buildFallbackSuggestions({
        candidates: specificCandidates,
        selectedIds: specificSelectedIds,
        limit: SPECIFIC_LIMIT,
      }),
      meta: {
        usedFallback: true,
        model: process.env.SARVAM_API_KEY ? SARVAM_MODEL : "heuristic-only",
        title: safeTitle,
        candidateCounts: {
          generic: genericCandidates.length,
          specific: specificCandidates.length,
        },
      },
    };

    if (!process.env.SARVAM_API_KEY) {
      return res.status(200).json(fallbackPayload);
    }

    try {
      const response = await fetch(SARVAM_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-subscription-key": process.env.SARVAM_API_KEY,
        },
        body: JSON.stringify({
          model: SARVAM_MODEL,
          messages: [
            {
              role: "system",
              content:
                "You classify research summaries into subject taxonomies. Always respond with strict JSON only.",
            },
            {
              role: "user",
              content: buildPrompt({
                title: safeTitle,
                sourceText,
                currentGenericNames,
                currentSpecificNames,
                genericCandidates,
                specificCandidates,
              }),
            },
          ],
          temperature: 0.2,
          max_tokens: 900,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Sarvam subject suggestion error", response.status, errorText);
        return res.status(200).json(fallbackPayload);
      }

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.trim()) {
        return res.status(200).json(fallbackPayload);
      }

      const parsed = extractJsonPayload(content);
      const genericSuggestions = normalizeSuggestions({
        suggestions: Array.isArray(parsed?.genericSubjects) ? parsed.genericSubjects : [],
        subjectsByName: genericSubjectsByName,
        selectedIds: genericSelectedIds,
        limit: GENERIC_LIMIT,
      });
      const specificSuggestions = normalizeSuggestions({
        suggestions: Array.isArray(parsed?.specificSubjects) ? parsed.specificSubjects : [],
        subjectsByName: specificSubjectsByName,
        selectedIds: specificSelectedIds,
        limit: SPECIFIC_LIMIT,
      });

      return res.status(200).json({
        genericSuggestions: genericSuggestions.length
          ? genericSuggestions
          : fallbackPayload.genericSuggestions,
        specificSuggestions: specificSuggestions.length
          ? specificSuggestions
          : fallbackPayload.specificSuggestions,
        meta: {
          usedFallback: !genericSuggestions.length || !specificSuggestions.length,
          model: SARVAM_MODEL,
          title: safeTitle,
          candidateCounts: {
            generic: genericCandidates.length,
            specific: specificCandidates.length,
          },
        },
      });
    } catch (aiError) {
      console.error("Sarvam subject suggestion fallback", aiError);
      return res.status(200).json(fallbackPayload);
    }
  } catch (error) {
    console.error("POST /subjects/suggest error", error);
    return res.status(500).json({ error: "Failed to suggest subjects" });
  }
}
