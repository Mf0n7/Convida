"use client";

import { useParams } from "next/navigation";

import { PublicFormView } from "@/components/forms/public-form-view";
import { usePublicForm, useSubmitForm } from "@/hooks/use-forms";

/** Formulário de evento, aberto pelo token do convite (genérico ou nominal). */
export default function EventPublicFormPage() {
  const { token, formUuid } = useParams<{ token: string; formUuid: string }>();
  const query = usePublicForm(token, formUuid);
  const submit = useSubmitForm(token, formUuid);
  return (
    <PublicFormView
      form={query.data}
      isLoading={query.isLoading}
      isError={query.isError}
      submit={submit}
      backHref={`/invite/${token}`}
    />
  );
}
