"use client";

import { ChevronDown, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiErrorMessage } from "@/lib/api";
import { useDeleteResponse, useFormResponses } from "@/hooks/use-forms";
import type { AnswerValue, FormResponseRow, ReportQuestion } from "@/lib/types";
import { cn, formatDateTime } from "@/lib/utils";

const PAGE_SIZE = 25;

export function ResponsesList({ formId, questions }: { formId: number; questions: ReportQuestion[] }) {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError } = useFormResponses(formId, page);

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (isError || !data) return <p className="text-sm text-destructive">Não foi possível carregar as respostas.</p>;
  if (data.count === 0) return <p className="text-sm text-muted-foreground">Nenhuma resposta ainda.</p>;

  const pages = Math.max(1, Math.ceil(data.count / PAGE_SIZE));

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-border rounded-xl border border-border bg-card/80">
        {data.results.map((r) => (
          <ResponseRow key={r.id} formId={formId} row={r} questions={questions} />
        ))}
      </ul>
      {pages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <Button type="button" variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft /> Anteriores
          </Button>
          <span>
            Página {page} de {pages}
          </span>
          <Button type="button" variant="ghost" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            Próximas <ChevronRight />
          </Button>
        </div>
      )}
    </div>
  );
}

function ResponseRow({ formId, row, questions }: { formId: number; row: FormResponseRow; questions: ReportQuestion[] }) {
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const remove = useDeleteResponse(formId);

  const del = async () => {
    try {
      await remove.mutateAsync(row.id);
      toast.success("Resposta excluída.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Não foi possível excluir."));
    }
  };

  return (
    <li>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={open}
        >
          <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
          <span className="truncate text-sm font-medium">{row.display_name || "Anônimo"}</span>
          <Badge variant="secondary" className="hidden font-normal sm:inline-flex">
            {row.via === "nominal" ? "convite nominal" : row.via === "link" ? "link do convite" : "link direto"}
          </Badge>
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">{formatDateTime(row.created_at)}</span>
        </button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 text-destructive"
          onClick={() => setConfirmOpen(true)}
          title="Excluir resposta"
        >
          <Trash2 />
        </Button>
      </div>
      {open && (
        <dl className="grid gap-2 border-t border-border bg-background/40 px-3 py-3 text-sm sm:grid-cols-[minmax(0,40%)_1fr]">
          {questions.map((q) => (
            <div key={q.id} className="contents">
              <dt className="text-muted-foreground">{q.label}</dt>
              <dd className="mb-1 whitespace-pre-wrap break-words sm:mb-0">
                {renderAnswer(q, row.answers[String(q.id)])}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Excluir resposta"
        description={`Excluir a resposta de ${row.display_name || "anônimo"}?`}
        confirmLabel="Excluir"
        onConfirm={del}
      />
    </li>
  );
}

/** Mostra o valor como o dono lê: ids de opção viram rótulos, bool vira Sim/Não. */
export function renderAnswer(question: ReportQuestion, value: AnswerValue | undefined): string {
  if (value == null || value === "" || (Array.isArray(value) && value.length === 0)) return "—";
  const s = question.summary;
  if (s.kind === "choices") {
    const labelOf = (id: string) => s.options.find((o) => o.id === id)?.label ?? id;
    if (Array.isArray(value)) return value.map(labelOf).join(", ");
    if (typeof value === "boolean") return value ? "Sim" : "Não";
    return labelOf(String(value));
  }
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (question.type === "date" && typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-");
    return `${d}/${m}/${y}`;
  }
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}
