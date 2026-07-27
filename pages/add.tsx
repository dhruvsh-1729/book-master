import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  FileText,
  Loader2,
  Plus,
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

const fileSize = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
};

const parsePdf = async (file: File) => {
  const pdfjs = await import("pdfjs-dist/webpack.mjs");

  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({ data });
  const pdf = await task.promise;
  const pages: ExtractedPage[] = [];
  let coverDataUrl = "";
  let coverBlob: Blob | null = null;

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);

      if (pageNumber === 1) {
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
      }

      const textContent = await page.getTextContent();
      const text = textContent.items
        .map((item: any) => ("str" in item ? item.str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      pages.push({ pageNumber, text });
      page.cleanup();
    }
  } finally {
    pdf.destroy();
  }

  return { pages, coverDataUrl, coverBlob };
};

const buildDrafts = (pages: ExtractedPage[], pagesPerSplit: number): DraftTransaction[] => {
  const cleanPages = pages.filter((page) => page.text.trim());
  const chunks: ExtractedPage[][] = [];
  for (let i = 0; i < cleanPages.length; i += pagesPerSplit) {
    chunks.push(cleanPages.slice(i, i + pagesPerSplit));
  }

  return chunks.map((chunk, index) => {
    const pageStart = chunk[0]?.pageNumber || index + 1;
    const pageEnd = chunk[chunk.length - 1]?.pageNumber || pageStart;
    const pageNo = pageStart === pageEnd ? String(pageStart) : `${pageStart}-${pageEnd}`;
    return {
      id: createLocalId(),
      srNo: index + 1,
      pageStart,
      pageEnd,
      pageNo,
      paragraphNo: "",
      extractedText: chunk.map((page) => page.text).join("\n\n"),
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
  const [bookForm, setBookForm] = useState<BookFormData>(initialBookForm);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [createdBook, setCreatedBook] = useState<BookMaster | null>(null);
  const [pages, setPages] = useState<ExtractedPage[]>([]);
  const [coverPreview, setCoverPreview] = useState("");
  const [drafts, setDrafts] = useState<DraftTransaction[]>([]);
  const [pagesPerSplit, setPagesPerSplit] = useState(3);
  const [busyMessage, setBusyMessage] = useState("");
  const [alert, setAlert] = useState<{ type: "success" | "error" | "warning" | "info"; message: string } | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [prompts, setPrompts] = useState<AddPromptTemplateView[]>([]);
  const [promptsLoading, setPromptsLoading] = useState(true);
  const [promptsSaving, setPromptsSaving] = useState(false);
  const [showPrompts, setShowPrompts] = useState(false);
  const [promptError, setPromptError] = useState("");

  const selectedForReview = useMemo(
    () => drafts.filter((draft) => draft.subjectReviewStatus === "needs_review").length,
    [drafts]
  );

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
      setAlert({ type: "success", message: "AI prompts saved. The next DeepSeek generation will use the updated prompts." });
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

      const nextDrafts = buildDrafts(parsed.pages, pagesPerSplit);
      setDrafts(nextDrafts);
      setAlert({ type: "success", message: `Book saved. ${parsed.pages.length} page(s) extracted.` });
    } catch (error: any) {
      setAlert({ type: "error", message: error?.message || "Failed to prepare PDF import." });
    } finally {
      setBusyMessage("");
    }
  };

  const regenerateSplits = () => {
    if (!pages.length) return;
    setDrafts(buildDrafts(pages, pagesPerSplit));
    setAlert({ type: "info", message: "Splits regenerated from the extracted PDF text." });
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

    try {
      const batches = batchDraftsByPayloadSize(drafts, 2_600_000);
      const seeded = new Map<string, any>();
      let usedFallback = false;

      for (const batch of batches) {
        const response = await fetch("/api/add/seed-transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sections: batch.map((draft) => ({
              localId: draft.id,
              pageStart: draft.pageStart,
              pageEnd: draft.pageEnd,
              text: draft.extractedText,
            })),
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || "Failed to generate AI drafts");
        (data.transactions || []).forEach((transaction: any) => seeded.set(transaction.localId, transaction));
        usedFallback = usedFallback || Boolean(data.meta?.usedFallback);
      }

      setDrafts((prev) =>
        prev.map((draft) => {
          const match: any = seeded.get(draft.id);
          if (!match) return draft;
          return {
            ...draft,
            title: match.title || draft.title,
            keywords: match.keywords || draft.keywords,
            summary: match.summary || draft.summary,
            conclusion: match.conclusion || draft.conclusion,
            informationRating: match.informationRating || draft.informationRating,
            genericSubjects: match.genericSubjects || draft.genericSubjects,
            specificSubjects: match.specificSubjects || draft.specificSubjects,
          };
        })
      );
      setAlert({
        type: usedFallback ? "warning" : "success",
        message: usedFallback ? "Drafts generated with fallback ranking." : "AI drafts generated.",
      });
    } catch (error: any) {
      setAlert({ type: "error", message: error?.message || "AI generation failed." });
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
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">DeepSeek prompts</p>
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
                onChange={(event) => setPdfFile(event.target.files?.[0] || null)}
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
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-950">Splits</h2>
              <p className="mt-1 text-sm text-slate-600">{drafts.length} draft transaction(s), {selectedForReview} marked for subject review</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="flex items-center rounded-md border border-slate-300 bg-white">
                <span className="px-3 text-xs font-semibold text-slate-600">Pages</span>
                <input
                  type="number"
                  min={1}
                  max={25}
                  value={pagesPerSplit}
                  onChange={(event) => setPagesPerSplit(Math.max(1, Number(event.target.value) || 1))}
                  className="w-16 border-l border-slate-300 px-2 py-2 text-sm focus:outline-none"
                />
              </div>
              <button type="button" onClick={regenerateSplits} className="inline-flex items-center rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                <Scissors className="mr-2 h-4 w-4" />
                Regenerate
              </button>
              <button type="button" onClick={seedDrafts} disabled={seeding || !drafts.length} className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
                {seeding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                Generate AI Data
              </button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => toggleAllReviewStatus("approved")} className="inline-flex items-center rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100">
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
              Mark All Convinced
            </button>
            <button type="button" onClick={() => toggleAllReviewStatus("needs_review")} className="inline-flex items-center rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100">
              <AlertCircle className="mr-1.5 h-3.5 w-3.5" />
              Mark All Review Later
            </button>
          </div>
        </section>
      )}

      <div className="space-y-4">
        {drafts.map((draft) => (
          <section key={draft.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Transaction #{draft.srNo}</p>
                <h3 className="mt-1 truncate text-lg font-semibold text-slate-950">{draft.title || `Pages ${draft.pageNo}`}</h3>
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
              disabled={saving || !drafts.length}
              className="inline-flex items-center justify-center rounded-md bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
              Save Summary Transactions
            </button>
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
