"use client";

import { BarChart3, Check, ClipboardList, Copy, CopyPlus, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import posthog from "posthog-js";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiErrorMessage } from "@/lib/api";
import {
  useCreateForm,
  useDeleteForm,
  useDuplicateForm,
  useEventForms,
} from "@/hooks/use-forms";
import type { EventFormSummary, FormStatus } from "@/lib/types";

const STATUS_LABEL: Record<FormStatus, string> = {
  draft: "Rascunho",
  open: "Aberto",
  closed: "Encerrado",
};

export function FormStatusBadge({ form }: { form: { status: FormStatus; is_accepting_responses: boolean } }) {
  const expired = form.status === "open" && !form.is_accepting_responses;
  return (
    <Badge
      variant={form.status === "open" && !expired ? "default" : "secondary"}
      className="font-medium"
    >
      {expired ? "Encerrado (prazo)" : STATUS_LABEL[form.status]}
    </Badge>
  );
}

export function FormsPanel({ uuid }: { uuid: string }) {
  const router = useRouter();
  const { data: forms, isLoading } = useEventForms(uuid);
  const create = useCreateForm(uuid);

  const handleCreate = async () => {
    try {
      const form = await create.mutateAsync({ title: "Novo formulário" });
      posthog.capture("form_created", { event_id: uuid, form_id: form.id });
      router.push(`/dashboard/events/${uuid}/forms/${form.id}`);
    } catch (err) {
      posthog.captureException(err);
      toast.error(apiErrorMessage(err, "Não foi possível criar o formulário."));
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-xl">Formulários</CardTitle>
        <Button type="button" size="sm" onClick={handleCreate} disabled={create.isPending}>
          <Plus /> Novo formulário
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Pergunte o que quiser aos convidados — preferências de cardápio, carona,
          restrições alimentares — e acompanhe as respostas em um relatório.
        </p>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : !forms || forms.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center">
            <ClipboardList className="mx-auto size-8 text-primary" />
            <p className="mt-2 text-sm font-medium">Nenhum formulário ainda</p>
            <p className="text-xs text-muted-foreground">
              Crie o primeiro e publique para os convidados responderem.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {forms.map((f) => (
              <FormRow key={f.id} uuid={uuid} form={f} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function FormRow({ uuid, form }: { uuid: string; form: EventFormSummary }) {
  const remove = useDeleteForm(uuid);
  const duplicate = useDuplicateForm(uuid);
  const [copied, setCopied] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const copy = async () => {
    if (!form.public_url) {
      toast.info("Gere o link de convite do evento para compartilhar o formulário.");
      return;
    }
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

  const href = `/dashboard/events/${uuid}/forms/${form.id}`;

  return (
    <li className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={href} className="truncate text-sm font-medium hover:underline">
            {form.title}
          </Link>
          <FormStatusBadge form={form} />
        </div>
        <p className="text-xs text-muted-foreground">
          {form.question_count} pergunta(s) · {form.response_count} resposta(s)
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
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={dup}
          disabled={duplicate.isPending}
          title="Duplicar"
        >
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
