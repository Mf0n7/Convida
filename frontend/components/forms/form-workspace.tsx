"use client";

import {
  BarChart3,
  Check,
  Copy,
  ExternalLink,
  ListChecks,
  Lock,
  Save,
  Send,
  Settings2,
  Unlock,
} from "lucide-react";
import Link from "next/link";
import posthog from "posthog-js";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { BackButton } from "@/components/shared/back-button";
import { DashboardShell } from "@/components/dashboard/shell";
import { FormStatusBadge } from "@/components/events/forms-panel";
import { FormBuilder, validateQuestions } from "@/components/forms/form-builder";
import { FormReport } from "@/components/forms/form-report";
import { FormSettings, type FormSettingsValues } from "@/components/forms/form-settings";
import { QrDialog } from "@/components/forms/qr-dialog";
import { Button } from "@/components/ui/button";
import { ApiError, apiErrorMessage } from "@/lib/api";
import { useForm, useSetFormStatus, useUpdateForm } from "@/hooks/use-forms";
import type { DraftQuestion, EventForm, FormInput } from "@/lib/types";
import { cn } from "@/lib/utils";

type Tab = "perguntas" | "respostas" | "configuracoes";

type Draft = {
  title: string;
  description: string;
  questions: DraftQuestion[];
  settings: FormSettingsValues;
};

function toDraft(form: EventForm): Draft {
  return {
    title: form.title,
    description: form.description,
    questions: form.questions.map((q) => ({
      id: q.id,
      _key: `q${q.id}`,
      type: q.type,
      label: q.label,
      help_text: q.help_text,
      required: q.required,
      config: q.config,
    })),
    settings: {
      collect_name: form.collect_name,
      allow_multiple_responses: form.allow_multiple_responses,
      confirmation_message: form.confirmation_message,
      closes_at: form.closes_at,
    },
  };
}

function toInput(draft: Draft): FormInput {
  return {
    title: draft.title.trim(),
    description: draft.description.trim(),
    ...draft.settings,
    questions: draft.questions.map((q) => ({
      id: q.id,
      type: q.type,
      label: q.label.trim(),
      help_text: q.help_text.trim(),
      required: q.required,
      config: q.config,
    })),
  };
}

const TABS: Array<{ id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: "perguntas", label: "Perguntas", icon: ListChecks },
  { id: "respostas", label: "Respostas", icon: BarChart3 },
  { id: "configuracoes", label: "Configurações", icon: Settings2 },
];

type Props = {
  formId: number;
  /** Para onde "Voltar" leva: página do evento ou lista de formulários. */
  backHref: string;
  backLabel: string;
};

/** Área de trabalho de um formulário: perguntas, respostas e configurações. */
export function FormWorkspace({ formId, backHref, backLabel }: Props) {
  const { data: form, isLoading, isError } = useForm(Number.isFinite(formId) ? formId : null);
  const update = useUpdateForm(formId);
  const setStatus = useSetFormStatus(formId);

  const [tab, setTab] = useState<Tab>("perguntas");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);

  // Aba inicial via ?tab=respostas (lida no cliente para não exigir Suspense).
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("tab");
    if (wanted === "respostas" || wanted === "configuracoes") setTab(wanted);
  }, []);

  // Carrega o rascunho uma vez; depois disso o estado local manda (não
  // sobrescreve edições quando a query refaz o fetch em segundo plano).
  useEffect(() => {
    if (form && draft === null) setDraft(toDraft(form));
  }, [form, draft]);

  const dirty = useMemo(
    () => !!form && !!draft && JSON.stringify(toInput(draft)) !== JSON.stringify(toInput(toDraft(form))),
    [form, draft],
  );

  // Aviso do navegador ao sair com alterações não salvas.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const save = async (): Promise<EventForm | null> => {
    if (!draft) return null;
    if (!draft.title.trim()) {
      toast.error("Dê um título ao formulário.");
      setTab("perguntas");
      return null;
    }
    const localErrors = validateQuestions(draft.questions);
    setErrors(localErrors);
    if (Object.keys(localErrors).length > 0) {
      toast.error("Revise as perguntas destacadas.");
      setTab("perguntas");
      return null;
    }
    try {
      const saved = await update.mutateAsync(toInput(draft));
      setDraft(toDraft(saved));
      posthog.capture("form_saved", {
        form_id: formId,
        standalone: saved.is_standalone,
        question_count: saved.questions.length,
        question_types: Array.from(new Set(saved.questions.map((q) => q.type))),
      });
      toast.success("Formulário salvo.");
      return saved;
    } catch (err) {
      posthog.captureException(err);
      mapServerErrors(err, draft, setErrors);
      toast.error(apiErrorMessage(err, "Não foi possível salvar."));
      return null;
    }
  };

  const changeStatus = async (status: EventForm["status"]) => {
    if (dirty) {
      const saved = await save();
      if (!saved) return;
    }
    try {
      const updated = await setStatus.mutateAsync(status);
      setDraft(toDraft(updated));
      posthog.capture("form_status_changed", { form_id: formId, status });
      toast.success(
        status === "open"
          ? "Formulário publicado! Compartilhe o link."
          : status === "closed"
            ? "Formulário encerrado. Não aceita mais respostas."
            : "Formulário voltou para rascunho.",
      );
    } catch (err) {
      posthog.captureException(err);
      toast.error(apiErrorMessage(err, "Não foi possível alterar o status."));
    }
  };

  const copyLink = async () => {
    if (!form?.public_url) return;
    await navigator.clipboard.writeText(form.public_url);
    setCopied(true);
    toast.success("Link copiado!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <DashboardShell>
      <BackButton href={backHref} label={backLabel} />

      {isLoading || (form && !draft) ? (
        <p className="text-muted-foreground">Carregando…</p>
      ) : isError || !form || !draft ? (
        <p className="text-destructive">Formulário não encontrado.</p>
      ) : (
        <>
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-2xl font-semibold tracking-tight sm:text-3xl">
                  {draft.title || "Sem título"}
                </h1>
                <FormStatusBadge form={form} />
                {dirty && <span className="text-xs text-muted-foreground">alterações não salvas</span>}
              </div>
              <p className="text-sm text-muted-foreground">
                {form.response_count} resposta{form.response_count === 1 ? "" : "s"}
                {form.event_uuid && form.event_title ? (
                  <>
                    {" · evento "}
                    <Link
                      href={`/dashboard/events/${form.event_uuid}/edit#formularios`}
                      className="text-primary hover:underline"
                    >
                      {form.event_title}
                    </Link>
                  </>
                ) : (
                  " · formulário avulso"
                )}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={copyLink} disabled={form.status === "draft"}>
                {copied ? <Check className="text-primary" /> : <Copy />} Copiar link
              </Button>
              {form.status !== "draft" && (
                <Button asChild type="button" variant="outline" size="sm">
                  <a href={form.public_url} target="_blank" rel="noreferrer">
                    <ExternalLink /> Abrir
                  </a>
                </Button>
              )}
              <QrDialog
                formId={formId}
                title={form.title}
                publicUrl={form.public_url}
                disabled={form.status === "draft"}
              />
              <Button type="button" size="sm" onClick={save} disabled={!dirty || update.isPending}>
                <Save /> {update.isPending ? "Salvando…" : "Salvar"}
              </Button>
              {form.status === "open" ? (
                <Button type="button" variant="secondary" size="sm" onClick={() => changeStatus("closed")} disabled={setStatus.isPending}>
                  <Lock /> Encerrar
                </Button>
              ) : (
                <Button type="button" variant="secondary" size="sm" onClick={() => changeStatus("open")} disabled={setStatus.isPending}>
                  {form.status === "closed" ? <Unlock /> : <Send />}
                  {form.status === "closed" ? "Reabrir" : "Publicar"}
                </Button>
              )}
            </div>
          </div>

          {form.status === "draft" && (
            <p className="mb-4 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-muted-foreground">
              Rascunho: ninguém vê este formulário ainda. Monte as perguntas e clique em{" "}
              <span className="font-medium text-foreground">Publicar</span>.
            </p>
          )}

          <nav className="mb-6 flex w-fit gap-1 rounded-full border border-border bg-background/80 p-1 text-sm">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors",
                  tab === id ? "bg-primary/15 font-medium text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {label}
                {id === "respostas" && form.response_count > 0 && (
                  <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">
                    {form.response_count}
                  </span>
                )}
              </button>
            ))}
          </nav>

          <div className="max-w-3xl">
            {tab === "perguntas" && (
              <FormBuilder
                title={draft.title}
                description={draft.description}
                questions={draft.questions}
                errors={errors}
                onTitleChange={(title) => setDraft({ ...draft, title })}
                onDescriptionChange={(description) => setDraft({ ...draft, description })}
                onQuestionsChange={(questions) => setDraft({ ...draft, questions })}
              />
            )}
            {tab === "respostas" && <FormReport formId={formId} title={form.title} />}
            {tab === "configuracoes" && (
              <FormSettings values={draft.settings} onChange={(settings) => setDraft({ ...draft, settings })} />
            )}
          </div>
        </>
      )}
    </DashboardShell>
  );
}

/** Erros do DRF em `questions[i]` -> chave da pergunta no rascunho. */
function mapServerErrors(err: unknown, draft: Draft, setErrors: (e: Record<string, string>) => void) {
  if (!(err instanceof ApiError) || !err.data || typeof err.data !== "object") return;
  const questions = (err.data as { questions?: unknown }).questions;
  if (!Array.isArray(questions)) return;
  const mapped: Record<string, string> = {};
  questions.forEach((item, i) => {
    const key = draft.questions[i]?._key;
    if (!key || !item || typeof item !== "object") return;
    const first = Object.values(item as Record<string, unknown>)[0];
    const message = Array.isArray(first) ? first[0] : first;
    if (typeof message === "string") mapped[key] = message;
  });
  setErrors(mapped);
}
