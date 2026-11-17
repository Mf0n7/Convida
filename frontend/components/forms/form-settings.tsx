"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { isoToLocalInput, localInputToIso } from "@/lib/utils";

export type FormSettingsValues = {
  collect_name: boolean;
  allow_multiple_responses: boolean;
  confirmation_message: string;
  closes_at: string | null;
};

type Props = {
  values: FormSettingsValues;
  onChange: (next: FormSettingsValues) => void;
};

export function FormSettings({ values, onChange }: Props) {
  const patch = (partial: Partial<FormSettingsValues>) => onChange({ ...values, ...partial });

  return (
    <div className="space-y-6 rounded-xl border border-border bg-card/80 p-4 shadow-sm sm:p-5">
      <SettingRow
        title="Pedir o nome de quem responde"
        description="Quem abre pelo link genérico precisa informar o nome. Convites nominais já identificam o convidado automaticamente."
      >
        <Switch
          checked={values.collect_name}
          onCheckedChange={(v) => patch({ collect_name: v })}
          aria-label="Pedir nome"
        />
      </SettingRow>

      <SettingRow
        title="Permitir mais de uma resposta por convite nominal"
        description="Desligado, cada convite nominal responde uma única vez. Pelo link genérico não há como identificar repetições."
      >
        <Switch
          checked={values.allow_multiple_responses}
          onCheckedChange={(v) => patch({ allow_multiple_responses: v })}
          aria-label="Permitir várias respostas"
        />
      </SettingRow>

      <div className="space-y-1.5">
        <Label htmlFor="confirmation_message">Mensagem após enviar</Label>
        <Textarea
          id="confirmation_message"
          value={values.confirmation_message}
          onChange={(e) => patch({ confirmation_message: e.target.value.slice(0, 300) })}
          placeholder="Resposta enviada. Obrigado!"
          className="min-h-16"
        />
        <p className="text-xs text-muted-foreground">
          {values.confirmation_message.length}/300
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="closes_at">Encerrar automaticamente em (opcional)</Label>
        <div className="flex gap-2">
          <Input
            id="closes_at"
            type="datetime-local"
            value={values.closes_at ? isoToLocalInput(values.closes_at) : ""}
            onChange={(e) =>
              patch({ closes_at: e.target.value ? localInputToIso(e.target.value) : null })
            }
          />
          {values.closes_at && (
            <button
              type="button"
              className="text-sm text-muted-foreground hover:text-foreground"
              onClick={() => patch({ closes_at: null })}
            >
              Limpar
            </button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Depois desse horário o formulário para de aceitar respostas, mesmo publicado.
        </p>
      </div>
    </div>
  );
}

function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0 pt-0.5">{children}</div>
    </div>
  );
}
