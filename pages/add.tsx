import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Crop,
  Eye,
  FileText,
  Loader2,
  Plus,
  RotateCcw,
  RotateCw,
  Save,
  Scissors,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { Alert, FormInput, LoadingSpinner } from "../components/CoreComponents";
import {
  AISubjectSuggestion,
  BookFormData,
  BookMaster,
  SubjectReviewStatus,
} from "../types";

type ExtractedPage = {
  pageNumber: number;
  text: string;
  thumbnailDataUrl?: string;
  error?: string;
};

type PageTextMap = Record<number, string>;

type WhiteoutRect = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type WhiteoutDraft = {
  pageNumber: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
};

type PdfExtractionResponse = {
  pageCount: number;
  pages: ExtractedPage[];
  text?: string;
  hasTextLayer: boolean;
  manualTextRecommended: boolean;
  pageErrors?: Array<{ pageNumber: number; error: string }>;
  source?: "server" | "browser";
};

type AddPromptTemplateView = {
  id?: string;
  key: string;
  label: string;
  description?: string | null;
  promptText: string;
};

type DraftTransaction = {
  id: string;
  srNo: number;
  pageStart: number;
  pageEnd: number;
  pageNo: string;
  paragraphNo: string;
  extractedText: string;
  title: string;
  keywords: string;
  summary: string;
  conclusion: string;
  informationRating: string;
  remark: string;
  footNote: string;
  genericSubjects: AISubjectSuggestion[];
  specificSubjects: AISubjectSuggestion[];
  subjectReviewStatus: SubjectReviewStatus;
  newGenericName: string;
  newSpecificName: string;
  newSpecificCategory: string;
  aiStatus: "idle" | "loading" | "ready" | "error";
  aiError?: string;
};

type BookEditorFormRow = BookFormData["editors"][number];

const createLocalId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const initialBookForm: BookFormData = {
  libraryNumber: "",
  bookName: "",
  bookSummary: "",
  pageNumbers: "",
  grade: "",
  remark: "",
  edition: "",
  publisherName: "",
  coverImageUrl: null,
  coverImagePublicId: null,
  images: [],
  editors: [{ name: "", role: "Author" }],
};

const normalizeName = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const createViewRectFromPoints = (x1: number, y1: number, x2: number, y2: number): Omit<WhiteoutRect, "id"> => {
  const left = clamp01(Math.min(x1, x2));
  const top = clamp01(Math.min(y1, y2));
  const right = clamp01(Math.max(x1, x2));
  const bottom = clamp01(Math.max(y1, y2));
  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
};

const fileSize = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

const PAGE_MARKER_RE = /^\s*(?:[-=_*#]{2,}\s*)?(?:page|pg|p\.)\s*[:#-]?\s*(\d{1,5})(?:\s*(?:[-=_*#]{2,}|\/\s*\d+))?\s*$/i;
const INLINE_PAGE_MARKER_RE = /---\s*Page\s+(\d{1,5})\s*---/gi;

const normalizePdfText = (value: string) =>
  value
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

const hasUsefulText = (value: string) => {
  const letters = (value.match(/\p{L}/gu) || value.match(/[A-Za-z]/g) || []).length;
  return letters >= 40;
};

const parseExtractedTextFile = (raw: string): { pageTextMap: PageTextMap; pageCount: number; mode: "markers" | "page-breaks" | "single" } => {
  const normalized = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const inlineMatches = Array.from(normalized.matchAll(INLINE_PAGE_MARKER_RE));

  if (inlineMatches.length) {
    const pageTextMap: PageTextMap = {};
    inlineMatches.forEach((match, index) => {
      const pageNumber = Number.parseInt(match[1], 10);
      const start = (match.index || 0) + match[0].length;
      const end = index + 1 < inlineMatches.length ? inlineMatches[index + 1].index || normalized.length : normalized.length;
      if (Number.isFinite(pageNumber) && pageNumber > 0) {
        pageTextMap[pageNumber] = normalizePdfText(normalized.slice(start, end));
      }
    });
    return { pageTextMap, pageCount: Object.keys(pageTextMap).length, mode: "markers" };
  }

  const lines = normalized.split("\n");
  const byPage: Record<number, string[]> = {};
  let currentPage: number | null = null;

  for (const line of lines) {
    const marker = line.length <= 80 ? line.match(PAGE_MARKER_RE) : null;
    if (marker) {
      const pageNumber = Number.parseInt(marker[1], 10);
      currentPage = Number.isFinite(pageNumber) && pageNumber > 0 ? pageNumber : null;
      if (currentPage !== null && !byPage[currentPage]) byPage[currentPage] = [];
      continue;
    }

    if (currentPage !== null) {
      byPage[currentPage].push(line);
    }
  }

  if (Object.keys(byPage).length) {
    const pageTextMap: PageTextMap = {};
    Object.entries(byPage).forEach(([page, pageLines]) => {
      pageTextMap[Number(page)] = normalizePdfText(pageLines.join("\n"));
    });
    return { pageTextMap, pageCount: Object.keys(pageTextMap).length, mode: "markers" };
  }

  const pageBreakParts = normalized
    .split(/\f+/g)
    .map((part) => normalizePdfText(part))
    .filter(Boolean);
  if (pageBreakParts.length > 1) {
    const pageTextMap: PageTextMap = {};
    pageBreakParts.forEach((text, index) => {
      pageTextMap[index + 1] = text;
    });
    return { pageTextMap, pageCount: pageBreakParts.length, mode: "page-breaks" };
  }

  const singleText = normalizePdfText(normalized);
  return { pageTextMap: singleText ? { 1: singleText } : {}, pageCount: singleText ? 1 : 0, mode: "single" };
};

const ensurePageList = (pageCount: number, sourcePages: ExtractedPage[] = []) => {
  const byPage = new Map(sourcePages.map((page) => [page.pageNumber, page]));
  return Array.from({ length: Math.max(0, pageCount) }, (_, index) => {
    const pageNumber = index + 1;
    const existing = byPage.get(pageNumber);
    return {
      pageNumber,
      text: existing?.text || "",
      thumbnailDataUrl: existing?.thumbnailDataUrl || "",
      error: existing?.error,
    };
  });
};

const getSectionsFromPages = (sourcePages: ExtractedPage[], cuts: Set<number>) => {
  if (!sourcePages.length) return [] as ExtractedPage[][];
  const sortedCuts = Array.from(cuts)
    .filter((position) => position >= 0 && position < sourcePages.length - 1)
    .sort((a, b) => a - b);
  const sections: ExtractedPage[][] = [];
  let start = 0;
  for (const cut of sortedCuts) {
    sections.push(sourcePages.slice(start, cut + 1));
    start = cut + 1;
  }
  sections.push(sourcePages.slice(start));
  return sections.filter((section) => section.length);
};

const sectionToExtractedText = (chunk: ExtractedPage[]) =>
  chunk
    .map((page) => `--- Page ${page.pageNumber} ---\n${page.text || ""}`)
    .join("\n\n")
    .trim();

const renderCoverFromPdf = async (file: File) => {
  const pdfjs = await import("pdfjs-dist/webpack.mjs");
  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({ data });
  const pdf = await task.promise;
  let coverDataUrl = "";
  let coverBlob: Blob | null = null;

  try {
    const page = await pdf.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(1.8, Math.max(0.8, 760 / baseViewport.width));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (context) {
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      await page.render({ canvasContext: context, viewport }).promise;
      coverDataUrl = canvas.toDataURL("image/webp", 0.72);
      coverBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.72));
    }
    page.cleanup?.();
  } finally {
    pdf?.cleanup?.();
    task?.destroy?.();
  }

  return { coverDataUrl, coverBlob };
};

const extractPdfTextOnServer = async (file: File): Promise<PdfExtractionResponse> => {
  const formData = new FormData();
  formData.append("pdf", file);
  const response = await fetch("/api/add/extract-pdf", { method: "POST", body: formData });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `Server PDF extraction failed (${response.status}).`);
  }

  const pageCount = Number(data.pageCount) || 0;
  const pages = ensurePageList(pageCount, Array.isArray(data.pages) ? data.pages : []);
  return {
    pageCount,
    pages,
    text: typeof data.text === "string" ? data.text : "",
    hasTextLayer: Boolean(data.hasTextLayer),
    manualTextRecommended: Boolean(data.manualTextRecommended),
    pageErrors: Array.isArray(data.pageErrors) ? data.pageErrors : [],
    source: "server",
  };
};

const extractPdfTextInBrowser = async (file: File): Promise<PdfExtractionResponse> => {
  const pdfjs = await import("pdfjs-dist/webpack.mjs");
  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({ data });
  const pdf = await task.promise;
  const pageCount = Number(pdf.numPages) || 0;
  const pages: ExtractedPage[] = [];
  const pageErrors: Array<{ pageNumber: number; error: string }> = [];

  try {
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      let page: any | null = null;
      try {
        page = await pdf.getPage(pageNumber);
        const textContent = await page.getTextContent();
        const text = normalizePdfText(
          (textContent.items || [])
            .map((item: any) => {
              const str = typeof item?.str === "string" ? item.str : "";
              return item?.hasEOL ? `${str}\n` : `${str} `;
            })
            .join("")
        );
        pages.push({ pageNumber, text });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to extract page text.";
        pageErrors.push({ pageNumber, error: message });
        pages.push({ pageNumber, text: "", error: message });
      } finally {
        page?.cleanup?.();
      }
    }
  } finally {
    pdf?.cleanup?.();
    task?.destroy?.();
  }

  const text = pages
    .map((page) => (page.text ? `--- Page ${page.pageNumber} ---\n${page.text}` : ""))
    .filter(Boolean)
    .join("\n\n")
    .trim();

  return {
    pageCount,
    pages,
    text,
    hasTextLayer: hasUsefulText(text),
    manualTextRecommended: !hasUsefulText(text),
    pageErrors,
    source: "browser",
  };
};

const parsePdf = async (file: File) => {
  const [extractionResult, coverResult] = await Promise.allSettled([
    extractPdfTextOnServer(file).catch(async (error) => {
      console.warn("Server PDF extraction failed; using browser fallback", error);
      return extractPdfTextInBrowser(file);
    }),
    renderCoverFromPdf(file),
  ]);

  if (extractionResult.status === "rejected") throw extractionResult.reason;

  const cover =
    coverResult.status === "fulfilled"
      ? coverResult.value
      : { coverDataUrl: "", coverBlob: null as Blob | null };

  if (coverResult.status === "rejected") {
    console.warn("PDF cover rendering skipped", coverResult.reason);
  }

  return {
    ...extractionResult.value,
    pages: ensurePageList(extractionResult.value.pageCount, extractionResult.value.pages),
    coverDataUrl: cover.coverDataUrl,
    coverBlob: cover.coverBlob,
  };
};

const buildDraftsFromSections = (sections: ExtractedPage[][]): DraftTransaction[] => {
  return sections.map((chunk, index) => {
    const pageStart = chunk[0]?.pageNumber || index + 1;
    const pageEnd = chunk[chunk.length - 1]?.pageNumber || pageStart;
    const pageNo = pageStart === pageEnd ? String(pageStart) : `${pageStart}-${pageEnd}`;
    const extractedText = sectionToExtractedText(chunk);

    return {
      id: createLocalId(),
      srNo: index + 1,
      pageStart,
      pageEnd,
      pageNo,
      paragraphNo: "",
      extractedText,
      title: "",
      keywords: "",
      summary: "",
      conclusion: "",
      informationRating: "",
      remark: "",
      footNote: "",
      genericSubjects: [],
      specificSubjects: [],
      subjectReviewStatus: "needs_review",
      newGenericName: "",
      newSpecificName: "",
      newSpecificCategory: "",
      aiStatus: "idle",
    };
  });
};

const estimateJsonSize = (value: unknown) => new Blob([JSON.stringify(value)]).size;

const batchDraftsByPayloadSize = (draftsToBatch: DraftTransaction[], maxBytes: number) => {
  const batches: DraftTransaction[][] = [];
  let current: DraftTransaction[] = [];

  for (const draft of draftsToBatch) {
    const next = [...current, draft];
    const size = estimateJsonSize({
      transactions: next.map((item) => ({
        srNo: item.srNo,
        extractedText: item.extractedText,
        title: item.title,
        summary: item.summary,
        conclusion: item.conclusion,
        genericSubjects: item.genericSubjects,
        specificSubjects: item.specificSubjects,
      })),
    });

    if (size > maxBytes && current.length) {
      batches.push(current);
      current = [draft];
    } else {
      current = next;
    }
  }

  if (current.length) batches.push(current);
  return batches;
};

const SubjectPill = ({
  subject,
  tone,
  onToggle,
  onRemove,
}: {
  subject: AISubjectSuggestion;
  tone: "generic" | "specific";
  onToggle: () => void;
  onRemove: () => void;
}) => {
  const color =
    tone === "generic"
      ? "border-indigo-200 bg-indigo-50 text-indigo-800"
      : "border-emerald-200 bg-emerald-50 text-emerald-800";

  return (
    <div className={`flex items-center gap-2 rounded-md border px-2.5 py-2 text-xs font-medium ${color}`}>
      <input
        type="checkbox"
        checked={subject.selected !== false}
        onChange={onToggle}
        className="h-4 w-4 rounded border-slate-300"
        aria-label={`Select ${subject.name}`}
      />
      <span className="min-w-0 flex-1 truncate">{subject.name}</span>
      <button type="button" onClick={onRemove} className="rounded p-0.5 text-current/70 hover:text-current" aria-label="Remove subject">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

const AddPage: React.FC = () => {
  const router = useRouter();
  const manualTextInputRef = useRef<HTMLInputElement | null>(null);
  const previewSurfaceRef = useRef<HTMLDivElement | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [reactPdf, setReactPdf] = useState<{ Document: any; Page: any } | null>(null);
  const [bookForm, setBookForm] = useState<BookFormData>(initialBookForm);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfPageCount, setPdfPageCount] = useState(0);
  const [createdBook, setCreatedBook] = useState<BookMaster | null>(null);
  const [pages, setPages] = useState<ExtractedPage[]>([]);
  const [coverPreview, setCoverPreview] = useState("");
  const [drafts, setDrafts] = useState<DraftTransaction[]>([]);
  const [splitIndices, setSplitIndices] = useState<Set<number>>(new Set());
  const [busyMessage, setBusyMessage] = useState("");
  const [alert, setAlert] = useState<{ type: "success" | "error" | "warning" | "info"; message: string } | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [prompts, setPrompts] = useState<AddPromptTemplateView[]>([]);
  const [promptsLoading, setPromptsLoading] = useState(true);
  const [promptsSaving, setPromptsSaving] = useState(false);
  const [showPrompts, setShowPrompts] = useState(false);
  const [promptError, setPromptError] = useState("");
  const [manualTextBusy, setManualTextBusy] = useState(false);
  const [manualTextInfo, setManualTextInfo] = useState<{ fileName: string; pageCount: number; mode: string } | null>(null);
  const [pdfTextSource, setPdfTextSource] = useState<"server" | "browser" | "txt" | null>(null);
  const [rotations, setRotations] = useState<Record<number, number>>({});
  const [hoverPreview, setHoverPreview] = useState<{ pageNumber: number; rotation: number } | null>(null);
  const [previewPosition, setPreviewPosition] = useState<number | null>(null);
  const [whiteoutRegionsByPage, setWhiteoutRegionsByPage] = useState<Record<number, WhiteoutRect[]>>({});
  const [whiteoutEditMode, setWhiteoutEditMode] = useState(false);
  const [whiteoutDraft, setWhiteoutDraft] = useState<WhiteoutDraft | null>(null);
  const DocumentComp = reactPdf?.Document;
  const PageComp = reactPdf?.Page;

  const selectedForReview = useMemo(
    () => drafts.filter((draft) => draft.subjectReviewStatus === "needs_review").length,
    [drafts]
  );

  const manualSections = useMemo(() => getSectionsFromPages(pages, splitIndices), [pages, splitIndices]);

  const previewPage =
    previewPosition !== null && previewPosition >= 0 && previewPosition < pages.length
      ? pages[previewPosition]
      : null;

  const previewWhiteoutRects = useMemo(() => {
    if (!previewPage) return [] as WhiteoutRect[];
    return whiteoutRegionsByPage[previewPage.pageNumber] || [];
  }, [previewPage, whiteoutRegionsByPage]);

  const previewDraftRect = useMemo(() => {
    if (!whiteoutDraft || !previewPage || whiteoutDraft.pageNumber !== previewPage.pageNumber) return null;
    return createViewRectFromPoints(
      whiteoutDraft.startX,
      whiteoutDraft.startY,
      whiteoutDraft.currentX,
      whiteoutDraft.currentY
    );
  }, [previewPage, whiteoutDraft]);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient) return;
    let mounted = true;
    import("react-pdf")
      .then((mod) => {
        if (!mounted) return;
        mod.pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${mod.pdfjs.version}/build/pdf.worker.min.mjs`;
        setReactPdf({ Document: mod.Document, Page: mod.Page });
      })
      .catch((error) => {
        console.error("Failed to load PDF preview renderer", error);
      });
    return () => {
      mounted = false;
    };
  }, [isClient]);

  useEffect(() => {
    const loadPrompts = async () => {
      setPromptsLoading(true);
      setPromptError("");
      try {
        const response = await fetch("/api/add/prompts");
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.error || "Failed to load prompts");
        setPrompts(data.prompts || []);
      } catch (error: any) {
        setPromptError(error?.message || "Failed to load prompts");
      } finally {
        setPromptsLoading(false);
      }
    };
    loadPrompts();
  }, []);

  const updateBookField = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = event.target;
    setBookForm((prev) => ({ ...prev, [name]: value }));
  };

  const resetPageTools = () => {
    setRotations({});
    setHoverPreview(null);
    setPreviewPosition(null);
    setWhiteoutRegionsByPage({});
    setWhiteoutEditMode(false);
    setWhiteoutDraft(null);
  };

  const handlePdfFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] || null;
    setPdfFile(nextFile);
    setPdfPageCount(0);
    setPages([]);
    setDrafts([]);
    setSplitIndices(new Set());
    setCoverPreview("");
    setManualTextInfo(null);
    setPdfTextSource(null);
    resetPageTools();
  };

  const handleDocumentLoadSuccess = useCallback(
    ({ numPages }: { numPages: number }) => {
      setPdfPageCount(numPages);
      if (createdBook) {
        setPages((prev) => ensurePageList(numPages, prev));
      }
    },
    [createdBook]
  );

  const updateEditor = (index: number, field: keyof BookEditorFormRow, value: string) => {
    setBookForm((prev) => {
      const editors = [...(prev.editors || [])];
      editors[index] = { ...editors[index], [field]: value };
      return { ...prev, editors };
    });
  };

  const addEditor = () => {
    setBookForm((prev) => ({ ...prev, editors: [...(prev.editors || []), { name: "", role: "Author" }] }));
  };

  const removeEditor = (index: number) => {
    setBookForm((prev) => ({ ...prev, editors: (prev.editors || []).filter((_, idx) => idx !== index) }));
  };

  const updatePrompt = (key: string, promptText: string) => {
    setPrompts((prev) => prev.map((prompt) => (prompt.key === key ? { ...prompt, promptText } : prompt)));
  };

  const savePrompts = async () => {
    setPromptsSaving(true);
    setPromptError("");
    try {
      const response = await fetch("/api/add/prompts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompts: prompts.map((prompt) => ({
            key: prompt.key,
            promptText: prompt.promptText,
          })),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Failed to save prompts");
      setPrompts(data.prompts || prompts);
      setAlert({ type: "success", message: "AI prompts saved. The next generation request will use the updated prompts." });
    } catch (error: any) {
      setPromptError(error?.message || "Failed to save prompts");
    } finally {
      setPromptsSaving(false);
    }
  };

  const uploadCover = async (coverBlob: Blob | null, fallbackDataUrl: string, fileName: string) => {
    if (!coverBlob) return fallbackDataUrl ? { url: fallbackDataUrl, publicId: null } : null;
    const formData = new FormData();
    formData.append("image", new File([coverBlob], `${fileName.replace(/\.pdf$/i, "")}-cover.webp`, { type: "image/webp" }));
    formData.append("folder", "books");

    try {
      const response = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Cover upload failed");
      return { url: data.url as string, publicId: (data.publicId as string) || null };
    } catch (error) {
      console.warn("Cover upload fallback", error);
      setAlert({
        type: "warning",
        message: "Book was saved, but the detected cover could not be stored. Check Cloudinary environment variables on Vercel.",
      });
      return null;
    }
  };

  const applyManualExtractedText = useCallback(
    async (uploaded: File) => {
      if (manualTextBusy) return;

      const knownPageCount = Math.max(pdfPageCount, pages.length);
      if (!knownPageCount) {
        setAlert({ type: "error", message: "Load and extract a PDF before uploading extracted text." });
        return;
      }

      setManualTextBusy(true);
      try {
        const raw = await uploaded.text();
        const parsed = parseExtractedTextFile(raw);
        const pageNumbers = Object.keys(parsed.pageTextMap).map((page) => Number(page));
        const maxUploadedPage = pageNumbers.length ? Math.max(...pageNumbers) : 0;
        if (!parsed.pageCount || !maxUploadedPage) {
          throw new Error('No text found in the .txt file. Use page markers like "--- Page 1 ---" when possible.');
        }

        const targetPageCount = Math.max(knownPageCount, maxUploadedPage);
        const missingPages: number[] = [];
        const nextPages = ensurePageList(targetPageCount, pages).map((page) => {
          if (Object.prototype.hasOwnProperty.call(parsed.pageTextMap, page.pageNumber)) {
            return { ...page, text: parsed.pageTextMap[page.pageNumber], error: undefined };
          }
          if (page.pageNumber <= knownPageCount) missingPages.push(page.pageNumber);
          return page;
        });

        setPages(nextPages);
        setPdfPageCount(targetPageCount);
        setPdfTextSource("txt");
        setManualTextInfo({ fileName: uploaded.name, pageCount: parsed.pageCount, mode: parsed.mode });

        if (drafts.length) {
          const nextSections = getSectionsFromPages(nextPages, splitIndices);
          setDrafts((prev) =>
            prev.map((draft, index) => {
              const section = nextSections[index];
              if (!section) return draft;
              const pageStart = section[0]?.pageNumber || draft.pageStart;
              const pageEnd = section[section.length - 1]?.pageNumber || pageStart;
              return {
                ...draft,
                pageStart,
                pageEnd,
                pageNo: pageStart === pageEnd ? String(pageStart) : `${pageStart}-${pageEnd}`,
                extractedText: sectionToExtractedText(section),
              };
            })
          );
        }

        const warnings: string[] = [];
        if (parsed.mode === "single" && knownPageCount > 1) {
          warnings.push("The file had no page markers, so text was applied to page 1 only.");
        }
        if (missingPages.length) {
          const preview = missingPages.slice(0, 12).join(", ");
          warnings.push(
            `Missing text for ${missingPages.length} page${missingPages.length === 1 ? "" : "s"}: ${preview}${missingPages.length > 12 ? "..." : ""}.`
          );
        }

        setAlert({
          type: warnings.length ? "warning" : "success",
          message: `Applied extracted text from ${uploaded.name} to ${parsed.pageCount} page${parsed.pageCount === 1 ? "" : "s"}.${warnings.length ? ` ${warnings.join(" ")}` : ""}`,
        });
      } catch (error: any) {
        setAlert({ type: "error", message: error?.message || "Failed to apply extracted text file." });
      } finally {
        setManualTextBusy(false);
        if (manualTextInputRef.current) manualTextInputRef.current.value = "";
      }
    },
    [drafts.length, manualTextBusy, pages, pdfPageCount, splitIndices]
  );

  const createBookAndExtract = async () => {
    if (!bookForm.libraryNumber.trim() || !bookForm.bookName.trim()) {
      setAlert({ type: "error", message: "Library number and book name are required." });
      return;
    }
    if (!pdfFile) {
      setAlert({ type: "error", message: "Select a PDF file." });
      return;
    }

    setAlert(null);
    setBusyMessage("Saving book details");

    try {
      const editors = (bookForm.editors || [])
        .map((editor) => ({ name: (editor.name || "").trim(), role: editor.role || "Author" }))
        .filter((editor) => editor.name);

      const createResponse = await fetch("/api/books", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...bookForm, editors }),
      });
      const created = await createResponse.json().catch(() => ({}));
      if (!createResponse.ok) throw new Error(created?.error || "Failed to create book");
      setCreatedBook(created as BookMaster);

      setBusyMessage("Extracting PDF text and cover");
      const parsed = await parsePdf(pdfFile);
      setPages(parsed.pages);
      setPdfPageCount(parsed.pageCount || parsed.pages.length);
      setPdfTextSource(parsed.source || null);
      setManualTextInfo(null);
      setCoverPreview(parsed.coverDataUrl);

      setBusyMessage("Saving detected cover");
      const cover = await uploadCover(parsed.coverBlob, parsed.coverDataUrl, pdfFile.name);
      if (cover) {
        const updateResponse = await fetch(`/api/books/${created.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...bookForm,
            editors,
            coverImageUrl: cover.url,
            coverImagePublicId: cover.publicId,
            images: [cover],
          }),
        });
        const updated = await updateResponse.json().catch(() => ({}));
        if (updateResponse.ok) setCreatedBook(updated as BookMaster);
      }

      setSplitIndices(new Set());
      setDrafts([]);
      resetPageTools();
      const extractedPageCount = parsed.pages.filter((page) => page.text.trim()).length;
      const extractionSource = parsed.source === "browser" ? "locally in the browser" : "on the Node server";
      const pageErrorCount = parsed.pageErrors?.length || 0;
      setAlert({
        type: parsed.manualTextRecommended || pageErrorCount ? "warning" : "success",
        message: parsed.manualTextRecommended
          ? `Book saved and ${parsed.pages.length} page(s) loaded. No usable PDF text layer was found ${extractionSource}; upload the extracted .txt file before creating transaction drafts.`
          : `Book saved. Text was extracted ${extractionSource} for ${extractedPageCount}/${parsed.pages.length} page(s). Review the pages and add split cuts before creating transactions.${pageErrorCount ? ` ${pageErrorCount} page(s) had text extraction warnings.` : ""}`,
      });
    } catch (error: any) {
      setAlert({ type: "error", message: error?.message || "Failed to prepare PDF import." });
    } finally {
      setBusyMessage("");
    }
  };

  const resetDraftsAfterSplitChange = () => {
    if (drafts.length) {
      setAlert({ type: "warning", message: "Split cuts changed. Create transaction drafts again before saving." });
    }
    setDrafts([]);
  };

  const toggleSplit = (position: number) => {
    setSplitIndices((prev) => {
      const next = new Set(prev);
      if (next.has(position)) {
        next.delete(position);
      } else {
        next.add(position);
      }
      return next;
    });
    resetDraftsAfterSplitChange();
  };

  const clearSplitCuts = () => {
    setSplitIndices(new Set());
    resetDraftsAfterSplitChange();
  };

  const rotatePage = (pageNumber: number, direction: "left" | "right") => {
    setRotations((prev) => {
      const current = prev[pageNumber] || 0;
      const delta = direction === "left" ? -90 : 90;
      return { ...prev, [pageNumber]: (current + delta + 360) % 360 };
    });
  };

  const duplicatePageAt = (position: number) => {
    setPages((prev) => {
      const page = prev[position];
      if (!page) return prev;
      const next = [...prev];
      next.splice(position + 1, 0, { ...page });
      return next;
    });
    setSplitIndices(new Set());
    resetDraftsAfterSplitChange();
  };

  const deletePageAt = (position: number) => {
    setPages((prev) => {
      if (prev.length <= 1 || position < 0 || position >= prev.length) return prev;
      const next = prev.filter((_, index) => index !== position);
      if (previewPosition !== null) {
        if (position === previewPosition) setPreviewPosition(null);
        else if (position < previewPosition) setPreviewPosition(previewPosition - 1);
      }
      return next;
    });
    setSplitIndices(new Set());
    resetDraftsAfterSplitChange();
  };

  const openPreview = (position: number, cropMode = false) => {
    setPreviewPosition(position);
    setWhiteoutEditMode(cropMode);
    setWhiteoutDraft(null);
  };

  const getWhiteoutPointerPoint = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const surface = previewSurfaceRef.current;
    if (!surface) return null;
    const rect = surface.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: clamp01((event.clientX - rect.left) / rect.width),
      y: clamp01((event.clientY - rect.top) / rect.height),
    };
  }, []);

  const addWhiteoutRectForPage = useCallback((pageNumber: number, rect: Omit<WhiteoutRect, "id">) => {
    if (rect.width < 0.003 || rect.height < 0.003) return;
    setWhiteoutRegionsByPage((prev) => ({
      ...prev,
      [pageNumber]: [
        ...(prev[pageNumber] || []),
        {
          id: createLocalId(),
          ...rect,
        },
      ],
    }));
  }, []);

  const removeWhiteoutRectForPage = useCallback((pageNumber: number, rectId: string) => {
    setWhiteoutRegionsByPage((prev) => {
      const nextRects = (prev[pageNumber] || []).filter((rect) => rect.id !== rectId);
      if (nextRects.length === (prev[pageNumber] || []).length) return prev;
      const next = { ...prev };
      if (nextRects.length) next[pageNumber] = nextRects;
      else delete next[pageNumber];
      return next;
    });
  }, []);

  const clearWhiteoutsForPage = useCallback((pageNumber: number) => {
    setWhiteoutRegionsByPage((prev) => {
      if (!prev[pageNumber]?.length) return prev;
      const next = { ...prev };
      delete next[pageNumber];
      return next;
    });
  }, []);

  const undoLastWhiteoutForPage = useCallback((pageNumber: number) => {
    setWhiteoutRegionsByPage((prev) => {
      const current = prev[pageNumber] || [];
      if (!current.length) return prev;
      const next = { ...prev };
      const nextRects = current.slice(0, -1);
      if (nextRects.length) next[pageNumber] = nextRects;
      else delete next[pageNumber];
      return next;
    });
  }, []);

  const handlePreviewWhiteoutPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!whiteoutEditMode || !previewPage) return;
      if (event.button !== 0) return;
      const point = getWhiteoutPointerPoint(event);
      if (!point) return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      setWhiteoutDraft({
        pageNumber: previewPage.pageNumber,
        startX: point.x,
        startY: point.y,
        currentX: point.x,
        currentY: point.y,
      });
    },
    [getWhiteoutPointerPoint, previewPage, whiteoutEditMode]
  );

  const handlePreviewWhiteoutPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!whiteoutDraft) return;
      const point = getWhiteoutPointerPoint(event);
      if (!point) return;
      event.preventDefault();
      setWhiteoutDraft((prev) => (prev ? { ...prev, currentX: point.x, currentY: point.y } : prev));
    },
    [getWhiteoutPointerPoint, whiteoutDraft]
  );

  const handlePreviewWhiteoutPointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!whiteoutDraft) return;
      const point = getWhiteoutPointerPoint(event);
      event.preventDefault();
      event.stopPropagation();
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // no-op
      }
      const finalDraft = point
        ? { ...whiteoutDraft, currentX: point.x, currentY: point.y }
        : whiteoutDraft;
      addWhiteoutRectForPage(
        finalDraft.pageNumber,
        createViewRectFromPoints(finalDraft.startX, finalDraft.startY, finalDraft.currentX, finalDraft.currentY)
      );
      setWhiteoutDraft(null);
    },
    [addWhiteoutRectForPage, getWhiteoutPointerPoint, whiteoutDraft]
  );

  const handlePreviewWhiteoutPointerCancel = useCallback(() => {
    setWhiteoutDraft(null);
  }, []);

  const createDraftsFromManualSplits = () => {
    if (!manualSections.length) {
      setAlert({ type: "error", message: "Extract a PDF before creating transaction drafts." });
      return;
    }
    const nextDrafts = buildDraftsFromSections(manualSections);
    setDrafts(nextDrafts);
    setAlert({ type: "success", message: `Created ${nextDrafts.length} editable transaction draft(s) from your page splits.` });
  };

  const updateDraft = (id: string, patch: Partial<DraftTransaction>) => {
    setDrafts((prev) => prev.map((draft) => (draft.id === id ? { ...draft, ...patch } : draft)));
  };

  const removeDraft = (id: string) => {
    setDrafts((prev) => prev.filter((draft) => draft.id !== id).map((draft, index) => ({ ...draft, srNo: index + 1 })));
  };

  const toggleAllReviewStatus = (status: SubjectReviewStatus) => {
    setDrafts((prev) => prev.map((draft) => ({ ...draft, subjectReviewStatus: status })));
  };

  const seedDrafts = async () => {
    if (!drafts.length) return;
    setSeeding(true);
    setAlert(null);

    let successCount = 0;
    let errorCount = 0;
    let heuristicCount = 0;
    const providers = new Set<string>();

    try {
      for (const draft of drafts) {
        updateDraft(draft.id, { aiStatus: "loading", aiError: undefined });

        try {
          const response = await fetch("/api/add/seed-transactions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sections: [
                {
                  localId: draft.id,
                  pageStart: draft.pageStart,
                  pageEnd: draft.pageEnd,
                  text: draft.extractedText,
                },
              ],
            }),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data?.error || "Failed to generate AI draft");
          const match = (data.transactions || []).find((transaction: any) => transaction.localId === draft.id);
          if (!match) throw new Error("AI response did not include this split");

          if (data.meta?.provider) providers.add(data.meta.provider);
          if (data.meta?.usedFallback) heuristicCount += 1;

          setDrafts((prev) =>
            prev.map((item) =>
              item.id === draft.id
                ? {
                    ...item,
                    title: match.title || item.title,
                    keywords: match.keywords || item.keywords,
                    summary: match.summary || item.summary,
                    conclusion: match.conclusion || item.conclusion,
                    informationRating: match.informationRating || item.informationRating,
                    genericSubjects: match.genericSubjects || item.genericSubjects,
                    specificSubjects: match.specificSubjects || item.specificSubjects,
                    aiStatus: "ready",
                    aiError: undefined,
                  }
                : item
            )
          );
          successCount += 1;
        } catch (error: any) {
          errorCount += 1;
          const message = error?.message || "AI generation failed.";
          updateDraft(draft.id, { aiStatus: "error", aiError: message });
        }
      }

      setAlert({
        type: errorCount || heuristicCount ? "warning" : "success",
        message: `AI populated ${successCount}/${drafts.length} draft(s)${
          providers.size ? ` via ${Array.from(providers).join(", ")}` : ""
        }${heuristicCount ? `. ${heuristicCount} used heuristic fallback.` : ""}${
          errorCount ? ` ${errorCount} draft(s) need retry.` : ""
        }`,
      });
    } finally {
      setSeeding(false);
    }
  };

  const toggleSubject = (draftId: string, type: "genericSubjects" | "specificSubjects", index: number) => {
    setDrafts((prev) =>
      prev.map((draft) => {
        if (draft.id !== draftId) return draft;
        const subjects = [...draft[type]];
        subjects[index] = { ...subjects[index], selected: subjects[index].selected === false };
        return { ...draft, [type]: subjects };
      })
    );
  };

  const removeSubject = (draftId: string, type: "genericSubjects" | "specificSubjects", index: number) => {
    setDrafts((prev) =>
      prev.map((draft) => {
        if (draft.id !== draftId) return draft;
        return { ...draft, [type]: draft[type].filter((_, subjectIndex) => subjectIndex !== index) };
      })
    );
  };

  const addManualSubject = (draft: DraftTransaction, type: "generic" | "specific") => {
    const isGeneric = type === "generic";
    const name = normalizeName(isGeneric ? draft.newGenericName : draft.newSpecificName);
    if (!name) return;
    const field = isGeneric ? "genericSubjects" : "specificSubjects";
    const exists = draft[field].some((subject) => normalizeName(subject.name) === name);
    if (exists) return;

    updateDraft(draft.id, {
      [field]: [
        ...draft[field],
        {
          name,
          category: isGeneric ? null : draft.newSpecificCategory.trim() || null,
          reason: "Manually added during PDF review.",
          source: "manual",
          selected: true,
        },
      ],
      newGenericName: isGeneric ? "" : draft.newGenericName,
      newSpecificName: isGeneric ? draft.newSpecificName : "",
      newSpecificCategory: isGeneric ? draft.newSpecificCategory : "",
    } as Partial<DraftTransaction>);
  };

  const saveTransactions = async () => {
    if (!createdBook?.id || !drafts.length) return;
    setSaving(true);
    setAlert(null);

    try {
      const batches = batchDraftsByPayloadSize(drafts, 2_800_000);
      const allCreated: any[] = [];
      let reviewCount = 0;

      for (const batch of batches) {
        const response = await fetch("/api/add/commit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            bookId: createdBook.id,
            transactions: batch.map((draft) => ({
              srNo: draft.srNo,
              pageStart: draft.pageStart,
              pageEnd: draft.pageEnd,
              pageNo: draft.pageNo,
              paragraphNo: draft.paragraphNo,
              extractedText: draft.extractedText,
              title: draft.title,
              keywords: draft.keywords,
              summary: draft.summary,
              conclusion: draft.conclusion,
              informationRating: draft.informationRating,
              remark: draft.remark,
              footNote: draft.footNote,
              genericSubjects: draft.genericSubjects,
              specificSubjects: draft.specificSubjects,
              subjectReviewStatus: draft.subjectReviewStatus,
            })),
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.error || "Failed to save transactions");
        allCreated.push(...(data.created || []));
        reviewCount += data.reviewCount || 0;
      }

      setAlert({
        type: "success",
        message: `Saved ${allCreated.length} transaction(s). ${reviewCount} queued for subject review.`,
      });
      router.push(reviewCount ? "/subject-reviews" : `/books/${createdBook.id}`);
    } catch (error: any) {
      setAlert({ type: "error", message: error?.message || "Failed to save transactions." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">PDF to transactions</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">Add Book</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {createdBook && (
            <button
              type="button"
              onClick={() => router.push(`/books/${createdBook.id}`)}
              className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <BookOpen className="mr-2 h-4 w-4" />
              Open Book
            </button>
          )}
          <button
            type="button"
            onClick={() => router.push("/subject-reviews")}
            className="inline-flex items-center justify-center rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100"
          >
            <AlertCircle className="mr-2 h-4 w-4" />
            Review Queue
          </button>
        </div>
      </div>

      {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />}

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">AI prompts</p>
            <h2 className="mt-1 text-base font-semibold text-slate-950">AI generation prompts</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              These prompts are stored in the database. Changes are used on the next AI generation request.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowPrompts((prev) => !prev)}
              className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              {showPrompts ? "Hide Prompts" : "Show Prompts"}
            </button>
            <button
              type="button"
              onClick={savePrompts}
              disabled={promptsLoading || promptsSaving || !prompts.length}
              className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {promptsSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Prompts
            </button>
          </div>
        </div>

        {promptError && <p className="mt-3 text-sm font-medium text-red-600">{promptError}</p>}

        {showPrompts && (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {promptsLoading ? (
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <LoadingSpinner size="sm" />
                Loading prompts
              </div>
            ) : (
              prompts.map((prompt) => (
                <label key={prompt.key} className="block rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <span className="text-sm font-semibold text-slate-900">{prompt.label}</span>
                  {prompt.description && <span className="mt-1 block text-xs leading-5 text-slate-500">{prompt.description}</span>}
                  <textarea
                    value={prompt.promptText}
                    onChange={(event) => updatePrompt(prompt.key, event.target.value)}
                    rows={prompt.key === "add_pdf_system" ? 5 : 4}
                    className="mt-3 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm leading-6 text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                  />
                </label>
              ))
            )}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-950">Book details</h2>
            {createdBook && <p className="mt-1 text-sm text-emerald-700">Saved as {createdBook.bookName}</p>}
          </div>
          {busyMessage && (
            <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              {busyMessage}
            </span>
          )}
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormInput label="Library Number" name="libraryNumber" value={bookForm.libraryNumber} onChange={updateBookField} required disabled={Boolean(createdBook)} />
              <FormInput label="Book Name" name="bookName" value={bookForm.bookName} onChange={updateBookField} required disabled={Boolean(createdBook)} />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <FormInput label="Pages" name="pageNumbers" value={bookForm.pageNumbers} onChange={updateBookField} placeholder="1-240" disabled={Boolean(createdBook)} />
              <FormInput label="Grade" name="grade" value={bookForm.grade} onChange={updateBookField} disabled={Boolean(createdBook)} />
              <FormInput label="Edition" name="edition" value={bookForm.edition} onChange={updateBookField} disabled={Boolean(createdBook)} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormInput label="Publisher" name="publisherName" value={bookForm.publisherName} onChange={updateBookField} disabled={Boolean(createdBook)} />
              <FormInput label="Remark" name="remark" value={bookForm.remark} onChange={updateBookField} disabled={Boolean(createdBook)} />
            </div>
            <FormInput label="Book Summary" name="bookSummary" type="textarea" rows={3} value={bookForm.bookSummary} onChange={updateBookField} disabled={Boolean(createdBook)} />

            <div className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-800">Authors / Editors</p>
                <button type="button" onClick={addEditor} disabled={Boolean(createdBook)} className="inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-50">
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add
                </button>
              </div>
              <div className="mt-3 space-y-2">
                {(bookForm.editors || []).map((editor, index) => (
                  <div key={index} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_140px_auto]">
                    <input
                      value={editor.name || ""}
                      onChange={(event) => updateEditor(index, "name", event.target.value)}
                      disabled={Boolean(createdBook)}
                      placeholder="Name"
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-100"
                    />
                    <select
                      value={editor.role || "Author"}
                      onChange={(event) => updateEditor(index, "role", event.target.value)}
                      disabled={Boolean(createdBook)}
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-100"
                    >
                      {["Author", "Editor", "Translator", "Co-editor", "Chief Editor", "Assistant Editor"].map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                    <button type="button" onClick={() => removeEditor(index)} disabled={Boolean(createdBook)} className="inline-flex items-center justify-center rounded-md border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <label className="block rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center">
              <UploadCloud className="mx-auto h-7 w-7 text-indigo-600" />
              <span className="mt-2 block text-sm font-semibold text-slate-900">{pdfFile ? pdfFile.name : "Select PDF"}</span>
              <span className="mt-1 block text-xs text-slate-500">{pdfFile ? fileSize(pdfFile.size) : "PDF file is read locally"}</span>
              <input
                type="file"
                accept="application/pdf,.pdf"
                className="sr-only"
                disabled={Boolean(createdBook)}
                onChange={handlePdfFileChange}
              />
            </label>
            {coverPreview && (
              <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                <img src={coverPreview} alt="Detected cover page" className="max-h-80 w-full object-contain" />
              </div>
            )}
            <button
              type="button"
              onClick={createBookAndExtract}
              disabled={Boolean(createdBook) || Boolean(busyMessage)}
              className="inline-flex w-full items-center justify-center rounded-md bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busyMessage ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Book & Extract PDF
            </button>
          </div>
        </div>
      </section>

      {createdBook && (
        <section className="space-y-5">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">Step 2</p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-950">Split PDF into transaction sections</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Click the scissors between pages to create manual cuts. Transaction drafts are created only after you confirm the split layout.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={createDraftsFromManualSplits}
                  disabled={!pages.length}
                  className="inline-flex items-center justify-center rounded-md bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Scissors className="mr-2 h-4 w-4" />
                  Create Transaction Drafts
                </button>
                <button
                  type="button"
                  onClick={seedDrafts}
                  disabled={seeding || !drafts.length}
                  className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {seeding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                  {seeding ? "Generating One by One" : "Generate AI Data"}
                </button>
              </div>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              {pages.length ? (
                isClient && DocumentComp && PageComp && pdfFile ? (
                  <DocumentComp
                    file={pdfFile}
                    onLoadSuccess={handleDocumentLoadSuccess}
                    loading={
                      <div className="flex min-h-[180px] items-center justify-center gap-2 text-sm text-slate-500">
                        <LoadingSpinner size="sm" />
                        Loading PDF pages
                      </div>
                    }
                    error={
                      <div className="flex min-h-[180px] items-center justify-center rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
                        Unable to render PDF pages in this browser.
                      </div>
                    }
                  >
                    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {pages.map((page, index) => {
                        const isSplit = splitIndices.has(index);
                        const isLast = index === pages.length - 1;
                        const rotation = rotations[page.pageNumber] || 0;
                        const pageWhiteouts = whiteoutRegionsByPage[page.pageNumber] || [];
                        return (
                          <div
                            key={`${page.pageNumber}-${index}`}
                            className="group relative overflow-visible"
                            onMouseEnter={() => setHoverPreview({ pageNumber: page.pageNumber, rotation })}
                            onMouseLeave={() => setHoverPreview(null)}
                          >
                            <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-slate-300 hover:shadow-md">
                              <div className="relative flex h-[280px] items-center justify-center overflow-hidden bg-slate-50 p-4">
                                <div className="relative flex max-h-[240px] max-w-full items-center justify-center overflow-hidden rounded border border-slate-200 bg-white p-1 shadow-sm">
                                  <div className="relative inline-block">
                                    <PageComp
                                      key={`page-${page.pageNumber}-${index}-${rotation}`}
                                      pageNumber={page.pageNumber}
                                      width={170}
                                      rotate={rotation}
                                      renderMode="canvas"
                                      renderAnnotationLayer={false}
                                      renderTextLayer={false}
                                      className="pointer-events-none select-none"
                                      loading={
                                        <div className="flex h-[220px] w-[160px] items-center justify-center text-xs font-semibold text-slate-400">
                                          Page {page.pageNumber}
                                        </div>
                                      }
                                      error={
                                        <div className="flex h-[220px] w-[160px] items-center justify-center text-center text-xs font-semibold text-red-500">
                                          Page {page.pageNumber} failed
                                        </div>
                                      }
                                    />
                                    {pageWhiteouts.map((rect, rectIndex) => (
                                      <span
                                        key={`${rect.id}-${rectIndex}`}
                                        className="pointer-events-none absolute border border-white/80 bg-white/70"
                                        style={{
                                          left: `${rect.x * 100}%`,
                                          top: `${rect.y * 100}%`,
                                          width: `${rect.width * 100}%`,
                                          height: `${rect.height * 100}%`,
                                        }}
                                      />
                                    ))}
                                  </div>
                                </div>
                                <div className="absolute inset-x-0 top-0 flex justify-center p-3 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                                  <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg">
                                    <button
                                      type="button"
                                      onClick={() => rotatePage(page.pageNumber, "left")}
                                      className="flex h-8 w-8 items-center justify-center rounded border border-slate-200 bg-white text-slate-700 transition-all hover:bg-slate-50 active:scale-95"
                                      title="Rotate left"
                                      aria-label={`Rotate page ${page.pageNumber} left`}
                                    >
                                      <RotateCcw className="h-4 w-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => rotatePage(page.pageNumber, "right")}
                                      className="flex h-8 w-8 items-center justify-center rounded border border-slate-200 bg-white text-slate-700 transition-all hover:bg-slate-50 active:scale-95"
                                      title="Rotate right"
                                      aria-label={`Rotate page ${page.pageNumber} right`}
                                    >
                                      <RotateCw className="h-4 w-4" />
                                    </button>
                                    <div className="mx-0.5 w-px bg-slate-200" />
                                    <button
                                      type="button"
                                      onClick={() => duplicatePageAt(index)}
                                      className="flex h-8 w-8 items-center justify-center rounded border border-slate-200 bg-white text-slate-700 transition-all hover:bg-slate-50 active:scale-95"
                                      title="Duplicate page"
                                      aria-label={`Duplicate page ${page.pageNumber}`}
                                    >
                                      <Copy className="h-4 w-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => openPreview(index)}
                                      className="flex h-8 w-8 items-center justify-center rounded border border-slate-200 bg-white text-slate-700 transition-all hover:bg-slate-50 active:scale-95"
                                      title="Preview full page"
                                      aria-label={`Preview page ${page.pageNumber}`}
                                    >
                                      <Eye className="h-4 w-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => openPreview(index, true)}
                                      className="flex h-8 w-8 items-center justify-center rounded border border-slate-200 bg-white text-slate-700 transition-all hover:bg-slate-50 active:scale-95"
                                      title="Crop / hide area"
                                      aria-label={`Crop or hide area on page ${page.pageNumber}`}
                                    >
                                      <Crop className="h-4 w-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => deletePageAt(index)}
                                      disabled={pages.length <= 1}
                                      className="flex h-8 w-8 items-center justify-center rounded border border-slate-200 bg-white text-red-600 transition-all hover:bg-red-50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                                      title="Remove page from split plan"
                                      aria-label={`Remove page ${page.pageNumber} from split plan`}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  </div>
                                </div>
                                {(rotation !== 0 || pageWhiteouts.length > 0) && (
                                  <div className="absolute bottom-3 right-3 flex gap-1">
                                    {rotation !== 0 && (
                                      <span className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs font-semibold text-slate-700 shadow-sm">
                                        {rotation}°
                                      </span>
                                    )}
                                    {pageWhiteouts.length > 0 && (
                                      <span className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 shadow-sm">
                                        {pageWhiteouts.length} crop{pageWhiteouts.length === 1 ? "" : "s"}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                              <div className="border-t border-slate-200 bg-slate-50 p-3">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex min-w-0 flex-1 items-center gap-2">
                                    <FileText className="h-4 w-4 flex-shrink-0 text-slate-400" />
                                    <span className="truncate rounded bg-red-50 px-2 py-1 text-xs font-normal text-red-700">
                                      {pdfFile?.name || "PDF"}
                                    </span>
                                  </div>
                                  <span className="flex h-6 min-w-[24px] flex-shrink-0 items-center justify-center rounded bg-slate-950 px-2 text-xs font-semibold text-white">
                                    {page.pageNumber}
                                  </span>
                                </div>
                                <p className="mt-2 line-clamp-2 min-h-[2.5rem] text-xs leading-5 text-slate-500">
                                  {page.text || page.error || "No embedded text detected on this page."}
                                </p>
                              </div>
                            </div>

                            {!isLast && (
                              <div className="absolute -bottom-5 left-1/2 z-10 -translate-x-1/2 sm:-right-4 sm:bottom-auto sm:left-auto sm:top-1/2 sm:-translate-y-1/2 sm:translate-x-0">
                                <button
                                  type="button"
                                  onClick={() => toggleSplit(index)}
                                  className={`flex h-10 w-10 items-center justify-center rounded-full border-2 text-lg shadow-sm transition-all duration-200 hover:scale-110 active:scale-95 ${
                                    isSplit
                                      ? "border-slate-950 bg-slate-950 text-white shadow-md"
                                      : "border-slate-300 bg-white text-slate-600 hover:border-slate-400 hover:bg-slate-50"
                                  }`}
                                  title={isSplit ? "Remove split" : "Split after this page"}
                                  aria-label={isSplit ? `Remove split after page ${page.pageNumber}` : `Split after page ${page.pageNumber}`}
                                >
                                  <Scissors className="h-5 w-5" />
                                </button>
                                {isSplit && (
                                  <div className="absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap rounded border border-slate-950 bg-slate-950 px-2.5 py-1 text-xs font-medium text-white shadow-sm">
                                    Split here
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </DocumentComp>
                ) : (
                  <div className="flex min-h-[180px] items-center justify-center gap-2 text-sm text-slate-500">
                    <LoadingSpinner size="sm" />
                    Loading PDF renderer
                  </div>
                )
              ) : (
                <div className="flex min-h-[180px] flex-col items-center justify-center gap-3 text-center text-slate-500">
                  <Plus className="h-10 w-10 text-slate-400" />
                  <p className="text-sm font-medium">Save book details and extract a PDF to begin splitting.</p>
                </div>
              )}
            </div>

            <aside className="flex h-fit flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-6">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-slate-950">Split Controls</h3>
                <span className="text-xs text-slate-500">{manualSections.length} sections</span>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-800">Pages extracted</span>
                  <span className="text-slate-500">{pages.length}</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="font-medium text-slate-800">Manual cuts</span>
                  <span className="text-slate-500">{splitIndices.size}</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="font-medium text-slate-800">Text source</span>
                  <span className="text-slate-500">{pdfTextSource === "txt" ? "TXT" : pdfTextSource === "browser" ? "Browser" : pdfTextSource === "server" ? "Server" : "None"}</span>
                </div>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-amber-950">Extracted .txt</p>
                    <p className="mt-1 text-xs leading-5 text-amber-800">
                      Upload text from iLovePDF/OCR output when the PDF has no readable text layer.
                    </p>
                  </div>
                  {manualTextBusy && <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-amber-700" />}
                </div>
                <button
                  type="button"
                  onClick={() => manualTextInputRef.current?.click()}
                  disabled={manualTextBusy || !pages.length}
                  className="mt-3 inline-flex w-full items-center justify-center rounded-md border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <UploadCloud className="mr-2 h-4 w-4" />
                  {manualTextBusy ? "Applying text" : "Upload .txt"}
                </button>
                <input
                  ref={manualTextInputRef}
                  type="file"
                  accept=".txt,text/plain"
                  className="sr-only"
                  onChange={(event) => {
                    const uploaded = event.target.files?.[0];
                    if (uploaded) void applyManualExtractedText(uploaded);
                  }}
                />
                {manualTextInfo && (
                  <p className="mt-2 text-xs leading-5 text-amber-800">
                    {manualTextInfo.fileName}: {manualTextInfo.pageCount} page{manualTextInfo.pageCount === 1 ? "" : "s"} ({manualTextInfo.mode})
                  </p>
                )}
                <p className="mt-2 text-xs leading-5 text-amber-800">
                  Best format: <span className="font-mono">--- Page 1 ---</span>. Page-break separated TXT also works.
                </p>
              </div>
              <div className="max-h-[320px] space-y-2 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3">
                {manualSections.map((section, index) => {
                  const pageStart = section[0]?.pageNumber;
                  const pageEnd = section[section.length - 1]?.pageNumber;
                  return (
                    <div key={`${pageStart}-${pageEnd}-${index}`} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800">
                      <p className="font-semibold">Split {index + 1}</p>
                      <p className="text-xs text-slate-500">
                        Pages {pageStart === pageEnd ? pageStart : `${pageStart} - ${pageEnd}`} ({section.length})
                      </p>
                    </div>
                  );
                })}
                {!manualSections.length && <p className="text-center text-xs text-slate-500">No pages extracted yet.</p>}
              </div>
              <div className="grid gap-2">
                <button
                  type="button"
                  onClick={clearSplitCuts}
                  disabled={!splitIndices.size}
                  className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Clear Cuts
                </button>
                <button
                  type="button"
                  onClick={createDraftsFromManualSplits}
                  disabled={!pages.length}
                  className="inline-flex items-center justify-center rounded-md bg-slate-950 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Create {manualSections.length || 0} Draft{manualSections.length === 1 ? "" : "s"}
                </button>
              </div>
              <p className="text-xs leading-5 text-slate-500">
                After drafts are created, AI runs one split at a time and fills the editable fields below.
              </p>
            </aside>
          </div>

          {drafts.length > 0 && (
            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-base font-semibold text-slate-950">Editable Summary Transactions</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    {drafts.length} draft transaction(s), {selectedForReview} marked for subject review
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => toggleAllReviewStatus("approved")} className="inline-flex items-center rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100">
                    <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                    Mark All Convinced
                  </button>
                  <button type="button" onClick={() => toggleAllReviewStatus("needs_review")} className="inline-flex items-center rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100">
                    <AlertCircle className="mr-1.5 h-3.5 w-3.5" />
                    Mark All Review Later
                  </button>
                </div>
              </div>
            </section>
          )}
        </section>
      )}

      <div className="space-y-4">
        {drafts.map((draft) => (
          <section key={draft.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Transaction #{draft.srNo}</p>
                <h3 className="mt-1 truncate text-lg font-semibold text-slate-950">{draft.title || `Pages ${draft.pageNo}`}</h3>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold ${
                      draft.aiStatus === "ready"
                        ? "bg-emerald-50 text-emerald-700"
                        : draft.aiStatus === "loading"
                          ? "bg-indigo-50 text-indigo-700"
                          : draft.aiStatus === "error"
                            ? "bg-red-50 text-red-700"
                            : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {draft.aiStatus === "loading" && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                    {draft.aiStatus === "ready"
                      ? "AI populated"
                      : draft.aiStatus === "loading"
                        ? "AI generating"
                        : draft.aiStatus === "error"
                          ? "AI needs retry"
                          : "AI pending"}
                  </span>
                  {draft.aiError && <span className="text-xs font-medium text-red-600">{draft.aiError}</span>}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <label className="inline-flex items-center rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
                  <input
                    type="checkbox"
                    checked={draft.subjectReviewStatus === "approved"}
                    onChange={() => updateDraft(draft.id, { subjectReviewStatus: draft.subjectReviewStatus === "approved" ? "needs_review" : "approved" })}
                    className="mr-2 h-4 w-4"
                  />
                  Convinced
                </label>
                <label className="inline-flex items-center rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                  <input
                    type="checkbox"
                    checked={draft.subjectReviewStatus === "needs_review"}
                    onChange={() => updateDraft(draft.id, { subjectReviewStatus: draft.subjectReviewStatus === "needs_review" ? "approved" : "needs_review" })}
                    className="mr-2 h-4 w-4"
                  />
                  Review Later
                </label>
                <button type="button" onClick={() => removeDraft(draft.id)} className="inline-flex items-center rounded-md border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50">
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  Remove
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <FormInput label="Sr No." name="srNo" type="number" value={draft.srNo} onChange={(event) => updateDraft(draft.id, { srNo: Number(event.target.value) || draft.srNo })} />
              <FormInput label="Page No." name="pageNo" value={draft.pageNo} onChange={(event) => updateDraft(draft.id, { pageNo: event.target.value })} />
              <FormInput label="Rating" name="informationRating" type="select" value={draft.informationRating} onChange={(event) => updateDraft(draft.id, { informationRating: event.target.value })} options={[
                { value: "", label: "None" },
                { value: "A", label: "A" },
                { value: "A+", label: "A+" },
                { value: "I", label: "I" },
                { value: "I+", label: "I+" },
              ]} />
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)]">
              <FormInput label="Title" name="title" value={draft.title} onChange={(event) => updateDraft(draft.id, { title: event.target.value })} />
              <FormInput label="Keywords" name="keywords" value={draft.keywords} onChange={(event) => updateDraft(draft.id, { keywords: event.target.value })} />
            </div>
            <div className="mt-4">
              <FormInput label="Extracted Text" name="extractedText" type="textarea" rows={6} value={draft.extractedText} onChange={(event) => updateDraft(draft.id, { extractedText: event.target.value })} />
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <FormInput label="Summary" name="summary" type="textarea" rows={4} value={draft.summary} onChange={(event) => updateDraft(draft.id, { summary: event.target.value })} />
              <FormInput label="Conclusion" name="conclusion" type="textarea" rows={4} value={draft.conclusion} onChange={(event) => updateDraft(draft.id, { conclusion: event.target.value })} />
            </div>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <FormInput label="Remark" name="remark" type="textarea" rows={3} value={draft.remark} onChange={(event) => updateDraft(draft.id, { remark: event.target.value })} />
              <FormInput label="Footnote" name="footNote" type="textarea" rows={3} value={draft.footNote} onChange={(event) => updateDraft(draft.id, { footNote: event.target.value })} />
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-3">
                <p className="text-sm font-semibold text-indigo-950">Generic Subjects</p>
                <div className="mt-3 grid gap-2">
                  {draft.genericSubjects.length ? draft.genericSubjects.map((subject, index) => (
                    <SubjectPill
                      key={`${subject.name}-${index}`}
                      subject={subject}
                      tone="generic"
                      onToggle={() => toggleSubject(draft.id, "genericSubjects", index)}
                      onRemove={() => removeSubject(draft.id, "genericSubjects", index)}
                    />
                  )) : <p className="text-sm text-slate-500">No generic subjects selected.</p>}
                </div>
                <div className="mt-3 flex gap-2">
                  <input value={draft.newGenericName} onChange={(event) => updateDraft(draft.id, { newGenericName: event.target.value })} placeholder="Add generic subject" className="min-w-0 flex-1 rounded-md border border-indigo-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100" />
                  <button type="button" onClick={() => addManualSubject(draft, "generic")} className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
                    Add
                  </button>
                </div>
              </div>

              <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
                <p className="text-sm font-semibold text-emerald-950">Specific Subjects</p>
                <div className="mt-3 grid gap-2">
                  {draft.specificSubjects.length ? draft.specificSubjects.map((subject, index) => (
                    <SubjectPill
                      key={`${subject.name}-${index}`}
                      subject={subject}
                      tone="specific"
                      onToggle={() => toggleSubject(draft.id, "specificSubjects", index)}
                      onRemove={() => removeSubject(draft.id, "specificSubjects", index)}
                    />
                  )) : <p className="text-sm text-slate-500">No specific subjects selected.</p>}
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_160px_auto]">
                  <input value={draft.newSpecificName} onChange={(event) => updateDraft(draft.id, { newSpecificName: event.target.value })} placeholder="Add specific subject" className="min-w-0 rounded-md border border-emerald-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-100" />
                  <input value={draft.newSpecificCategory} onChange={(event) => updateDraft(draft.id, { newSpecificCategory: event.target.value })} placeholder="Category" className="min-w-0 rounded-md border border-emerald-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-100" />
                  <button type="button" onClick={() => addManualSubject(draft, "specific")} className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
                    Add
                  </button>
                </div>
              </div>
            </div>
          </section>
        ))}
      </div>

      {createdBook && (
        <div className="sticky bottom-0 z-20 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-lg backdrop-blur sm:mx-0 sm:rounded-lg sm:border">
          <div className="mx-auto flex max-w-7xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-slate-600">
              {drafts.length} transaction(s) ready
              {selectedForReview ? `, ${selectedForReview} in review` : ""}
            </div>
            <button
              type="button"
              onClick={saveTransactions}
              disabled={saving || seeding || !drafts.length}
              className="inline-flex items-center justify-center rounded-md bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
              Save Summary Transactions
            </button>
          </div>
        </div>
      )}

      {hoverPreview && DocumentComp && PageComp && pdfFile && (
        <div className="pointer-events-none fixed inset-y-4 right-4 z-40 hidden items-center lg:flex">
          <div className="flex h-full max-h-[calc(100vh-2rem)] w-[460px] flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-950/95 shadow-2xl backdrop-blur">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Hover preview</p>
                <p className="text-sm font-semibold text-white">Page {hoverPreview.pageNumber}</p>
              </div>
              <span className="rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs font-semibold text-slate-200">
                {hoverPreview.rotation}°
              </span>
            </div>
            <div className="flex flex-1 items-center justify-center overflow-auto p-3">
              <DocumentComp file={pdfFile}>
                <div className="relative inline-block rounded bg-white p-2">
                  <PageComp
                    pageNumber={hoverPreview.pageNumber}
                    renderAnnotationLayer={false}
                    renderTextLayer={false}
                    height={typeof window !== "undefined" ? Math.max(360, Math.min(window.innerHeight - 190, 1000)) : 720}
                    rotate={hoverPreview.rotation || 0}
                    loading={
                      <div className="flex h-[420px] w-[300px] items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
                      </div>
                    }
                  />
                  {(whiteoutRegionsByPage[hoverPreview.pageNumber] || []).map((rect) => (
                    <span
                      key={`hover-${rect.id}`}
                      className="pointer-events-none absolute border border-white/80 bg-white/70"
                      style={{
                        left: `${rect.x * 100}%`,
                        top: `${rect.y * 100}%`,
                        width: `${rect.width * 100}%`,
                        height: `${rect.height * 100}%`,
                      }}
                    />
                  ))}
                </div>
              </DocumentComp>
            </div>
          </div>
        </div>
      )}

      {previewPage && previewPosition !== null && DocumentComp && PageComp && pdfFile && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm sm:p-6"
          onClick={() => {
            setPreviewPosition(null);
            setWhiteoutEditMode(false);
            setWhiteoutDraft(null);
          }}
        >
          <div
            className="relative flex max-h-[95vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-800 p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 text-slate-100">
                  <Eye className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">Page Preview</h3>
                  <p className="text-sm text-slate-400">
                    Page {previewPage.pageNumber} ({previewPosition + 1} of {pages.length})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPreviewPosition(null);
                  setWhiteoutEditMode(false);
                  setWhiteoutDraft(null);
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-semibold text-white transition-all hover:bg-slate-700"
              >
                <X className="h-4 w-4" />
                <span className="hidden sm:inline">Close</span>
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden bg-slate-950 p-4 sm:p-5">
              <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/70 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Crop / hide area</p>
                  <p className="text-sm text-slate-200">
                    {whiteoutEditMode ? "Drag on the page to hide a region." : "Enable draw mode to hide a region on this page preview."}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-200">
                    {previewWhiteoutRects.length} region{previewWhiteoutRects.length === 1 ? "" : "s"}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setWhiteoutEditMode((prev) => !prev);
                      setWhiteoutDraft(null);
                    }}
                    className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold shadow-sm transition ${
                      whiteoutEditMode
                        ? "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-500"
                        : "border-slate-700 bg-slate-800 text-white hover:bg-slate-700"
                    }`}
                  >
                    <Crop className="h-4 w-4" />
                    {whiteoutEditMode ? "Draw mode on" : "Draw crop"}
                  </button>
                  <button
                    type="button"
                    onClick={() => undoLastWhiteoutForPage(previewPage.pageNumber)}
                    disabled={!previewWhiteoutRects.length}
                    className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Undo
                  </button>
                  <button
                    type="button"
                    onClick={() => clearWhiteoutsForPage(previewPage.pageNumber)}
                    disabled={!previewWhiteoutRects.length}
                    className="rounded-lg border border-red-700 bg-red-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto">
                <div className="rounded-lg bg-white p-3 shadow-xl sm:p-4">
                  <DocumentComp file={pdfFile}>
                    <div className="relative inline-block" ref={previewSurfaceRef}>
                      <PageComp
                        key={`preview-${previewPage.pageNumber}-${rotations[previewPage.pageNumber] || 0}`}
                        pageNumber={previewPage.pageNumber}
                        renderMode="canvas"
                        renderAnnotationLayer={false}
                        renderTextLayer={false}
                        width={typeof window !== "undefined" ? Math.max(280, Math.min(window.innerWidth - 120, 920)) : 720}
                        rotate={rotations[previewPage.pageNumber] || 0}
                        loading={
                          <div className="flex h-[600px] w-[424px] items-center justify-center">
                            <Loader2 className="h-10 w-10 animate-spin text-slate-900" />
                          </div>
                        }
                      />
                      <div
                        className={`absolute inset-0 ${whiteoutEditMode ? "cursor-crosshair" : "pointer-events-none"}`}
                        style={{ touchAction: "none" }}
                        onPointerDown={handlePreviewWhiteoutPointerDown}
                        onPointerMove={handlePreviewWhiteoutPointerMove}
                        onPointerUp={handlePreviewWhiteoutPointerUp}
                        onPointerCancel={handlePreviewWhiteoutPointerCancel}
                      >
                        {previewWhiteoutRects.map((rect, index) => (
                          <button
                            key={rect.id}
                            type="button"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              if (whiteoutEditMode) removeWhiteoutRectForPage(previewPage.pageNumber, rect.id);
                            }}
                            onPointerDown={(event) => event.stopPropagation()}
                            title={whiteoutEditMode ? `Region ${index + 1} (click to remove)` : `Region ${index + 1}`}
                            className={`absolute border-2 ${
                              whiteoutEditMode
                                ? "border-slate-100 bg-white/40 hover:bg-white/55"
                                : "pointer-events-none border-slate-100/70 bg-white/65"
                            }`}
                            style={{
                              left: `${rect.x * 100}%`,
                              top: `${rect.y * 100}%`,
                              width: `${rect.width * 100}%`,
                              height: `${rect.height * 100}%`,
                            }}
                          />
                        ))}
                        {previewDraftRect && whiteoutEditMode && (
                          <div
                            className="absolute border-2 border-dashed border-emerald-300 bg-white/35"
                            style={{
                              left: `${previewDraftRect.x * 100}%`,
                              top: `${previewDraftRect.y * 100}%`,
                              width: `${previewDraftRect.width * 100}%`,
                              height: `${previewDraftRect.height * 100}%`,
                            }}
                          />
                        )}
                      </div>
                    </div>
                  </DocumentComp>
                </div>
              </div>
            </div>

            <div className="flex flex-shrink-0 items-center justify-between border-t border-slate-800 p-4 sm:p-5">
              <button
                type="button"
                onClick={() => {
                  if (previewPosition > 0) setPreviewPosition(previewPosition - 1);
                  setWhiteoutDraft(null);
                }}
                disabled={previewPosition === 0}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="hidden sm:inline">Previous</span>
              </button>
              <div className="rounded-lg border border-slate-800 bg-slate-800/50 px-3 py-2 text-center text-sm text-slate-200">
                Rotation: <span className="font-semibold text-white">{rotations[previewPage.pageNumber] || 0}°</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (previewPosition < pages.length - 1) setPreviewPosition(previewPosition + 1);
                  setWhiteoutDraft(null);
                }}
                disabled={previewPosition === pages.length - 1}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="hidden sm:inline">Next</span>
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {busyMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
          <div className="rounded-lg bg-white px-5 py-4 shadow-xl">
            <div className="flex items-center gap-3 text-sm font-semibold text-slate-800">
              <LoadingSpinner size="sm" />
              {busyMessage}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AddPage;
