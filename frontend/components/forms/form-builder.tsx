"use client";

import { Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  QUESTION_TYPES,
  QUESTION_TYPE_ICONS,
  QuestionEditor,
  defaultConfig,
  newOptionId,
} from "@/components/forms/question-editor";
import {
  CHOICE_TYPES,
  QUESTION_TYPE_LABELS,
  type DraftQuestion,
  type QuestionType,
} from "@/lib/types";

export const MAX_QUESTIONS = 50;

export function newQuestion(type: QuestionType): DraftQuestion {
  return {
    id: null,
    _key: newOptionId(),
    type,
    label: "",
    help_text: "",
    required: false,
    config: defaultConfig(type),
  };
}

/** Validação local antes de salvar — espelha as regras do backend. */
export function validateQuestions(questions: DraftQuestion[]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const q of questions) {
    if (!q.label.trim()) {
      errors[q._key] = "Escreva o texto da pergunta.";
      continue;
    }
    if (CHOICE_TYPES.includes(q.type)) {
      const labels = (q.config.options ?? []).map((o) => o.label.trim());
      if (labels.length === 0 || labels.some((l) => !l)) {
        errors[q._key] = "Toda opção precisa de um texto.";
      } else if (new Set(labels.map((l) => l.toLowerCase())).size !== labels.length) {
        errors[q._key] = "Há opções repetidas.";
      }
    }
    if (q.type === "number") {
      const { min, max } = q.config;
      if (min != null && max != null && min > max) {
        errors[q._key] = "O mínimo não pode ser maior que o máximo.";
      }
    }
  }
  return errors;
}

type Props = {
  title: string;
  description: string;
  questions: DraftQuestion[];
  errors: Record<string, string>;
  onTitleChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  onQuestionsChange: (next: DraftQuestion[]) => void;
};

export function FormBuilder({
  title,
  description,
  questions,
  errors,
  onTitleChange,
  onDescriptionChange,
  onQuestionsChange,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const update = (index: number, next: DraftQuestion) =>
    onQuestionsChange(questions.map((q, i) => (i === index ? next : q)));

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= questions.length) return;
    const next = [...questions];
    [next[index], next[target]] = [next[target], next[index]];
    onQuestionsChange(next);
  };

  const duplicate = (index: number) => {
    const source = questions[index];
    const copy: DraftQuestion = {
      ...source,
      id: null,
      _key: newOptionId(),
      config: {
        ...source.config,
        options: source.config.options?.map((o) => ({ ...o, id: newOptionId() })),
      },
    };
    const next = [...questions];
    next.splice(index + 1, 0, copy);
    onQuestionsChange(next);
  };

  const add = (type: QuestionType) => {
    onQuestionsChange([...questions, newQuestion(type)]);
    setPickerOpen(false);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border border-t-4 border-t-primary bg-card/80 p-4 shadow-sm sm:p-5">
        <Input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Título do formulário"
          aria-label="Título do formulário"
          className="h-12 border-0 border-b border-border bg-transparent px-0 text-xl font-semibold shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 rounded-none"
        />
        <Textarea
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="Descrição (opcional) — aparece no topo para quem vai responder"
          aria-label="Descrição do formulário"
          className="mt-2 min-h-14 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      </div>

      {questions.length === 0 && (
        <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Nenhuma pergunta ainda. Adicione a primeira abaixo.
        </p>
      )}

      {questions.map((q, i) => (
        <QuestionEditor
          key={q._key}
          question={q}
          index={i}
          total={questions.length}
          error={errors[q._key]}
          onChange={(next) => update(i, next)}
          onMove={(d) => move(i, d)}
          onDuplicate={() => duplicate(i)}
          onDelete={() => onQuestionsChange(questions.filter((_, j) => j !== i))}
        />
      ))}

      <div>
        {!pickerOpen ? (
          <Button
            type="button"
            variant="outline"
            className="w-full border-dashed"
            onClick={() => setPickerOpen(true)}
            disabled={questions.length >= MAX_QUESTIONS}
          >
            <Plus /> Adicionar pergunta
          </Button>
        ) : (
          <div className="rounded-xl border border-border bg-card/80 p-3">
            <p className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Tipo de pergunta
            </p>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {QUESTION_TYPES.map((t) => {
                const Icon = QUESTION_TYPE_ICONS[t];
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => add(t)}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                  >
                    <Icon className="size-4 shrink-0 text-primary" />
                    {QUESTION_TYPE_LABELS[t]}
                  </button>
                );
              })}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-2 text-muted-foreground"
              onClick={() => setPickerOpen(false)}
            >
              Cancelar
            </Button>
          </div>
        )}
        {questions.length >= MAX_QUESTIONS && (
          <p className="mt-1 text-xs text-muted-foreground">
            Limite de {MAX_QUESTIONS} perguntas por formulário.
          </p>
        )}
      </div>
    </div>
  );
}
