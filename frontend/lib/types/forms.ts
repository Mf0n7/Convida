export type QuestionType =
  | "short_text"
  | "long_text"
  | "email"
  | "phone"
  | "number"
  | "single_choice"
  | "multi_choice"
  | "dropdown"
  | "scale"
  | "date"
  | "time"
  | "yes_no";

export type FormStatus = "draft" | "open" | "closed";

export type QuestionOption = { id: string; label: string };

export type QuestionConfig = {
  options?: QuestionOption[];
  min?: number | null;
  max?: number | null;
  scale_min?: number;
  scale_max?: number;
  min_label?: string;
  max_label?: string;
  placeholder?: string;
};

export type Question = {
  id: number;
  type: QuestionType;
  label: string;
  help_text: string;
  required: boolean;
  order: number;
  config: QuestionConfig;
};

/** Pergunta no construtor: `id` nulo = ainda não salva; `_key` só para o React. */
export type DraftQuestion = Omit<Question, "id" | "order"> & {
  id: number | null;
  _key: string;
};

/** Contexto comum: a que evento pertence (ou nenhum, se avulso) e o link público. */
export type FormContext = {
  share_token: string;
  is_standalone: boolean;
  event_uuid: string | null;
  event_title: string | null;
  public_url: string;
};

export type EventFormSummary = FormContext & {
  id: number;
  uuid: string;
  title: string;
  status: FormStatus;
  is_accepting_responses: boolean;
  closes_at: string | null;
  response_count: number;
  question_count: number;
  created_at: string;
  updated_at: string;
};

export type EventForm = FormContext & {
  id: number;
  uuid: string;
  title: string;
  description: string;
  status: FormStatus;
  collect_name: boolean;
  allow_multiple_responses: boolean;
  confirmation_message: string;
  closes_at: string | null;
  is_accepting_responses: boolean;
  response_count: number;
  questions: Question[];
  created_at: string;
  updated_at: string;
};

export type FormInput = {
  title: string;
  description?: string;
  collect_name?: boolean;
  allow_multiple_responses?: boolean;
  confirmation_message?: string;
  closes_at?: string | null;
  questions?: Array<Omit<Question, "id" | "order"> & { id?: number | null }>;
};

/** Valor de uma resposta: escalar ou lista de ids (caixas de seleção). */
export type AnswerValue = string | number | boolean | string[] | null;

export type FormResponseRow = {
  id: number;
  display_name: string;
  via: "link" | "nominal" | "direct";
  created_at: string;
  answers: Record<string, AnswerValue>;
};

export type ChoiceSummary = {
  kind: "choices";
  options: Array<{ id: string; label: string; count: number; percent: number }>;
};
export type ScaleSummary = {
  kind: "scale";
  distribution: Array<{ value: number; count: number; percent: number }>;
  average: number | null;
  min_label: string;
  max_label: string;
};
export type NumberSummary = {
  kind: "number";
  count: number;
  min?: number;
  max?: number;
  sum?: number;
  average?: number;
  median?: number;
  distribution?: Array<{ value: number; count: number }>;
};
export type BucketSummary = {
  kind: "buckets";
  distribution: Array<{ value: string; count: number }>;
};
export type TextSummary = { kind: "text"; samples: string[]; total: number };

export type QuestionSummary =
  | ChoiceSummary
  | ScaleSummary
  | NumberSummary
  | BucketSummary
  | TextSummary;

export type ReportQuestion = {
  id: number;
  type: QuestionType;
  label: string;
  required: boolean;
  answered: number;
  skipped: number;
  summary: QuestionSummary;
};

export type FormReport = {
  form: { id: number; uuid: string; title: string; status: FormStatus };
  total_responses: number;
  last_response_at: string | null;
  timeline: Array<{ date: string; count: number }>;
  questions: ReportQuestion[];
};

export type PublicFormSummary = {
  uuid: string;
  title: string;
  description: string;
  question_count: number;
  already_answered: boolean;
};

export type PublicQuestion = Omit<Question, "order">;

export type PublicForm = {
  uuid: string;
  title: string;
  description: string;
  status: FormStatus;
  is_accepting_responses: boolean;
  collect_name: boolean;
  confirmation_message: string;
  closes_at: string | null;
  event_title: string | null;
  questions: PublicQuestion[];
  respondent_name: string;
  already_answered: boolean;
};

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  short_text: "Resposta curta",
  long_text: "Parágrafo",
  email: "E-mail",
  phone: "Telefone",
  number: "Número",
  single_choice: "Múltipla escolha",
  multi_choice: "Caixas de seleção",
  dropdown: "Lista suspensa",
  scale: "Escala linear",
  date: "Data",
  time: "Hora",
  yes_no: "Sim / Não",
};

export const CHOICE_TYPES: QuestionType[] = ["single_choice", "multi_choice", "dropdown"];
export const TEXT_TYPES: QuestionType[] = ["short_text", "long_text", "email", "phone"];
