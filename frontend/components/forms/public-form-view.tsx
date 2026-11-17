"use client";

import type { UseMutationResult } from "@tanstack/react-query";
import { CheckCircle2, ClipboardList } from "lucide-react";
import Link from "next/link";
import posthog from "posthog-js";
import { useState } from "react";

import { QuestionInput } from "@/components/forms/question-input";
import { Centered } from "@/components/shared/centered";
import { FieldError } from "@/components/shared/field-error";
import { PoweredBy } from "@/components/shared/powered-by";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { apiErrorMessage } from "@/lib/api";
import { submitErrors, type SubmitInput } from "@/hooks/use-forms";
import type { AnswerValue, PublicForm, PublicQuestion } from "@/lib/types";

function isEmpty(value: AnswerValue | undefined) {
  return value == null || value === "" || (Array.isArray(value) && value.length === 0);
}

/** Validação local — o servidor valida de novo e devolve erros por pergunta. */
function validate(questions: PublicQuestion[], answers: Record<string, AnswerValue>) {
  const errors: Record<string, string> = {};
  for (const q of questions) {
    const v = answers[String(q.id)];
    if (q.required && isEmpty(v)) errors[String(q.id)] = "Esta pergunta é obrigatória.";
  }
  return errors;
}

type Props = {
  form: PublicForm | undefined;
  isLoading: boolean;
  isError: boolean;
  submit: UseMutationResult<{ detail: string }, unknown, SubmitInput>;
  /** Link de "voltar" após enviar (convite do evento). Sem isso, não mostra. */
  backHref?: string;
};

/** Página pública de resposta — usada pelo link do convite e pelo link direto. */
export function PublicFormView({ form, isLoading, isError, submit, backHref }: Props) {
  const [name, setName] = useState("");
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);

  if (isLoading) {
    return (
      <main className="container flex min-h-screen flex-col items-center justify-center py-12">
        <div className="w-full max-w-lg space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </main>
    );
  }
  if (isError || !form) {
    return (
      <Centered>
        <p className="font-semibold text-2xl">Formulário indisponível</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Este link pode ter expirado ou o formulário ainda não foi publicado.
        </p>
      </Centered>
    );
  }

  const needsName = form.collect_name && !form.respondent_name;
  const closed = !form.is_accepting_responses;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const local = validate(form.questions, answers);
    if (needsName && !name.trim()) local.respondent_name = "Informe seu nome.";
    setErrors(local);
    if (Object.keys(local).length > 0) {
      document.getElementById("form-errors")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    try {
      const res = await submit.mutateAsync({
        respondent_name: needsName ? name.trim() : undefined,
        answers,
      });
      setDoneMessage(res.detail);
      posthog.capture("form_response_submitted", {
        form_uuid: form.uuid,
        question_count: form.questions.length,
        answered_count: Object.values(answers).filter((v) => !isEmpty(v)).length,
      });
    } catch (err) {
      posthog.captureException(err);
      setErrors(submitErrors(err));
      setFormError(apiErrorMessage(err, "Não foi possível enviar. Tente novamente."));
    }
  };

  return (
    <main className="container flex min-h-screen flex-col items-center justify-center py-12">
      <Card className="w-full max-w-lg overflow-hidden border-t-4 border-t-primary">
        <CardHeader>
          <p className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-primary">
            <ClipboardList className="size-4" /> {form.event_title ?? "Formulário"}
          </p>
          <CardTitle className="text-2xl">{form.title}</CardTitle>
          {form.description && (
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">{form.description}</p>
          )}
        </CardHeader>
        <CardContent>
          {doneMessage ? (
            <Done message={doneMessage} backHref={backHref} />
          ) : form.already_answered ? (
            <Done message="Você já respondeu este formulário. Obrigado!" backHref={backHref} />
          ) : closed ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Este formulário não está mais aceitando respostas.
            </p>
          ) : (
            <form onSubmit={onSubmit} className="space-y-6" noValidate>
              {form.respondent_name && (
                <p className="rounded-lg border border-border bg-background/40 px-3 py-2 text-sm">
                  Respondendo como <span className="font-medium">{form.respondent_name}</span>
                </p>
              )}
              {needsName && (
                <div className="space-y-1.5">
                  <Label htmlFor="respondent_name">
                    Seu nome<span className="ml-0.5 text-primary">*</span>
                  </Label>
                  <Input
                    id="respondent_name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Como você se chama?"
                    maxLength={120}
                    aria-invalid={!!errors.respondent_name}
                  />
                  <FieldError message={errors.respondent_name} />
                </div>
              )}

              {form.questions.map((q) => (
                <QuestionInput
                  key={q.id}
                  question={q}
                  value={answers[String(q.id)]}
                  error={errors[String(q.id)]}
                  onChange={(v) => {
                    setAnswers((prev) => ({ ...prev, [String(q.id)]: v }));
                    if (errors[String(q.id)]) {
                      setErrors((prev) => {
                        const next = { ...prev };
                        delete next[String(q.id)];
                        return next;
                      });
                    }
                  }}
                />
              ))}

              <div id="form-errors">
                {formError && <p className="text-sm text-destructive">{formError}</p>}
                {!formError && Object.keys(errors).length > 0 && (
                  <p className="text-sm text-destructive">Revise as respostas destacadas.</p>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                <span className="text-primary">*</span> obrigatória
              </p>

              <Button type="submit" className="w-full" disabled={submit.isPending}>
                {submit.isPending ? "Enviando…" : "Enviar respostas"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
      <PoweredBy />
    </main>
  );
}

function Done({ message, backHref }: { message: string; backHref?: string }) {
  return (
    <div className="flex flex-col items-center py-6 text-center">
      <CheckCircle2 className="size-12 text-primary" />
      <p className="mt-3 whitespace-pre-wrap font-semibold text-xl">{message}</p>
      {backHref && (
        <Button asChild variant="link" className="mt-2">
          <Link href={backHref}>Voltar ao convite</Link>
        </Button>
      )}
    </div>
  );
}
