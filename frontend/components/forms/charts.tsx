"use client";

import { cn } from "@/lib/utils";

/**
 * Gráficos do relatório, em HTML puro.
 *
 * Uma série só por gráfico (a pergunta nomeia a série), então não há legenda
 * nem paleta categórica: o único matiz é o primário do tema. Texto sempre em
 * tokens de texto, nunca na cor da barra.
 */

export type BarRow = { key: string; label: string; count: number; percent?: number };

export function BarRows({ rows, emptyLabel = "Sem respostas ainda." }: { rows: BarRow[]; emptyLabel?: string }) {
  const max = Math.max(0, ...rows.map((r) => r.count));
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  return (
    <ul className="space-y-2" role="list">
      {rows.map((r) => {
        const width = max > 0 ? (r.count / max) * 100 : 0;
        const value = r.percent != null ? `${r.count} · ${formatPercent(r.percent)}` : String(r.count);
        return (
          <li
            key={r.key}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-sm sm:grid-cols-[minmax(120px,30%)_1fr_auto]"
            title={`${r.label}: ${value}`}
          >
            <span className="truncate" title={r.label}>
              {r.label}
            </span>
            <span className="col-span-2 h-2 w-full overflow-hidden rounded-full bg-muted sm:col-span-1">
              <span
                className={cn("block h-full rounded-full bg-primary transition-[width] duration-500", r.count === 0 && "opacity-0")}
                style={{ width: `${Math.max(width, r.count > 0 ? 2 : 0)}%` }}
              />
            </span>
            <span className="col-start-2 row-start-1 tabular-nums text-xs text-muted-foreground sm:col-start-3">
              {value}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function ColumnChart({
  columns,
  ariaLabel,
}: {
  columns: Array<{ key: string; label: string; count: number }>;
  ariaLabel: string;
}) {
  const max = Math.max(0, ...columns.map((c) => c.count));
  if (columns.length === 0) return <p className="text-sm text-muted-foreground">Sem respostas ainda.</p>;
  const first = columns[0];
  const last = columns[columns.length - 1];
  return (
    <div aria-label={ariaLabel} role="img">
      <div className="flex h-24 items-end gap-0.5">
        {columns.map((c) => (
          <div
            key={c.key}
            className="group relative flex h-full flex-1 items-end"
            title={`${c.label}: ${c.count}`}
          >
            <span
              className="w-full rounded-t-sm bg-primary/80 transition-colors group-hover:bg-primary"
              style={{ height: `${max > 0 ? Math.max((c.count / max) * 100, c.count > 0 ? 4 : 0) : 0}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
        <span>{first.label}</span>
        {columns.length > 1 && <span>{last.label}</span>}
      </div>
    </div>
  );
}

export function formatPercent(value: number) {
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}
