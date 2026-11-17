"use client";

import { useParams } from "next/navigation";

import { PublicFormView } from "@/components/forms/public-form-view";
import { usePublicSharedForm, useSubmitSharedForm } from "@/hooks/use-forms";

/** Formulário pelo link direto (`share_token`) — avulso ou de evento. */
export default function SharedFormPage() {
  const { token } = useParams<{ token: string }>();
  const query = usePublicSharedForm(token);
  const submit = useSubmitSharedForm(token);
  return (
    <PublicFormView
      form={query.data}
      isLoading={query.isLoading}
      isError={query.isError}
      submit={submit}
    />
  );
}
