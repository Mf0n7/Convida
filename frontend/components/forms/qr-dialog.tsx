"use client";

import { FileText, ImageIcon, QrCode } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { apiErrorMessage } from "@/lib/api";
import { downloadFormQr, useFormQrPreview } from "@/hooks/use-forms";

type Props = {
  formId: number;
  title: string;
  publicUrl: string;
  disabled?: boolean;
};

function slug(text: string) {
  return (
    text
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "formulario"
  );
}

/** Botão "QR code": pré-visualiza e baixa em PNG (limpo) ou PDF A4 (moldura Convida). */
export function QrDialog({ formId, title, publicUrl, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"png" | "pdf" | null>(null);
  const preview = useFormQrPreview(formId, open);

  // Libera o object URL quando o diálogo fecha ou a URL muda.
  useEffect(() => {
    const url = preview.data;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [preview.data]);

  const download = async (kind: "png" | "pdf") => {
    setBusy(kind);
    try {
      await downloadFormQr(formId, kind, `${slug(title)}-qrcode.${kind}`);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Não foi possível gerar o QR code."));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={disabled}>
          <QrCode /> QR code
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>QR code do formulário</DialogTitle>
          <DialogDescription>
            Quem escanear abre o link público e responde pelo celular.
          </DialogDescription>
        </DialogHeader>

        <div className="mx-auto flex size-56 items-center justify-center rounded-xl border border-border bg-white p-3">
          {preview.isLoading ? (
            <Skeleton className="size-full" />
          ) : preview.isError || !preview.data ? (
            <p className="text-center text-xs text-destructive">Não foi possível carregar a prévia.</p>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- object URL local, sem otimização
            <img src={preview.data} alt={`QR code de ${title}`} className="size-full" />
          )}
        </div>
        <p className="break-all text-center font-mono text-[11px] text-muted-foreground">{publicUrl}</p>

        <div className="grid gap-2 sm:grid-cols-2">
          <Button type="button" variant="outline" onClick={() => download("png")} disabled={busy !== null}>
            <ImageIcon /> {busy === "png" ? "Gerando…" : "PNG limpo"}
          </Button>
          <Button type="button" onClick={() => download("pdf")} disabled={busy !== null}>
            <FileText /> {busy === "pdf" ? "Gerando…" : "PDF A4 com moldura"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          O PNG é só o código, para usar em artes e redes sociais. O PDF vem em A4 com a moldura do
          Convida e o título do formulário, pronto para imprimir.
        </p>
      </DialogContent>
    </Dialog>
  );
}
