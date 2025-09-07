// types/index.ts

export interface User {
  id: string;
  email: string;
  name?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GenericSubjectMaster {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  _count?: {
    summaryTransactions: number;
    bookGenericTags: number;
  };
}

export interface TagMaster {
  id: string;
  name: string;
  description?: string;
  category?: string;
  createdAt: string;
  updatedAt: string;
  _count?: {
    summaryTransactions: number;
    bookSpecificTags: number;
  };
}

export interface BookEditor {
  id: string;
  bookId: string;
  name: string;
  role?: string;
}

export interface BookGenericTag {
  id: string;
  bookId: string;
  genericSubjectId: string;
  genericSubject: GenericSubjectMaster;
}

export interface BookSpecificTag {
  id: string;
  bookId: string;
  tagId: string;
  tag: TagMaster;
}

export interface BookMaster {
  id: string;
  libraryNumber: string;
  bookName: string;
  bookSummary?: string;
  pageNumbers?: string;
  grade?: string;
  remark?: string;
  edition?: string;
  publisherName?: string;
  createdAt: string;
  updatedAt: string;
  user?: {
    id: string;
    name?: string;
    email: string;
  };
  editors?: BookEditor[];
  genericTags?: BookGenericTag[];
  specificTags?: BookSpecificTag[];
  summaryTransactions?: SummaryTransaction[];
  _count?: {
    summaryTransactions: number;
  };
}

export interface MultilingualText {
  english?: string;
  hindi?: string;
  gujarati?: string;
  sanskrit?: string;
}

export interface SummaryTransaction {
  id: string;
  srNo: number;
  title?: string;
  keywords?: string;
  relevantParagraph?: MultilingualText;
  paragraphNo?: string;
  pageNo?: string;
  informationRating?: string;
  remark?: string;
  bookId: string;
  genericSubjectId?: string;
  specificSubjectId?: string;
  createdAt: string;
  updatedAt: string;
  book?: {
    id: string;
    bookName: string;
    libraryNumber: string;
    bookSummary?: string;
    pageNumbers?: string;
  };
  user?: {
    id: string;
    name?: string;
    email: string;
  };
  genericSubject?: GenericSubjectMaster;
  specificSubject?: TagMaster;
}

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

export interface BooksResponse {
  books: BookMaster[];
  pagination: PaginationInfo;
}

export interface TransactionsResponse {
  transactions: SummaryTransaction[];
  pagination: PaginationInfo;
  book?: BookMaster;
}

export interface GenericSubjectsResponse {
  subjects: GenericSubjectMaster[];
  pagination: PaginationInfo;
}

export interface TagsResponse {
  tags: TagMaster[];
  pagination: PaginationInfo;
}

export interface DashboardStats {
  totalBooks: number;
  totalTransactions: number;
  totalGenericSubjects: number;
  totalSpecificTags: number;
  newBooksThisMonth?: number;
  newTransactionsThisMonth?: number;
}

// Form interfaces
export interface BookFormData {
  libraryNumber: string;
  bookName: string;
  bookSummary?: string;
  pageNumbers?: string;
  grade?: string;
  remark?: string;
  edition?: string;
  publisherName?: string;
  editors: Array<{
    name: string;
    role?: string;
  }>;
  genericTags: BookGenericTag[];
  specificTags: BookSpecificTag[];
}

export interface TransactionFormData {
  srNo: number;
  genericSubjectId?: string;
  specificSubjectId?: string;
  title?: string;
  keywords?: string;
  relevantParagraph: MultilingualText;
  paragraphNo?: string;
  pageNo?: string;
  informationRating?: string;
  remark?: string;
  bookId: string;
}

export interface SubjectFormData {
  name: string;
  description?: string;
  category?: string;
}

// Component prop interfaces
export interface DataTableColumn<T = any> {
  key: keyof T;
  label: string;
  render?: (value: any, row: T) => React.ReactNode;
}

export interface DataTableProps<T = any> {
  data: T[];
  columns: DataTableColumn<T>[];
  pagination?: PaginationInfo;
  onPageChange?: (page: number) => void;
  loading?: boolean;
  onEdit?: (row: T) => void;
  onDelete?: (row: T) => void;
  onView?: (row: T) => void;
  searchable?: boolean;
  onSearch?: (search: string) => void;
  searchPlaceholder?: string;
}

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
}

export interface FormInputProps {
  label?: string;
  name: string;
  value?: string | number;
  onChange: (e: any) => void;
  type?: 'text' | 'number' | 'email' | 'password' | 'textarea' | 'select';
  required?: boolean;
  error?: string;
  placeholder?: string;
  rows?: number;
  options?: Array<{
    value: string | number;
    label: string;
  }>;
}

export interface AlertProps {
  type?: 'success' | 'error' | 'warning' | 'info';
  message: string;
  onClose?: () => void;
}

export interface CardProps {
  title?: string;
  children: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
  headerActions?: React.ReactNode;
}

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

export interface StatsCardProps {
  title: string;
  value: string | number;
  icon?: React.ComponentType<{ className?: string }>;
  trend?: string;
  color?: 'blue' | 'green' | 'yellow' | 'red';
}

export interface MultiSelectTagsProps {
  label: string;
  options: Array<{
    id: string;
    name: string;
  }>;
  selectedValues: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
}

// Language types
export type LanguageCode = 'english' | 'hindi' | 'gujarati' | 'sanskrit';

export interface Language {
  code: LanguageCode;
  name: string;
  icon: string;
}

// Utility types
export type InformationRating = 'High' | 'Medium' | 'Low';
export type EditorRole = 'Editor' | 'Co-editor' | 'Chief Editor' | 'Assistant Editor';

// API endpoint types
export type ApiMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export interface ApiError {
  error: string;
  details?: string;
}

// Hook types
export interface UseApiResponse<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export interface UseFormState<T> {
  values: T;
  errors: Partial<Record<keyof T, string>>;
  touched: Partial<Record<keyof T, boolean>>;
  isValid: boolean;
  isDirty: boolean;
}