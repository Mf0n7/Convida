"use client";

import { FieldError } from "@/components/shared/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import type { AnswerValue, PublicQuestion } from "@/lib/types";
import { cn } from "@/lib/utils";

type Props = {
  question: PublicQuestion;
  value: AnswerValue | undefined;
  error?: string;
  onChange: (value: AnswerValue) => void;
};

/** Renderiza uma pergunta para o convidado responder, conforme o tipo. */
export function QuestionInput({ question, value, error, onChange }: Props) {
  const id = `q-${question.id}`;
  const cfg = question.config;

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">
        {question.label}
        {question.required && <span className="ml-0.5 text-primary">*</span>}
      </legend>
      {question.help_text && <p className="text-xs text-muted-foreground">{question.help_text}</p>}

      {(question.type === "short_text" || question.type === "email" || question.type === "phone") && (
        <Input
          id={id}
          type={question.type === "email" ? "email" : question.type === "phone" ? "tel" : "text"}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={cfg.placeholder || undefined}
          maxLength={300}
          aria-invalid={!!error}
        />
      )}

      {question.type === "long_text" && (
        <Textarea
          id={id}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={cfg.placeholder || undefined}
          maxLength={2000}
          aria-invalid={!!error}
        />
      )}

      {question.type === "number" && (
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          value={typeof value === "number" || typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          min={cfg.min ?? undefined}
          max={cfg.max ?? undefined}
          step="any"
          aria-invalid={!!error}
        />
      )}

      {question.type === "date" && (
        <Input
          id={id}
          type="date"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value || null)}
          aria-invalid={!!error}
        />
      )}

      {question.type === "time" && (
        <Input
          id={id}
          type="time"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value || null)}
          aria-invalid={!!error}
        />
      )}

      {question.type === "dropdown" && (
        <NativeSelect
          id={id}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value || null)}
          aria-invalid={!!error}
        >
          <option value="">Selecione…</option>
          {(cfg.options ?? []).map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </NativeSelect>
      )}

      {question.type === "single_choice" && (
        <div className="space-y-1.5">
          {(cfg.options ?? []).map((o) => (
            <Label
              key={o.id}
              className={cn(
                "flex cursor-pointer items-center gap-2.5 rounded-lg border border-border px-3 py-2.5 font-normal transition-colors hover:bg-accent",
                value === o.id && "border-primary bg-primary/10",
              )}
            >
              <input
                type="radio"
                name={id}
                value={o.id}
                checked={value === o.id}
                onChange={() => onChange(o.id)}
                className="size-4 accent-primary"
              />
              {o.label}
            </Label>
          ))}
        </div>
      )}

      {question.type === "multi_choice" && (
        <div className="space-y-1.5">
          {(cfg.options ?? []).map((o) => {
            const selected = Array.isArray(value) ? value : [];
            const checked = selected.includes(o.id);
            return (
              <Label
                key={o.id}
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 rounded-lg border border-border px-3 py-2.5 font-normal transition-colors hover:bg-accent",
                  checked && "border-primary bg-primary/10",
                )}
              >
                <input
                  type="checkbox"
                  value={o.id}
                  checked={checked}
                  onChange={(e) =>
                    onChange(e.target.checked ? [...selected, o.id] : selected.filter((v) => v !== o.id))
                  }
                  className="size-4 accent-primary"
                />
                {o.label}
              </Label>
            );
          })}
        </div>
      )}

      {question.type === "scale" && (
        <ScaleInput
          min={cfg.scale_min ?? 1}
          max={cfg.scale_max ?? 5}
          minLabel={cfg.min_label ?? ""}
          maxLabel={cfg.max_label ?? ""}
          value={typeof value === "number" ? value : null}
          onChange={onChange}
        />
      )}

      {question.type === "yes_no" && (
        <div className="grid grid-cols-2 gap-2">
          {[
            { v: true, label: "Sim" },
            { v: false, label: "Não" },
          ].map(({ v, label }) => (
            <button
              key={label}
              type="button"
              onClick={() => onChange(value === v ? null : v)}
              aria-pressed={value === v}
              className={cn(
                "rounded-lg border border-border px-3 py-2.5 text-sm transition-colors hover:bg-accent",
                value === v && "border-primary bg-primary/10 font-medium text-primary",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <FieldError message={error} />
    </fieldset>
  );
}

function ScaleInput({
  min,
  max,
  minLabel,
  maxLabel,
  value,
  onChange,
}: {
  min: number;
  max: number;
  minLabel: string;
  maxLabel: string;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  const steps = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return (
    <div>
      <div className="flex gap-1.5" role="radiogroup">
        {steps.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            onClick={() => onChange(value === n ? null : n)}
            className={cn(
              "h-10 flex-1 rounded-lg border border-border text-sm tabular-nums transition-colors hover:bg-accent",
              value === n && "border-primary bg-primary text-primary-foreground hover:bg-primary",
            )}
          >
            {n}
          </button>
        ))}
      </div>
      {(minLabel || maxLabel) && (
        <div className="mt-1 flex justify-between text-xs text-muted-foreground">
          <span>{minLabel}</span>
          <span>{maxLabel}</span>
        </div>
      )}
    </div>
  );
}
