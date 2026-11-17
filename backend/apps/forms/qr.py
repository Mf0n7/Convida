"""QR code do link público de um formulário.

Duas saídas:
  * PNG limpo — só o código, fundo branco, para colar onde quiser;
  * PDF A4 — moldura do Convida (faixa turquesa, título do formulário,
    instrução, link em texto e rodapé), pronto para imprimir.

Gerado no servidor para o resultado ser idêntico em qualquer navegador e
para o link nunca precisar sair do backend antes de virar imagem.
"""

from __future__ import annotations

import io

import qrcode
from qrcode.constants import ERROR_CORRECT_Q
from qrcode.image.pil import PilImage
from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas

# Paleta "Tropical Festa" do frontend (globals.css): turquesa + coral.
PRIMARY = HexColor("#06A6C4")
CELEBRATE = HexColor("#F2435F")
INK = HexColor("#102228")
MUTED = HexColor("#5B6B70")
SURFACE = HexColor("#F3FCFD")

QR_PIXELS = 1024  # PNG: lado aproximado, em px


def _qr_image(url: str, box_size: int = 10, border: int = 2) -> PilImage:
    qr = qrcode.QRCode(error_correction=ERROR_CORRECT_Q, box_size=box_size, border=border)
    qr.add_data(url)
    qr.make(fit=True)
    return qr.make_image(fill_color="black", back_color="white")


def build_qr_png(url: str) -> bytes:
    """PNG quadrado, fundo branco, ~1024 px de lado."""
    image = _qr_image(url, box_size=1, border=2).get_image()
    scale = max(1, QR_PIXELS // image.size[0])
    image = image.resize((image.size[0] * scale, image.size[1] * scale), resample=0)  # NEAREST
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()


def _fit_lines(text: str, font: str, size: float, max_width: float, max_lines: int) -> list[str]:
    """Quebra o texto em linhas que cabem em `max_width`; corta com reticências."""
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if stringWidth(candidate, font, size) <= max_width:
            current = candidate
            continue
        if current:
            lines.append(current)
        current = word
        if len(lines) == max_lines:
            break
    if current and len(lines) < max_lines:
        lines.append(current)
    if len(words) and " ".join(lines) != " ".join(words):
        last = lines[-1]
        while stringWidth(last + "…", font, size) > max_width and len(last) > 1:
            last = last[:-1]
        lines[-1] = last.rstrip() + "…"
    return lines


def build_qr_pdf(url: str, title: str, subtitle: str = "") -> bytes:
    """Página A4 (retrato) com a moldura do Convida e o QR centralizado."""
    buffer = io.BytesIO()
    width, height = A4
    pdf = canvas.Canvas(buffer, pagesize=A4)
    pdf.setTitle(f"QR code · {title}")
    pdf.setAuthor("Convida")

    # Fundo e faixa superior.
    pdf.setFillColor(SURFACE)
    pdf.rect(0, 0, width, height, stroke=0, fill=1)
    band_h = 42 * mm
    pdf.setFillColor(PRIMARY)
    pdf.rect(0, height - band_h, width, band_h, stroke=0, fill=1)
    pdf.setFillColor(CELEBRATE)
    pdf.rect(0, height - band_h - 2.5 * mm, width, 2.5 * mm, stroke=0, fill=1)

    # Marca.
    pdf.setFillColor(white)
    pdf.setFont("Helvetica-Bold", 30)
    pdf.drawCentredString(width / 2, height - 20 * mm, "Convida")
    pdf.setFont("Helvetica", 11)
    pdf.drawCentredString(width / 2, height - 29 * mm, "Escaneie para responder ao formulário")

    # Título (até 3 linhas) e subtítulo (evento).
    margin = 22 * mm
    y = height - band_h - 22 * mm
    pdf.setFillColor(INK)
    title_size = 26
    lines = _fit_lines(title, "Helvetica-Bold", title_size, width - 2 * margin, 3)
    pdf.setFont("Helvetica-Bold", title_size)
    for line in lines:
        pdf.drawCentredString(width / 2, y, line)
        y -= title_size * 1.25
    if subtitle:
        pdf.setFillColor(MUTED)
        pdf.setFont("Helvetica", 13)
        for line in _fit_lines(subtitle, "Helvetica", 13, width - 2 * margin, 2):
            pdf.drawCentredString(width / 2, y, line)
            y -= 13 * 1.3

    # Cartão branco com o QR.
    qr_side = 110 * mm
    pad = 10 * mm
    card_w = qr_side + 2 * pad
    card_h = qr_side + 2 * pad
    card_x = (width - card_w) / 2
    card_y = y - 10 * mm - card_h
    pdf.setFillColor(white)
    pdf.setStrokeColor(PRIMARY)
    pdf.setLineWidth(1.2)
    pdf.roundRect(card_x, card_y, card_w, card_h, 6 * mm, stroke=1, fill=1)
    qr_png = _qr_image(url, box_size=10, border=0).get_image()
    pdf.drawImage(
        ImageReader(qr_png), card_x + pad, card_y + pad, qr_side, qr_side, preserveAspectRatio=True
    )

    # Instrução e link em texto (para quem não consegue escanear).
    y = card_y - 12 * mm
    pdf.setFillColor(INK)
    pdf.setFont("Helvetica-Bold", 14)
    pdf.drawCentredString(width / 2, y, "Aponte a câmera do celular para o código")
    y -= 8 * mm
    pdf.setFillColor(MUTED)
    pdf.setFont("Helvetica", 10)
    for line in _fit_lines(url, "Helvetica", 10, width - 2 * margin, 2):
        pdf.drawCentredString(width / 2, y, line)
        y -= 5 * mm

    # Rodapé.
    pdf.setFillColor(PRIMARY)
    pdf.rect(0, 0, width, 6 * mm, stroke=0, fill=1)
    pdf.setFillColor(MUTED)
    pdf.setFont("Helvetica", 9)
    pdf.drawCentredString(width / 2, 10 * mm, "Convites, confirmações e formulários · convida.app")

    pdf.showPage()
    pdf.save()
    return buffer.getvalue()
