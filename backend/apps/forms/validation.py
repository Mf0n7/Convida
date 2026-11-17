"""Validação de perguntas (config por tipo) e de respostas enviadas pelo convidado.

Tudo aqui é lista branca: cada tipo diz exatamente que formato de `config`
aceita e que formato de `value` aceita. Lixo cai em erro 400 com mensagem
por pergunta, nunca em 500.
"""

from __future__ import annotations

import re
import secrets
from datetime import date, time

from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.validators import validate_email

from .models import (
    LONG_TEXT_MAX,
    MAX_OPTIONS_PER_QUESTION,
    SHORT_TEXT_MAX,
    Question,
)

T = Question.Type


class AnswerError(ValueError):
    """Resposta inválida para uma pergunta — a mensagem é mostrada ao convidado."""


# ----------------------------------------------------------------- config
def _as_int(value, name: str, lo: int, hi: int) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{name} deve ser um número inteiro.") from exc
    if not lo <= number <= hi:
        raise ValueError(f"{name} deve estar entre {lo} e {hi}.")
    return number


def _as_number(value, name: str):
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        raise ValueError(f"{name} deve ser um número.")
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{name} deve ser um número.") from exc
    if number != number or number in (float("inf"), float("-inf")):
        raise ValueError(f"{name} deve ser um número.")
    return int(number) if number.is_integer() else number


def new_option_id() -> str:
    return secrets.token_hex(4)


def clean_config(question_type: str, raw) -> dict:
    """Normaliza o `config` de uma pergunta conforme o tipo.

    Devolve só as chaves que o tipo conhece. Opções ganham `id` estável
    (as respostas referenciam o id, não o rótulo — renomear uma opção não
    quebra o relatório).
    """
    raw = raw if isinstance(raw, dict) else {}
    config: dict = {}

    if question_type in Question.CHOICE_TYPES:
        options_raw = raw.get("options")
        if not isinstance(options_raw, list) or not options_raw:
            raise ValueError("Adicione ao menos uma opção.")
        if len(options_raw) > MAX_OPTIONS_PER_QUESTION:
            raise ValueError(f"Máximo de {MAX_OPTIONS_PER_QUESTION} opções por pergunta.")
        options, seen_ids, seen_labels = [], set(), set()
        for item in options_raw:
            if isinstance(item, str):
                item = {"label": item}
            if not isinstance(item, dict):
                raise ValueError("Opção inválida.")
            label = str(item.get("label") or "").strip()
            if not label:
                raise ValueError("Toda opção precisa de um texto.")
            if len(label) > 140:
                raise ValueError("Opção com mais de 140 caracteres.")
            if label.casefold() in seen_labels:
                raise ValueError(f"Opção repetida: “{label}”.")
            option_id = str(item.get("id") or "").strip()
            if not re.fullmatch(r"[A-Za-z0-9_-]{1,32}", option_id) or option_id in seen_ids:
                option_id = new_option_id()
                while option_id in seen_ids:
                    option_id = new_option_id()
            seen_ids.add(option_id)
            seen_labels.add(label.casefold())
            options.append({"id": option_id, "label": label})
        config["options"] = options

    elif question_type == T.NUMBER:
        lo = _as_number(raw.get("min"), "Mínimo")
        hi = _as_number(raw.get("max"), "Máximo")
        if lo is not None and hi is not None and lo > hi:
            raise ValueError("O mínimo não pode ser maior que o máximo.")
        config["min"] = lo
        config["max"] = hi

    elif question_type == T.SCALE:
        lo = _as_int(raw.get("scale_min", 1), "Início da escala", 0, 1)
        hi = _as_int(raw.get("scale_max", 5), "Fim da escala", 2, 10)
        config["scale_min"] = lo
        config["scale_max"] = hi
        config["min_label"] = str(raw.get("min_label") or "")[:60]
        config["max_label"] = str(raw.get("max_label") or "")[:60]

    if question_type in Question.TEXT_TYPES:
        config["placeholder"] = str(raw.get("placeholder") or "")[:120]

    return config


# ---------------------------------------------------------------- answers
_EMPTY = (None, "", [], {})
_PHONE_RE = re.compile(r"^\+?[\d\s().-]{8,20}$")
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_TIME_RE = re.compile(r"^\d{2}:\d{2}(:\d{2})?$")


def is_empty(value) -> bool:
    return value in _EMPTY or (isinstance(value, str) and not value.strip())


def clean_answer(question: Question, value):
    """Valida e normaliza o valor respondido. Devolve None quando vazio e opcional."""
    if is_empty(value):
        if question.required:
            raise AnswerError("Esta pergunta é obrigatória.")
        return None

    qtype = question.type
    config = question.config or {}

    if qtype in Question.TEXT_TYPES:
        if not isinstance(value, str):
            raise AnswerError("Resposta inválida.")
        text = value.strip()
        limit = LONG_TEXT_MAX if qtype == T.LONG_TEXT else SHORT_TEXT_MAX
        if len(text) > limit:
            raise AnswerError(f"Máximo de {limit} caracteres.")
        if qtype == T.EMAIL:
            try:
                validate_email(text)
            except DjangoValidationError as exc:
                raise AnswerError("Informe um e-mail válido.") from exc
            text = text.lower()
        if qtype == T.PHONE and not _PHONE_RE.match(text):
            raise AnswerError("Informe um telefone válido.")
        return text

    if qtype == T.NUMBER:
        try:
            number = _as_number(value, "Resposta")
        except ValueError as exc:
            raise AnswerError("Informe um número.") from exc
        lo, hi = config.get("min"), config.get("max")
        if lo is not None and number < lo:
            raise AnswerError(f"O valor mínimo é {lo}.")
        if hi is not None and number > hi:
            raise AnswerError(f"O valor máximo é {hi}.")
        return number

    if qtype in (T.SINGLE_CHOICE, T.DROPDOWN):
        if not isinstance(value, str) or question.option_label(value) is None:
            raise AnswerError("Escolha uma das opções.")
        return value

    if qtype == T.MULTI_CHOICE:
        if isinstance(value, str):
            value = [value]
        if not isinstance(value, list) or not all(isinstance(v, str) for v in value):
            raise AnswerError("Escolha ao menos uma opção.")
        wanted = set(value)
        valid_ids = [o["id"] for o in question.options]
        chosen = [v for v in valid_ids if v in wanted]  # ordem das opções, sem repetição
        if len(chosen) != len(wanted):
            raise AnswerError("Opção inválida.")
        return chosen

    if qtype == T.SCALE:
        if isinstance(value, bool):
            raise AnswerError("Escolha um valor da escala.")
        try:
            number = int(value)
        except (TypeError, ValueError) as exc:
            raise AnswerError("Escolha um valor da escala.") from exc
        lo, hi = config.get("scale_min", 1), config.get("scale_max", 5)
        if not lo <= number <= hi:
            raise AnswerError(f"Escolha um valor entre {lo} e {hi}.")
        return number

    if qtype == T.DATE:
        if not isinstance(value, str) or not _DATE_RE.match(value):
            raise AnswerError("Informe uma data válida.")
        try:
            date.fromisoformat(value)
        except ValueError as exc:
            raise AnswerError("Informe uma data válida.") from exc
        return value

    if qtype == T.TIME:
        if not isinstance(value, str) or not _TIME_RE.match(value):
            raise AnswerError("Informe um horário válido.")
        try:
            parsed = time.fromisoformat(value)
        except ValueError as exc:
            raise AnswerError("Informe um horário válido.") from exc
        return parsed.strftime("%H:%M")

    if qtype == T.YES_NO:
        if isinstance(value, bool):
            return value
        if isinstance(value, str) and value.lower() in ("true", "sim", "yes", "1"):
            return True
        if isinstance(value, str) and value.lower() in ("false", "não", "nao", "no", "0"):
            return False
        raise AnswerError("Responda sim ou não.")

    raise AnswerError("Tipo de pergunta desconhecido.")


def display_value(question: Question, value) -> str:
    """Valor legível para CSV/listagens: ids de opção viram rótulos, bool vira Sim/Não."""
    if value is None:
        return ""
    qtype = question.type
    if qtype in (T.SINGLE_CHOICE, T.DROPDOWN):
        return question.option_label(value) or str(value)
    if qtype == T.MULTI_CHOICE and isinstance(value, list):
        return "; ".join(question.option_label(v) or str(v) for v in value)
    if qtype == T.YES_NO:
        return "Sim" if value else "Não"
    if qtype == T.DATE and isinstance(value, str) and _DATE_RE.match(value):
        y, m, d = value.split("-")
        return f"{d}/{m}/{y}"
    return str(value)
