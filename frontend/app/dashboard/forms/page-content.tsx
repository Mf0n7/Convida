"use client";

import { BarChart3, CalendarHeart, Check, ClipboardList, Copy, CopyPlus, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import posthog from "posthog-js";
import { useState } from "react";
import { toast } from "sonner";

import { DashboardShell } from "@/components/dashboard/shell";
import { FormStatusBadge } from "@/components/events/forms-panel";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiErrorMessage } from "@/lib/api";
import {
  useCreateStandaloneForm,
  useDeleteForm,
  useDuplicateForm,
  useMyForms,
} from "@/hooks/use-forms";
import type { EventFormSummary } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

/** Rota do construtor: formulário de evento abre dentro do evento; avulso, aqui. */
function workspaceHref(form: EventFormSummary) {
  return form.event_uuid
    ? `/dashboard/events/${form.event_uuid}/forms/${form.id}`
    : `/dashboard/forms/${form.id}`;
}

export default function FormsPage() {
  const router = useRouter();
  const { data: forms, isLoading } = useMyForms();
  const create = useCreateStandaloneForm();

  const handleCreate = async () => {
    try {
      const form = await create.mutateAsync({ title: "Novo formulário" });
      posthog.capture("form_created", { form_id: form.id, standalone: true });
      router.push(`/dashboard/forms/${form.id}`);
    } catch (err) {
      posthog.captureException(err);
      toast.error(apiErrorMessage(err, "Não foi possível criar o formulário."));
    }
  };

  const standalone = (forms ?? []).filter((f) => f.is_standalone);
  const fromEvents = (forms ?? []).filter((f) => !f.is_standalone);

  return (
    <DashboardShell>
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Formulários</h1>
          <p className="text-sm text-muted-foreground">
            Pesquisas, enquetes e cadastros — com ou sem evento. Compartilhe o link e acompanhe
            as respostas.
          </p>
        </div>
        <Button className="w-full sm:w-auto" onClick={handleCreate} disabled={create.isPending}>
          <Plus /> Novo formulário
        </Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Carregando…</p>
      ) : !forms || forms.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <CardContent className="pt-6">
            <ClipboardList className="mx-auto size-10 text-primary" />
            <p className="mt-3 font-semibold text-xl">Nenhum formulário ainda</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Crie um formulário avulso aqui, ou um vinculado a um evento na página do evento.
            </p>
            <Button className="mt-6" onClick={handleCreate} disabled={create.isPending}>
              <Plus /> Criar formulário
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          <Section title="Avulsos" description="Sem vínculo com evento. Qualquer pessoa com o link responde.">
            {standalone.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum formulário avulso.</p>
            ) : (
              <ul className="divide-y divide-border rounded-xl border border-border bg-card/80">
                {standalone.map((f) => (
                  <FormRow key={f.id} form={f} />
                ))}
              </ul>
            )}
          </Section>

          {fromEvents.length > 0 && (
            <Section title="De eventos" description="Aparecem dentro do convite do evento.">
              <ul className="divide-y divide-border rounded-xl border border-border bg-card/80">
                {fromEvents.map((f) => (
                  <FormRow key={f.id} form={f} />
                ))}
              </ul>
            </Section>
          )}
        </div>
      )}
    </DashboardShell>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mb-3 text-sm text-muted-foreground">{description}</p>
      {children}
    </section>
  );
}

function FormRow({ form }: { form: EventFormSummary }) {
  const remove = useDeleteForm(form.event_uuid);
  const duplicate = useDuplicateForm(form.event_uuid);
  const [copied, setCopied] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const href = workspaceHref(form);

  const copy = async () => {
    await navigator.clipboard.writeText(form.public_url);
    setCopied(true);
    toast.success("Link copiado!");
    setTimeout(() => setCopied(false), 2000);
  };

  const del = async () => {
    try {
      await remove.mutateAsync(form.id);
      toast.success("Formulário excluído.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Não foi possível excluir."));
    }
  };

  const dup = async () => {
    try {
      await duplicate.mutateAsync(form.id);
      toast.success("Cópia criada como rascunho.");
    } catch (err) {
      toast.error(apiErrorMessage(err, "Não foi possível duplicar."));
    }
  };

  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={href} className="truncate font-medium hover:underline">
            {form.title}
          </Link>
          <FormStatusBadge form={form} />
        </div>
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <span>
            {form.question_count} pergunta(s) · {form.response_count} resposta(s)
          </span>
          <span>· atualizado em {formatDateTime(form.updated_at)}</span>
          {form.event_uuid && form.event_title && (
            <Link
              href={`/dashboard/events/${form.event_uuid}/edit#formularios`}
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              <CalendarHeart className="size-3.5" /> {form.event_title}
            </Link>
          )}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <Button asChild type="button" variant="ghost" size="icon" title="Editar perguntas">
          <Link href={href}>
            <Pencil />
          </Link>
        </Button>
        <Button asChild type="button" variant="ghost" size="icon" title="Ver respostas">
          <Link href={`${href}?tab=respostas`}>
            <BarChart3 />
          </Link>
        </Button>
        <Button type="button" variant="ghost" size="icon" onClick={copy} title="Copiar link">
          {copied ? <Check className="text-primary" /> : <Copy />}
        </Button>
        <Button type="button" variant="ghost" size="icon" onClick={dup} disabled={duplicate.isPending} title="Duplicar">
          <CopyPlus />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setConfirmOpen(true)}
          className="text-destructive"
          title="Excluir"
        >
          <Trash2 />
        </Button>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Excluir formulário"
        description={`Excluir “${form.title}” e todas as ${form.response_count} resposta(s)? Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        onConfirm={del}
      />
    </li>
  );
}
