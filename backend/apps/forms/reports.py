"""Relatório de respostas: agregação por pergunta e exportação CSV.

A agregação roda em Python sobre `values_list` — um formulário tem no máximo
50 perguntas e poucos milhares de respostas, bem dentro do que uma requisição
aguenta sem precisar de SQL por tipo.
"""

from __future__ import annotations

import csv
import io
import statistics
from collections import Counter, defaultdict

from django.utils import timezone

from .models import Answer, Form, FormResponse, Question
from .validation import display_value

T = Question.Type
TEXT_SAMPLE_LIMIT = 50


def _percent(part: int, total: int) -> float:
    return round(part * 100 / total, 1) if total else 0.0


def _is_number(value) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def _choice_summary(question: Question, values: list) -> dict:
    counter: Counter = Counter()
    for value in values:
        items = value if isinstance(value, list) else [value]
        for item in items:
            counter[item] += 1
    answered = len(values)
    options = [
        {
            "id": option["id"],
            "label": option["label"],
            "count": counter.get(option["id"], 0),
            # Caixas de seleção: % de respondentes que marcaram a opção.
            "percent": _percent(counter.get(option["id"], 0), answered),
        }
        for option in question.options
    ]
    return {"kind": "choices", "options": options}


def _scale_summary(question: Question, values: list) -> dict:
    lo = question.config.get("scale_min", 1)
    hi = question.config.get("scale_max", 5)
    numbers = [int(v) for v in values if _is_number(v)]
    counter = Counter(numbers)
    distribution = [
        {
            "value": step,
            "count": counter.get(step, 0),
            "percent": _percent(counter.get(step, 0), len(numbers)),
        }
        for step in range(lo, hi + 1)
    ]
    return {
        "kind": "scale",
        "distribution": distribution,
        "average": round(statistics.fmean(numbers), 2) if numbers else None,
        "min_label": question.config.get("min_label", ""),
        "max_label": question.config.get("max_label", ""),
    }


def _number_summary(values: list) -> dict:
    numbers = [v for v in values if _is_number(v)]
    if not numbers:
        return {"kind": "number", "count": 0}
    counter = Counter(numbers)
    # Distribuição por valor exato quando há poucos valores distintos;
    # acima disso, o front mostra só os totais.
    distribution = (
        [{"value": v, "count": c} for v, c in sorted(counter.items())] if len(counter) <= 20 else []
    )
    return {
        "kind": "number",
        "count": len(numbers),
        "min": min(numbers),
        "max": max(numbers),
        "sum": round(sum(numbers), 2),
        "average": round(statistics.fmean(numbers), 2),
        "median": statistics.median(numbers),
        "distribution": distribution,
    }


def _yes_no_summary(values: list) -> dict:
    yes = sum(1 for v in values if v is True)
    no = sum(1 for v in values if v is False)
    total = yes + no
    return {
        "kind": "choices",
        "options": [
            {"id": "yes", "label": "Sim", "count": yes, "percent": _percent(yes, total)},
            {"id": "no", "label": "Não", "count": no, "percent": _percent(no, total)},
        ],
    }


def _bucket_summary(question: Question, values: list) -> dict:
    """Data/hora: distribuição por data distinta ou por hora cheia."""
    if question.type == T.TIME:
        keyed = [f"{str(v)[:2]}:00" for v in values if isinstance(v, str)]
    else:
        keyed = [v for v in values if isinstance(v, str)]
    counter = Counter(keyed)
    distribution = [
        {
            "value": display_value(question, key) if question.type == T.DATE else key,
            "count": count,
        }
        for key, count in sorted(counter.items())
    ]
    return {"kind": "buckets", "distribution": distribution}


def _text_summary(values: list) -> dict:
    texts = [v for v in values if isinstance(v, str)]
    return {"kind": "text", "samples": texts[:TEXT_SAMPLE_LIMIT], "total": len(texts)}


def build_report(form: Form) -> dict:
    questions = list(form.questions.all())
    total_responses = form.responses.count()
    last = form.responses.order_by("-created_at").values_list("created_at", flat=True).first()

    values_by_question: dict[int, list] = defaultdict(list)
    rows = (
        Answer.objects.filter(response__form=form)
        .order_by("-response__created_at")
        .values_list("question_id", "value")
    )
    for question_id, value in rows:
        if value is not None:
            values_by_question[question_id].append(value)

    report_questions = []
    for question in questions:
        values = values_by_question.get(question.id, [])
        qtype = question.type
        if qtype in Question.CHOICE_TYPES:
            summary = _choice_summary(question, values)
        elif qtype == T.SCALE:
            summary = _scale_summary(question, values)
        elif qtype == T.NUMBER:
            summary = _number_summary(values)
        elif qtype == T.YES_NO:
            summary = _yes_no_summary(values)
        elif qtype in (T.DATE, T.TIME):
            summary = _bucket_summary(question, values)
        else:
            summary = _text_summary(values)
        report_questions.append(
            {
                "id": question.id,
                "type": qtype,
                "label": question.label,
                "required": question.required,
                "answered": len(values),
                "skipped": max(0, total_responses - len(values)),
                "summary": summary,
            }
        )

    # Respostas por dia (últimos 30 dias com atividade) para o gráfico de ritmo.
    per_day = Counter(
        timezone.localtime(created).date().isoformat()
        for created in form.responses.values_list("created_at", flat=True)
    )
    timeline = [{"date": d, "count": c} for d, c in sorted(per_day.items())][-30:]

    return {
        "form": {"id": form.id, "uuid": form.uuid, "title": form.title, "status": form.status},
        "total_responses": total_responses,
        "last_response_at": last,
        "timeline": timeline,
        "questions": report_questions,
    }


def build_csv(form: Form) -> str:
    """CSV com BOM (abre certo no Excel) e `;` como separador (padrão pt-BR)."""
    questions = list(form.questions.all())
    buffer = io.StringIO()
    buffer.write("﻿")
    writer = csv.writer(buffer, delimiter=";", quoting=csv.QUOTE_ALL)
    writer.writerow(["Enviado em", "Nome", "Origem", *[q.label for q in questions]])

    responses = (
        FormResponse.objects.filter(form=form)
        .select_related("invitation")
        .prefetch_related("answers")
        .order_by("created_at")
    )
    for response in responses:
        answers = {a.question_id: a.value for a in response.answers.all()}
        writer.writerow(
            [
                timezone.localtime(response.created_at).strftime("%d/%m/%Y %H:%M"),
                _csv_safe(response.display_name),
                "Convite nominal"
                if response.invitation_id
                else ("Link do convite" if response.link_id else "Link direto"),
                *[_csv_safe(display_value(q, answers.get(q.id))) for q in questions],
            ]
        )
    return buffer.getvalue()


def _csv_safe(text: str) -> str:
    """Neutraliza injeção de fórmula (=, +, -, @) ao abrir no Excel/Sheets."""
    if text and text[0] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + text
    return text
