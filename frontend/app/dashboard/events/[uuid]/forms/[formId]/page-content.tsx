"use client";

import { useParams } from "next/navigation";

import { FormWorkspace } from "@/components/forms/form-workspace";

export default function EventFormPage() {
  const params = useParams<{ uuid: string; formId: string }>();
  return (
    <FormWorkspace
      formId={Number(params.formId)}
      backHref={`/dashboard/events/${params.uuid}/edit#formularios`}
      backLabel="Voltar ao evento"
    />
  );
}
