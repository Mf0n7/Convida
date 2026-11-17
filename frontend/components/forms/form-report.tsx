"use client";

import { Download, MessageSquareText, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { BarRows, ColumnChart } from "@/components/forms/charts";
import { QUESTION_TYPE_ICONS } from "@/components/forms/question-editor";
import { ResponsesList } from "@/components/forms/responses-list";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiErrorMessage } from "@/lib/api";
import { downloadFormCsv, useFormReport } from "@/hooks/use-forms";
import { QUESTION_TYPE_LABELS, type ReportQuestion } from "@/lib/types";
import { cn, formatDateTime } from "@/lib/utils";

type View = "resumo" | "individuais";

export function FormReport({ formId, title }: { formId: number; title: string }) {
  const { data, isLoading, isError } = useFormReport(formId);
  const [view, setView] = useState<View>("resumo");
  const [exporting, setExporting] = useState(false);

  const exportCsv = async () => {
    setExporting(true);
    try {
      await downloadFormCsv(formId, `${slug(title)}-respostas.csv`);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Não foi possível exportar."));
    } finally {
      setExporting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (isError || !data) return <p className="text-sm text-destructive">Não foi possível carregar o relatório.</p>;

  const total = data.total_responses;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile icon={Users} label="Respostas" value={String(total)} />
        <StatTile
          icon={MessageSquareText}
          label="Perguntas"
          value={String(data.questions.length)}
        />
        <StatTile
          label="Última resposta"
          value={data.last_response_at ? formatDateTime(data.last_response_at) : "—"}
          small
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-full border border-border p-0.5 text-sm">
          {(["resumo", "individuais"] as View[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={cn(
                "rounded-full px-3 py-1 transition-colors",
                view === v ? "bg-primary/15 font-medium text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {v === "resumo" ? "Resumo" : "Individuais"}
            </button>
          ))}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={exportCsv} disabled={exporting || total === 0}>
          <Download /> {exporting ? "Exportando…" : "Exportar CSV"}
        </Button>
      </div>

      {view === "individuais" ? (
        <ResponsesList formId={formId} questions={data.questions} />
      ) : total === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center">
          <p className="font-medium">Nenhuma resposta ainda</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Publique o formulário e compartilhe o link com os convidados.
          </p>
        </div>
      ) : (
        <>
          {data.timeline.length > 1 && (
            <section className="rounded-xl border border-border bg-card/80 p-4 shadow-sm sm:p-5">
              <h3 className="mb-3 text-sm font-medium">Respostas por dia</h3>
              <ColumnChart
                ariaLabel="Respostas por dia"
                columns={data.timeline.map((t) => ({
                  key: t.date,
                  label: formatShortDate(t.date),
                  count: t.count,
                }))}
              />
            </section>
          )}
          {data.questions.map((q, i) => (
            <QuestionReport key={q.id} question={q} index={i} total={total} />
          ))}
        </>
      )}
    </div>
  );
}

function QuestionReport({ question, index, total }: { question: ReportQuestion; index: number; total: number }) {
  const Icon = QUESTION_TYPE_ICONS[question.type];
  const s = question.summary;
  return (
    <section className="rounded-xl border border-border bg-card/80 p-4 shadow-sm sm:p-5">
      <header className="mb-3 flex items-start gap-3">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-medium">{question.label}</h3>
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Icon className="size-3.5" /> {QUESTION_TYPE_LABELS[question.type]}
            </span>
            <span>·</span>
            <span>
              {question.answered} de {total} responderam
              {question.skipped > 0 && ` (${question.skipped} pularam)`}
            </span>
          </p>
        </div>
      </header>

      {s.kind === "choices" && (
        <BarRows rows={s.options.map((o) => ({ key: o.id, label: o.label, count: o.count, percent: o.percent }))} />
      )}

      {s.kind === "scale" && (
        <div className="space-y-3">
          {s.average != null && (
            <p className="text-sm">
              Média: <span className="font-semibold tabular-nums">{s.average.toLocaleString("pt-BR")}</span>
            </p>
          )}
          <BarRows
            rows={s.distribution.map((d, i, arr) => ({
              key: String(d.value),
              label: labelForScaleStep(d.value, i, arr.length, s.min_label, s.max_label),
              count: d.count,
              percent: d.percent,
            }))}
          />
        </div>
      )}

      {s.kind === "number" &&
        (s.count === 0 ? (
          <p className="text-sm text-muted-foreground">Sem respostas ainda.</p>
        ) : (
          <div className="space-y-3">
            <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
              <Stat label="Média" value={s.average} />
              <Stat label="Mediana" value={s.median} />
              <Stat label="Mínimo" value={s.min} />
              <Stat label="Máximo" value={s.max} />
              <Stat label="Soma" value={s.sum} />
            </dl>
            {s.distribution && s.distribution.length > 0 && (
              <BarRows
                rows={s.distribution.map((d) => ({
                  key: String(d.value),
                  label: d.value.toLocaleString("pt-BR"),
                  count: d.count,
                  percent: (d.count * 100) / s.count,
                }))}
              />
            )}
          </div>
        ))}

      {s.kind === "buckets" && (
        <BarRows rows={s.distribution.map((d) => ({ key: d.value, label: d.value, count: d.count }))} />
      )}

      {s.kind === "text" &&
        (s.total === 0 ? (
          <p className="text-sm text-muted-foreground">Sem respostas ainda.</p>
        ) : (
          <div>
            <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
              {s.samples.map((t, i) => (
                <li key={i} className="rounded-md bg-background/60 px-3 py-2 text-sm">
                  {t}
                </li>
              ))}
            </ul>
            {s.total > s.samples.length && (
              <p className="mt-2 text-xs text-muted-foreground">
                Mostrando {s.samples.length} de {s.total}. Veja todas em “Individuais” ou exporte o CSV.
              </p>
            )}
          </div>
        ))}
    </section>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  small,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  small?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card/80 p-4 shadow-sm">
      {Icon && <Icon className="size-7 shrink-0 text-primary" />}
      <div className="min-w-0">
        <p className={cn("truncate font-semibold leading-tight", small ? "text-sm" : "text-2xl tabular-nums")}>
          {value}
        </p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value?: number }) {
  return (
    <div className="rounded-md bg-background/60 px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-semibold tabular-nums">{value != null ? value.toLocaleString("pt-BR") : "—"}</dd>
    </div>
  );
}

function labelForScaleStep(value: number, index: number, length: number, minLabel: string, maxLabel: string) {
  if (index === 0 && minLabel) return `${value} · ${minLabel}`;
  if (index === length - 1 && maxLabel) return `${value} · ${maxLabel}`;
  return String(value);
}

function formatShortDate(iso: string) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

function slug(text: string) {
  return (
    text
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "formulario"
  );
}

