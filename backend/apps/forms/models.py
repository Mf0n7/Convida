"""Formulários personalizados do evento (estilo Google Forms).

Um evento pode ter vários formulários; cada formulário tem perguntas tipadas
e recebe respostas anônimas (link genérico) ou identificadas (convite nominal).
"""

import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

from apps.events.models import Event, EventLink

# Limites de abuso — um formulário gigante custaria caro para renderizar,
# validar e agregar.
MAX_FORMS_PER_EVENT = 10
MAX_STANDALONE_FORMS_PER_USER = 20
MAX_QUESTIONS_PER_FORM = 50
MAX_OPTIONS_PER_QUESTION = 30
SHORT_TEXT_MAX = 300
LONG_TEXT_MAX = 2000


class Form(models.Model):
    """Formulário do usuário — vinculado a um evento ou avulso (sem evento).

    Todo formulário tem um `share_token` próprio: é o link direto, que funciona
    sem convite. Formulários de evento também aparecem dentro do convite (e,
    via convite nominal, identificam o convidado).
    """

    class Status(models.TextChoices):
        DRAFT = "draft", _("Rascunho")
        OPEN = "open", _("Aceitando respostas")
        CLOSED = "closed", _("Encerrado")

    # `share_token` vem antes de `uuid`: o campo `uuid` sombreia o módulo
    # dentro do corpo da classe.
    share_token = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    uuid = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="forms",
        verbose_name=_("dono"),
    )
    event = models.ForeignKey(
        Event, on_delete=models.CASCADE, related_name="forms", null=True, blank=True
    )
    title = models.CharField(_("título"), max_length=140)
    description = models.TextField(_("descrição"), blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)

    collect_name = models.BooleanField(_("pedir nome do respondente"), default=True)
    allow_multiple_responses = models.BooleanField(
        _("permite mais de uma resposta por convite nominal"), default=False
    )
    confirmation_message = models.CharField(
        _("mensagem de confirmação"),
        max_length=300,
        blank=True,
        default="Resposta enviada. Obrigado!",
    )
    closes_at = models.DateTimeField(_("encerra em"), null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("formulário")
        verbose_name_plural = _("formulários")
        ordering = ["created_at"]

    def __str__(self):
        suffix = f" · {self.event.title}" if self.event_id else ""
        return f"{self.title}{suffix}"

    @property
    def is_standalone(self) -> bool:
        return self.event_id is None

    @property
    def is_accepting_responses(self) -> bool:
        if self.status != self.Status.OPEN:
            return False
        if self.closes_at and self.closes_at <= timezone.now():
            return False
        return True


class Question(models.Model):
    """Pergunta de um formulário. A configuração específica do tipo vai em `config`."""

    class Type(models.TextChoices):
        SHORT_TEXT = "short_text", _("Resposta curta")
        LONG_TEXT = "long_text", _("Parágrafo")
        EMAIL = "email", _("E-mail")
        PHONE = "phone", _("Telefone")
        NUMBER = "number", _("Número")
        SINGLE_CHOICE = "single_choice", _("Múltipla escolha")
        MULTI_CHOICE = "multi_choice", _("Caixas de seleção")
        DROPDOWN = "dropdown", _("Lista suspensa")
        SCALE = "scale", _("Escala linear")
        DATE = "date", _("Data")
        TIME = "time", _("Hora")
        YES_NO = "yes_no", _("Sim / Não")

    CHOICE_TYPES = {Type.SINGLE_CHOICE, Type.MULTI_CHOICE, Type.DROPDOWN}
    TEXT_TYPES = {Type.SHORT_TEXT, Type.LONG_TEXT, Type.EMAIL, Type.PHONE}

    form = models.ForeignKey(Form, on_delete=models.CASCADE, related_name="questions")
    type = models.CharField(max_length=20, choices=Type.choices)
    label = models.CharField(_("pergunta"), max_length=300)
    help_text = models.CharField(_("descrição"), max_length=500, blank=True)
    required = models.BooleanField(_("obrigatória"), default=False)
    order = models.PositiveSmallIntegerField(default=0)
    # Por tipo:
    #   choice: {"options": [{"id": "ab12cd34", "label": "..."}]}
    #   number: {"min": 0, "max": 10}
    #   scale:  {"scale_min": 1, "scale_max": 5, "min_label": "...", "max_label": "..."}
    #   text:   {"placeholder": "..."}
    config = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("pergunta")
        verbose_name_plural = _("perguntas")
        ordering = ["order", "id"]

    def __str__(self):
        return self.label

    @property
    def options(self) -> list[dict]:
        return list(self.config.get("options") or [])

    def option_label(self, option_id) -> str | None:
        for option in self.options:
            if option.get("id") == option_id:
                return option.get("label")
        return None


class FormResponse(models.Model):
    """Uma submissão do formulário por um convidado."""

    form = models.ForeignKey(Form, on_delete=models.CASCADE, related_name="responses")
    link = models.ForeignKey(
        EventLink, on_delete=models.SET_NULL, null=True, blank=True, related_name="form_responses"
    )
    invitation = models.ForeignKey(
        "invitations.Invitation",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="form_responses",
    )
    respondent_name = models.CharField(_("nome"), max_length=120, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("resposta")
        verbose_name_plural = _("respostas")
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.respondent_name or 'Anônimo'} · {self.form.title}"

    @property
    def display_name(self) -> str:
        if self.respondent_name:
            return self.respondent_name
        if self.invitation_id and self.invitation:
            return self.invitation.guest_name
        return ""


class Answer(models.Model):
    """Valor respondido para uma pergunta. Normalizado para agregação por pergunta."""

    response = models.ForeignKey(FormResponse, on_delete=models.CASCADE, related_name="answers")
    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name="answers")
    # Escalar (texto, número, bool, "YYYY-MM-DD", "HH:MM", id de opção) ou lista
    # de ids de opção no caso de caixas de seleção.
    value = models.JSONField()

    class Meta:
        verbose_name = _("resposta de pergunta")
        verbose_name_plural = _("respostas de perguntas")
        constraints = [
            models.UniqueConstraint(
                fields=["response", "question"], name="uniq_answer_per_question"
            )
        ]

    def __str__(self):
        return f"{self.question_id}: {self.value!r}"
