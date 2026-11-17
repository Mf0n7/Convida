"use client";

import { useParams } from "next/navigation";

import { FormWorkspace } from "@/components/forms/form-workspace";

export default function StandaloneFormPage() {
  const params = useParams<{ formId: string }>();
  return (
    <FormWorkspace
      formId={Number(params.formId)}
      backHref="/dashboard/forms"
      backLabel="Meus formulários"
    />
  );
}
