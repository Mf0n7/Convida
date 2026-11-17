"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { API_BASE_URL, ApiError, apiFetch, tokenStore } from "@/lib/api";
import type {
  AnswerValue,
  EventForm,
  EventFormSummary,
  FormInput,
  FormReport,
  FormResponseRow,
  FormStatus,
  Paginated,
  PublicForm,
  PublicFormSummary,
} from "@/lib/types";

const MINE_KEY = ["forms", "mine"];
const listKey = (uuid: string) => ["events", uuid, "forms"];
const formKey = (id: number) => ["forms", id];
const reportKey = (id: number) => ["forms", id, "report"];
const responsesKey = (id: number, page: number) => ["forms", id, "responses", page];

/** Invalida as listas que podem conter o formulário (página "Formulários" e painel do evento). */
function invalidateLists(qc: ReturnType<typeof useQueryClient>, eventUuid?: string | null) {
  qc.invalidateQueries({ queryKey: MINE_KEY });
  if (eventUuid) qc.invalidateQueries({ queryKey: listKey(eventUuid) });
}

// ------------------------------------------------------------------ dono

/** Todos os formulários do usuário — avulsos e de eventos. */
export function useMyForms() {
  return useQuery({
    queryKey: MINE_KEY,
    queryFn: ({ signal }) => apiFetch<EventFormSummary[]>("/forms/", { signal }),
  });
}

/** Cria um formulário avulso (sem evento). */
export function useCreateStandaloneForm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: FormInput) => apiFetch<EventForm>("/forms/", { method: "POST", body: input }),
    onSuccess: () => invalidateLists(qc),
  });
}

export function useEventForms(uuid: string) {
  return useQuery({
    queryKey: listKey(uuid),
    queryFn: ({ signal }) =>
      apiFetch<EventFormSummary[]>(`/events/${uuid}/forms/`, { signal }),
    enabled: !!uuid,
  });
}

export function useCreateForm(uuid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: FormInput) =>
      apiFetch<EventForm>(`/events/${uuid}/forms/`, { method: "POST", body: input }),
    onSuccess: () => invalidateLists(qc, uuid),
  });
}

export function useForm(id: number | null) {
  return useQuery({
    queryKey: formKey(id ?? 0),
    queryFn: ({ signal }) => apiFetch<EventForm>(`/forms/${id}/`, { signal }),
    enabled: id !== null && Number.isFinite(id),
  });
}

export function useUpdateForm(id: number, eventUuid?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: FormInput) =>
      apiFetch<EventForm>(`/forms/${id}/`, { method: "PUT", body: input }),
    onSuccess: (data) => {
      qc.setQueryData(formKey(id), data);
      invalidateLists(qc, eventUuid ?? data.event_uuid);
      qc.invalidateQueries({ queryKey: reportKey(id) });
    },
  });
}

export function useSetFormStatus(id: number, eventUuid?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (status: FormStatus) =>
      apiFetch<EventForm>(`/forms/${id}/status/`, { method: "POST", body: { status } }),
    onSuccess: (data) => {
      qc.setQueryData(formKey(id), data);
      invalidateLists(qc, eventUuid ?? data.event_uuid);
    },
  });
}

export function useDeleteForm(eventUuid?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiFetch<void>(`/forms/${id}/`, { method: "DELETE" }),
    onSuccess: () => invalidateLists(qc, eventUuid),
  });
}

export function useDuplicateForm(eventUuid?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch<EventForm>(`/forms/${id}/duplicate/`, { method: "POST" }),
    onSuccess: (data) => invalidateLists(qc, eventUuid ?? data.event_uuid),
  });
}

export function useFormReport(id: number, enabled = true) {
  return useQuery({
    queryKey: reportKey(id),
    queryFn: ({ signal }) => apiFetch<FormReport>(`/forms/${id}/report/`, { signal }),
    enabled: enabled && Number.isFinite(id),
  });
}

export function useFormResponses(id: number, page: number, enabled = true) {
  return useQuery({
    queryKey: responsesKey(id, page),
    queryFn: ({ signal }) =>
      apiFetch<Paginated<FormResponseRow>>(`/forms/${id}/responses/?page=${page}`, { signal }),
    enabled: enabled && Number.isFinite(id),
    placeholderData: (prev) => prev,
  });
}

export function useDeleteResponse(formId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (responseId: number) =>
      apiFetch<void>(`/forms/${formId}/responses/${responseId}/`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["forms", formId, "responses"] });
      qc.invalidateQueries({ queryKey: reportKey(formId) });
      qc.invalidateQueries({ queryKey: formKey(formId) });
    },
  });
}

/** Baixa o CSV autenticado e dispara o download no navegador. */
export async function downloadFormCsv(formId: number, filename: string) {
  const res = await fetch(`${API_BASE_URL}/forms/${formId}/export/`, {
    headers: { Authorization: `Bearer ${tokenStore.access ?? ""}` },
  });
  if (!res.ok) {
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      /* corpo vazio */
    }
    throw new ApiError(res.status, data);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// --------------------------------------------------------------- público

export type SubmitInput = {
  respondent_name?: string;
  answers: Record<string, AnswerValue>;
};

/** Formulários abertos de um evento, pelo token do convite. */
export function usePublicForms(token: string) {
  return useQuery({
    queryKey: ["public-forms", token],
    queryFn: ({ signal }) =>
      apiFetch<PublicFormSummary[]>(`/public/${token}/forms/`, { anonymous: true, signal }),
    enabled: !!token,
    retry: false,
  });
}

/** Formulário de evento via token do convite (identifica convidado nominal). */
export function usePublicForm(token: string, formUuid: string) {
  return useQuery({
    queryKey: ["public-form", token, formUuid],
    queryFn: ({ signal }) =>
      apiFetch<PublicForm>(`/public/${token}/forms/${formUuid}/`, { anonymous: true, signal }),
    enabled: !!token && !!formUuid,
    retry: false,
  });
}

export function useSubmitForm(token: string, formUuid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SubmitInput) =>
      apiFetch<{ detail: string }>(`/public/${token}/forms/${formUuid}/responses/`, {
        method: "POST",
        anonymous: true,
        body: input,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["public-forms", token] });
      qc.invalidateQueries({ queryKey: ["public-form", token, formUuid] });
    },
  });
}

/** Formulário pelo link direto (`share_token`) — avulso ou de evento. */
export function usePublicSharedForm(shareToken: string) {
  return useQuery({
    queryKey: ["public-shared-form", shareToken],
    queryFn: ({ signal }) =>
      apiFetch<PublicForm>(`/public/forms/${shareToken}/`, { anonymous: true, signal }),
    enabled: !!shareToken,
    retry: false,
  });
}

export function useSubmitSharedForm(shareToken: string) {
  return useMutation({
    mutationFn: (input: SubmitInput) =>
      apiFetch<{ detail: string }>(`/public/forms/${shareToken}/responses/`, {
        method: "POST",
        anonymous: true,
        body: input,
      }),
  });
}

/** Extrai o mapa `{ id_da_pergunta: mensagem }` de um erro 400 da submissão. */
export function submitErrors(err: unknown): Record<string, string> {
  if (err instanceof ApiError && err.data && typeof err.data === "object") {
    const errors = (err.data as { errors?: unknown }).errors;
    if (errors && typeof errors === "object") return errors as Record<string, string>;
  }
  return {};
}
