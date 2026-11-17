"use client";

import {
  AlignLeft,
  ArrowDown,
  ArrowUp,
  AtSign,
  Calendar,
  CheckSquare,
  ChevronDownSquare,
  CircleDot,
  Clock,
  Copy,
  Hash,
  Phone,
  Plus,
  SlidersHorizontal,
  ToggleLeft,
  Trash2,
  Type,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  CHOICE_TYPES,
  QUESTION_TYPE_LABELS,
  TEXT_TYPES,
  type DraftQuestion,
  type QuestionConfig,
  type QuestionType,
} from "@/lib/types";
import { cn } from "@/lib/utils";

export const QUESTION_TYPE_ICONS: Record<QuestionType, React.ComponentType<{ className?: string }>> = {
  short_text: Type,
  long_text: AlignLeft,
  email: AtSign,
  phone: Phone,
  number: Hash,
  single_choice: CircleDot,
  multi_choice: CheckSquare,
  dropdown: ChevronDownSquare,
  scale: SlidersHorizontal,
  date: Calendar,
  time: Clock,
  yes_no: ToggleLeft,
};

export const QUESTION_TYPES = Object.keys(QUESTION_TYPE_LABELS) as QuestionType[];

export function newOptionId() {
  return Math.random().toString(36).slice(2, 10);
}

/** Config inicial coerente com o tipo, preservando o que ainda faz sentido. */
export function defaultConfig(type: QuestionType, previous: QuestionConfig = {}): QuestionConfig {
  if (CHOICE_TYPES.includes(type)) {
    return {
      options:
        previous.options && previous.options.length > 0
          ? previous.options
          : [{ id: newOptionId(), label: "Opção 1" }],
    };
  }
  if (type === "number") return { min: previous.min ?? null, max: previous.max ?? null };
  if (type === "scale") {
    return {
      scale_min: previous.scale_min ?? 1,
      scale_max: previous.scale_max ?? 5,
      min_label: previous.min_label ?? "",
      max_label: previous.max_label ?? "",
    };
  }
  if (TEXT_TYPES.includes(type)) return { placeholder: previous.placeholder ?? "" };
  return {};
}

type Props = {
  question: DraftQuestion;
  index: number;
  total: number;
  error?: string;
  onChange: (next: DraftQuestion) => void;
  onMove: (direction: -1 | 1) => void;
  onDuplicate: () => void;
  onDelete: () => void;
};

export function QuestionEditor({
  question,
  index,
  total,
  error,
  onChange,
  onMove,
  onDuplicate,
  onDelete,
}: Props) {
  const patch = (partial: Partial<DraftQuestion>) => onChange({ ...question, ...partial });
  const patchConfig = (partial: Partial<QuestionConfig>) =>
    patch({ config: { ...question.config, ...partial } });

  const isChoice = CHOICE_TYPES.includes(question.type);
  const options = question.config.options ?? [];

  const setOption = (id: string, label: string) =>
    patchConfig({ options: options.map((o) => (o.id === id ? { ...o, label } : o)) });
  const addOption = () =>
    patchConfig({
      options: [...options, { id: newOptionId(), label: `Opção ${options.length + 1}` }],
    });
  const removeOption = (id: string) =>
    patchConfig({ options: options.filter((o) => o.id !== id) });

  return (
    <div
      className={cn(
        "rounded-xl border bg-card/80 p-4 shadow-sm transition-colors sm:p-5",
        error ? "border-destructive/60" : "border-border",
      )}
    >
      <div className="flex items-start gap-3">
        <span className="mt-2 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
          {index + 1}
        </span>
        <div className="flex-1 space-y-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_200px]">
            <Input
              value={question.label}
              onChange={(e) => patch({ label: e.target.value })}
              placeholder="Pergunta"
              aria-label={`Texto da pergunta ${index + 1}`}
              className="font-medium"
            />
            <NativeSelect
              value={question.type}
              aria-label="Tipo da pergunta"
              onChange={(e) => {
                const type = e.target.value as QuestionType;
                patch({ type, config: defaultConfig(type, question.config) });
              }}
            >
              {QUESTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {QUESTION_TYPE_LABELS[t]}
                </option>
              ))}
            </NativeSelect>
          </div>
          <Input
            value={question.help_text}
            onChange={(e) => patch({ help_text: e.target.value })}
            placeholder="Descrição ou instrução (opcional)"
            aria-label="Descrição da pergunta"
            className="h-9 text-xs"
          />

          {isChoice && (
            <div className="space-y-2">
              {options.map((o, i) => (
                <div key={o.id} className="flex items-center gap-2">
                  <span className="text-muted-foreground">
                    {question.type === "single_choice" ? (
                      <CircleDot className="size-4" />
                    ) : question.type === "multi_choice" ? (
                      <CheckSquare className="size-4" />
                    ) : (
                      <span className="inline-block w-4 text-center text-xs">{i + 1}.</span>
                    )}
                  </span>
                  <Input
                    value={o.label}
                    onChange={(e) => setOption(o.id, e.target.value)}
                    aria-label={`Opção ${i + 1}`}
                    className="h-9"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-9 shrink-0 text-muted-foreground"
                    onClick={() => removeOption(o.id)}
                    disabled={options.length <= 1}
                    aria-label={`Remover opção ${i + 1}`}
                  >
                    <X />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="ghost" size="sm" onClick={addOption}>
                <Plus /> Adicionar opção
              </Button>
            </div>
          )}

          {question.type === "number" && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Mínimo (opcional)</Label>
                <Input
                  type="number"
                  value={question.config.min ?? ""}
                  onChange={(e) =>
                    patchConfig({ min: e.target.value === "" ? null : Number(e.target.value) })
                  }
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Máximo (opcional)</Label>
                <Input
                  type="number"
                  value={question.config.max ?? ""}
                  onChange={(e) =>
                    patchConfig({ max: e.target.value === "" ? null : Number(e.target.value) })
                  }
                  className="h-9"
                />
              </div>
            </div>
          )}

          {question.type === "scale" && (
            <div className="grid gap-2 sm:grid-cols-[90px_1fr_90px_1fr]">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">De</Label>
                <NativeSelect
                  value={question.config.scale_min ?? 1}
                  onChange={(e) => patchConfig({ scale_min: Number(e.target.value) })}
                  className="h-9"
                >
                  <option value={0}>0</option>
                  <option value={1}>1</option>
                </NativeSelect>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Rótulo inicial</Label>
                <Input
                  value={question.config.min_label ?? ""}
                  onChange={(e) => patchConfig({ min_label: e.target.value })}
                  placeholder="ex.: Pouco"
                  className="h-9"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Até</Label>
                <NativeSelect
                  value={question.config.scale_max ?? 5}
                  onChange={(e) => patchConfig({ scale_max: Number(e.target.value) })}
                  className="h-9"
                >
                  {Array.from({ length: 9 }, (_, i) => i + 2).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Rótulo final</Label>
                <Input
                  value={question.config.max_label ?? ""}
                  onChange={(e) => patchConfig({ max_label: e.target.value })}
                  placeholder="ex.: Muito"
                  className="h-9"
                />
              </div>
            </div>
          )}

          {TEXT_TYPES.includes(question.type) && (
            <Input
              value={question.config.placeholder ?? ""}
              onChange={(e) => patchConfig({ placeholder: e.target.value })}
              placeholder="Texto de exemplo dentro do campo (opcional)"
              aria-label="Placeholder"
              className="h-9 text-xs"
            />
          )}

          {question.type === "long_text" && (
            <Textarea disabled className="min-h-14 text-xs" placeholder="Resposta longa do convidado" />
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={question.required}
            onCheckedChange={(v) => patch({ required: v })}
            aria-label="Obrigatória"
          />
          Obrigatória
        </label>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            aria-label="Mover para cima"
          >
            <ArrowUp />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            aria-label="Mover para baixo"
          >
            <ArrowDown />
          </Button>
          <Button type="button" variant="ghost" size="icon" onClick={onDuplicate} aria-label="Duplicar">
            <Copy />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onDelete}
            className="text-destructive"
            aria-label="Excluir pergunta"
          >
            <Trash2 />
          </Button>
        </div>
      </div>
    </div>
  );
}
