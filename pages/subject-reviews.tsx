import React, { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Plus, Save, Search, Trash2, XCircle } from "lucide-react";
import { Alert, LoadingSpinner, Pagination } from "../components/CoreComponents";
import { AISubjectSuggestion, PaginationInfo, SummaryTransaction } from "../types";
import { normalizeParagraph } from "../components/transactions/TransactionComponents";

const PAGE_SIZE = 10;

type SubjectKind = "pendingGenericSubjects" | "pendingSpecificSubjects";

const emptyPagination: PaginationInfo = { page: 1, limit: PAGE_SIZE, total: 0, pages: 0 };

const normalizeName = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();

const subjectList = (value: unknown): AISubjectSuggestion[] => (Array.isArray(value) ? value : []);

const SubjectRow = ({
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
      ? "border-indigo-200 bg-indigo-50 text-indigo-900"
      : "border-emerald-200 bg-emerald-50 text-emerald-900";

  return (
    <div className={`rounded-md border p-3 ${color}`}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={subject.selected !== false}
          onChange={onToggle}
          className="mt-0.5 h-4 w-4 rounded border-slate-300"
          aria-label={`Select ${subject.name}`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{subject.name}</p>
            {subject.source && (
              <span className="rounded bg-white/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                {subject.source}
              </span>
            )}
            {subject.category && <span className="text-xs text-current/70">{subject.category}</span>}
          </div>
          {subject.reason && <p className="mt-1 text-xs leading-5 text-current/75">{subject.reason}</p>}
        </div>
        <button type="button" onClick={onRemove} className="rounded p-1 text-current/70 hover:bg-white/70 hover:text-current" aria-label="Remove subject">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

const SubjectReviewsPage: React.FC = () => {
  const [transactions, setTransactions] = useState<SummaryTransaction[]>([]);
  const [pagination, setPagination] = useState<PaginationInfo>(emptyPagination);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeActionId, setActiveActionId] = useState<string | null>(null);
  const [alert, setAlert] = useState<{ type: "success" | "error" | "warning" | "info"; message: string } | null>(null);
  const [manualInputs, setManualInputs] = useState<Record<string, { generic: string; specific: string; category: string }>>({});

  const loadReviews = useCallback(async (page = 1, search = searchTerm) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
        status: "needs_review",
      });
      if (search) params.append("search", search);
      const response = await fetch(`/api/subject-reviews?${params.toString()}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Failed to load subject reviews");
      setTransactions(data.transactions || []);
      setPagination(data.pagination || emptyPagination);
    } catch (error: any) {
      setAlert({ type: "error", message: error?.message || "Failed to load subject reviews" });
    } finally {
      setLoading(false);
    }
  }, [searchTerm]);

  useEffect(() => {
    loadReviews(1);
  }, [loadReviews]);

  const updateTransaction = (id: string, patch: Partial<SummaryTransaction>) => {
    setTransactions((prev) => prev.map((transaction) => (transaction.id === id ? { ...transaction, ...patch } : transaction)));
  };

  const toggleSubject = (transaction: SummaryTransaction, kind: SubjectKind, index: number) => {
    const list = [...subjectList(transaction[kind])];
    list[index] = { ...list[index], selected: list[index].selected === false };
    updateTransaction(transaction.id, { [kind]: list } as Partial<SummaryTransaction>);
  };

  const removeSubject = (transaction: SummaryTransaction, kind: SubjectKind, index: number) => {
    updateTransaction(transaction.id, {
      [kind]: subjectList(transaction[kind]).filter((_, subjectIndex) => subjectIndex !== index),
    } as Partial<SummaryTransaction>);
  };

  const addManualSubject = (transaction: SummaryTransaction, type: "generic" | "specific") => {
    const inputs = manualInputs[transaction.id] || { generic: "", specific: "", category: "" };
    const name = normalizeName(type === "generic" ? inputs.generic : inputs.specific);
    if (!name) return;
    const kind: SubjectKind = type === "generic" ? "pendingGenericSubjects" : "pendingSpecificSubjects";
    const current = subjectList(transaction[kind]);
    if (current.some((subject) => normalizeName(subject.name) === name)) return;

    updateTransaction(transaction.id, {
      [kind]: [
        ...current,
        {
          name,
          category: type === "specific" ? inputs.category.trim() || null : null,
          reason: "Manually added during review.",
          source: "manual",
          selected: true,
        },
      ],
    } as Partial<SummaryTransaction>);

    setManualInputs((prev) => ({
      ...prev,
      [transaction.id]: {
        generic: type === "generic" ? "" : inputs.generic,
        specific: type === "specific" ? "" : inputs.specific,
        category: type === "specific" ? "" : inputs.category,
      },
    }));
  };

  const setManualInput = (id: string, field: "generic" | "specific" | "category", value: string) => {
    setManualInputs((prev) => ({
      ...prev,
      [id]: {
        generic: prev[id]?.generic || "",
        specific: prev[id]?.specific || "",
        category: prev[id]?.category || "",
        [field]: value,
      },
    }));
  };

  const submitReview = async (transaction: SummaryTransaction, action: "save" | "approve" | "reject") => {
    setActiveActionId(`${transaction.id}:${action}`);
    setAlert(null);
    try {
      const response = await fetch(`/api/subject-reviews/${transaction.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          genericSubjects: subjectList(transaction.pendingGenericSubjects),
          specificSubjects: subjectList(transaction.pendingSpecificSubjects),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Failed to update subject review");

      if (action === "save") {
        updateTransaction(transaction.id, data as SummaryTransaction);
        setAlert({ type: "success", message: "Review draft saved." });
      } else {
        setTransactions((prev) => prev.filter((item) => item.id !== transaction.id));
        setPagination((prev) => ({ ...prev, total: Math.max(0, prev.total - 1) }));
        setAlert({
          type: "success",
          message: action === "approve" ? "Subjects approved and linked." : "Subject suggestions rejected.",
        });
      }
    } catch (error: any) {
      setAlert({ type: "error", message: error?.message || "Failed to update subject review" });
    } finally {
      setActiveActionId(null);
    }
  };

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    loadReviews(1, searchTerm);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Subject approval</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">Review Queue</h1>
        </div>
        <form onSubmit={handleSearch} className="flex w-full gap-2 md:max-w-md">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search title, keyword, summary"
              className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <button type="submit" className="rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
            Search
          </button>
        </form>
      </div>

      {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />}

      {loading ? (
        <div className="flex h-64 items-center justify-center rounded-lg border border-slate-200 bg-white">
          <LoadingSpinner />
        </div>
      ) : transactions.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
          <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-600" />
          <p className="mt-3 text-sm font-semibold text-slate-900">No pending subject reviews</p>
        </div>
      ) : (
        <div className="space-y-4">
          {transactions.map((transaction) => {
            const paragraph = normalizeParagraph(transaction.relevantParagraph);
            const excerpt = paragraph.english || paragraph.gujarati || paragraph.hindi || paragraph.sanskrit || "";
            const genericSubjects = subjectList(transaction.pendingGenericSubjects);
            const specificSubjects = subjectList(transaction.pendingSpecificSubjects);
            const inputs = manualInputs[transaction.id] || { generic: "", specific: "", category: "" };

            return (
              <section key={transaction.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      {transaction.book?.bookName || "Unknown Book"} · Library {transaction.book?.libraryNumber || "-"}
                    </p>
                    <h2 className="mt-1 text-lg font-semibold text-slate-950">{transaction.title || `Transaction #${transaction.srNo}`}</h2>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
                      <span className="rounded bg-slate-100 px-2 py-1">Sr No. {transaction.srNo}</span>
                      {transaction.pageNo && <span className="rounded bg-slate-100 px-2 py-1">Page {transaction.pageNo}</span>}
                      {transaction.informationRating && <span className="rounded bg-amber-100 px-2 py-1 text-amber-800">{transaction.informationRating}</span>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => submitReview(transaction, "save")}
                      disabled={Boolean(activeActionId)}
                      className="inline-flex items-center rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                    >
                      <Save className="mr-1.5 h-3.5 w-3.5" />
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => submitReview(transaction, "approve")}
                      disabled={Boolean(activeActionId)}
                      className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                    >
                      <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => submitReview(transaction, "reject")}
                      disabled={Boolean(activeActionId)}
                      className="inline-flex items-center rounded-md bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                    >
                      <XCircle className="mr-1.5 h-3.5 w-3.5" />
                      Reject
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-3">
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3 lg:col-span-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Summary</p>
                    <p className="mt-2 line-clamp-6 text-sm leading-6 text-slate-700">{transaction.summary || excerpt || "No summary text."}</p>
                    {transaction.conclusion && (
                      <>
                        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Conclusion</p>
                        <p className="mt-2 line-clamp-4 text-sm leading-6 text-slate-700">{transaction.conclusion}</p>
                      </>
                    )}
                  </div>

                  <div className="space-y-3 rounded-md border border-indigo-200 bg-indigo-50/40 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-indigo-950">Generic Subjects</p>
                      <span className="text-xs font-semibold text-indigo-700">{genericSubjects.filter((subject) => subject.selected !== false).length} selected</span>
                    </div>
                    <div className="grid gap-2">
                      {genericSubjects.length ? genericSubjects.map((subject, index) => (
                        <SubjectRow
                          key={`${subject.name}-${index}`}
                          subject={subject}
                          tone="generic"
                          onToggle={() => toggleSubject(transaction, "pendingGenericSubjects", index)}
                          onRemove={() => removeSubject(transaction, "pendingGenericSubjects", index)}
                        />
                      )) : <p className="text-sm text-slate-500">No generic subjects pending.</p>}
                    </div>
                    <div className="flex gap-2">
                      <input
                        value={inputs.generic}
                        onChange={(event) => setManualInput(transaction.id, "generic", event.target.value)}
                        placeholder="Add generic subject"
                        className="min-w-0 flex-1 rounded-md border border-indigo-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-100"
                      />
                      <button type="button" onClick={() => addManualSubject(transaction, "generic")} className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3 rounded-md border border-emerald-200 bg-emerald-50/40 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-emerald-950">Specific Subjects</p>
                      <span className="text-xs font-semibold text-emerald-700">{specificSubjects.filter((subject) => subject.selected !== false).length} selected</span>
                    </div>
                    <div className="grid gap-2">
                      {specificSubjects.length ? specificSubjects.map((subject, index) => (
                        <SubjectRow
                          key={`${subject.name}-${index}`}
                          subject={subject}
                          tone="specific"
                          onToggle={() => toggleSubject(transaction, "pendingSpecificSubjects", index)}
                          onRemove={() => removeSubject(transaction, "pendingSpecificSubjects", index)}
                        />
                      )) : <p className="text-sm text-slate-500">No specific subjects pending.</p>}
                    </div>
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_140px_auto]">
                      <input
                        value={inputs.specific}
                        onChange={(event) => setManualInput(transaction.id, "specific", event.target.value)}
                        placeholder="Add specific subject"
                        className="min-w-0 rounded-md border border-emerald-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-100"
                      />
                      <input
                        value={inputs.category}
                        onChange={(event) => setManualInput(transaction.id, "category", event.target.value)}
                        placeholder="Category"
                        className="min-w-0 rounded-md border border-emerald-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-100"
                      />
                      <button type="button" onClick={() => addManualSubject(transaction, "specific")} className="inline-flex items-center justify-center rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {activeActionId?.startsWith(transaction.id) && (
                  <div className="mt-3 inline-flex items-center rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                    <LoadingSpinner size="sm" className="mr-2" />
                    Updating review
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {pagination.pages > 1 && <Pagination pagination={pagination} onPageChange={(page) => loadReviews(page)} />}
    </div>
  );
};

export default SubjectReviewsPage;
