"use client";

import { CheckCircle2, ClipboardList } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { usePublicForms } from "@/hooks/use-forms";

/** Formulários abertos do evento, mostrados dentro da página do convite. */
export function FormsSection({ token }: { token: string }) {
  const { data: forms } = usePublicForms(token);

  if (!forms || forms.length === 0) return null;

  return (
    <div className="space-y-3 border-t border-border pt-5">
      <p className="flex items-center gap-2 text-sm font-medium">
        <ClipboardList className="size-4 text-primary" /> O anfitrião quer saber
      </p>
      <ul className="space-y-2">
        {forms.map((f) => (
          <li
            key={f.uuid}
            className="flex items-center gap-3 rounded-lg border border-border bg-background/40 px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{f.title}</p>
              <p className="text-xs text-muted-foreground">
                {f.description ? `${f.description} · ` : ""}
                {f.question_count} pergunta{f.question_count === 1 ? "" : "s"}
              </p>
            </div>
            {f.already_answered ? (
              <span className="inline-flex items-center gap-1 text-xs text-primary">
                <CheckCircle2 className="size-4" /> Respondido
              </span>
            ) : (
              <Button asChild size="sm" variant="outline">
                <Link href={`/formulario/${token}/${f.uuid}`}>Responder</Link>
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
