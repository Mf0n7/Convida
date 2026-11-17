from django.db import transaction
from django.db.models import Count
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils.text import slugify
from drf_spectacular.utils import extend_schema
from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.throttling import ScopedSustainedThrottle, ScopedThrottle
from apps.events.models import Event, EventLink
from apps.invitations.models import Invitation

from .models import (
    MAX_FORMS_PER_EVENT,
    MAX_STANDALONE_FORMS_PER_USER,
    Answer,
    Form,
    FormResponse,
    Question,
)
from .reports import build_csv, build_report
from .serializers import (
    FormListSerializer,
    FormResponseSerializer,
    FormSerializer,
    FormStatusSerializer,
    PublicFormSerializer,
    PublicFormSummarySerializer,
    SubmitResponseSerializer,
)
from .validation import AnswerError, clean_answer

TAG = "Formulários"


def _annotated():
    return Form.objects.annotate(
        response_count=Count("responses", distinct=True),
        question_count=Count("questions", distinct=True),
    ).select_related("event")


def _owned_form(request, pk) -> Form:
    return get_object_or_404(_annotated(), pk=pk, owner=request.user)


def _limit_error(message: str) -> Response:
    return Response({"detail": message}, status=status.HTTP_400_BAD_REQUEST)


# --------------------------------------------------------------------- Dono


@extend_schema(tags=[TAG])
class MyFormListCreateView(APIView):
    """Todos os formulários do usuário (avulsos e de eventos). POST cria um avulso."""

    permission_classes = [IsAuthenticated]
    serializer_class = FormSerializer

    def get(self, request):
        forms = _annotated().filter(owner=request.user).order_by("-updated_at")
        return Response(FormListSerializer(forms, many=True).data)

    def post(self, request):
        standalone = Form.objects.filter(owner=request.user, event__isnull=True).count()
        if standalone >= MAX_STANDALONE_FORMS_PER_USER:
            return _limit_error(f"Limite de {MAX_STANDALONE_FORMS_PER_USER} formulários avulsos.")
        serializer = FormSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            form = serializer.save(owner=request.user, event=None)
        return Response(FormSerializer(_owned_form(request, form.pk)).data, status=201)


@extend_schema(tags=[TAG])
class FormListCreateView(APIView):
    """Lista/cria formulários de um evento (dono)."""

    permission_classes = [IsAuthenticated]
    serializer_class = FormSerializer

    def _event(self, request, uuid):
        return get_object_or_404(Event, uuid=uuid, owner=request.user)

    def get(self, request, uuid):
        event = self._event(request, uuid)
        forms = _annotated().filter(event=event)
        return Response(FormListSerializer(forms, many=True).data)

    def post(self, request, uuid):
        event = self._event(request, uuid)
        if event.forms.count() >= MAX_FORMS_PER_EVENT:
            return _limit_error(f"Limite de {MAX_FORMS_PER_EVENT} formulários por evento.")
        serializer = FormSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            form = serializer.save(owner=request.user, event=event)
        return Response(FormSerializer(_owned_form(request, form.pk)).data, status=201)


@extend_schema(tags=[TAG])
class FormDetailView(generics.RetrieveUpdateDestroyAPIView):
    """Ler/editar (inclusive perguntas) ou excluir um formulário (dono)."""

    permission_classes = [IsAuthenticated]
    serializer_class = FormSerializer

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return Form.objects.none()
        return _annotated().filter(owner=self.request.user)

    def perform_update(self, serializer):
        with transaction.atomic():
            serializer.save()

    def update(self, request, *args, **kwargs):
        super().update(request, *args, **kwargs)
        # Reconsulta para devolver contagens atualizadas após sincronizar perguntas.
        return Response(FormSerializer(_owned_form(request, kwargs["pk"])).data)


@extend_schema(tags=[TAG])
class FormStatusView(APIView):
    """Publicar / encerrar / voltar a rascunho."""

    permission_classes = [IsAuthenticated]
    serializer_class = FormStatusSerializer

    def post(self, request, pk):
        form = _owned_form(request, pk)
        serializer = FormStatusSerializer(data=request.data, context={"form": form})
        serializer.is_valid(raise_exception=True)
        form.status = serializer.validated_data["status"]
        form.save(update_fields=["status", "updated_at"])
        return Response(FormSerializer(_owned_form(request, pk)).data)


@extend_schema(tags=[TAG])
class FormDuplicateView(APIView):
    """Cria uma cópia (rascunho) do formulário com as mesmas perguntas."""

    permission_classes = [IsAuthenticated]
    serializer_class = FormSerializer

    def post(self, request, pk):
        source = _owned_form(request, pk)
        if source.event_id:
            if source.event.forms.count() >= MAX_FORMS_PER_EVENT:
                return _limit_error(f"Limite de {MAX_FORMS_PER_EVENT} formulários por evento.")
        elif (
            Form.objects.filter(owner=request.user, event__isnull=True).count()
            >= MAX_STANDALONE_FORMS_PER_USER
        ):
            return _limit_error(f"Limite de {MAX_STANDALONE_FORMS_PER_USER} formulários avulsos.")
        with transaction.atomic():
            copy = Form.objects.create(
                owner=source.owner,
                event=source.event,
                title=f"{source.title} (cópia)"[:140],
                description=source.description,
                collect_name=source.collect_name,
                allow_multiple_responses=source.allow_multiple_responses,
                confirmation_message=source.confirmation_message,
                closes_at=source.closes_at,
            )
            Question.objects.bulk_create(
                [
                    Question(
                        form=copy,
                        type=q.type,
                        label=q.label,
                        help_text=q.help_text,
                        required=q.required,
                        order=q.order,
                        config=q.config,
                    )
                    for q in source.questions.all()
                ]
            )
        return Response(FormSerializer(_owned_form(request, copy.pk)).data, status=201)


@extend_schema(tags=[TAG])
class FormReportView(APIView):
    """Relatório agregado de respostas, por pergunta."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        form = _owned_form(request, pk)
        return Response(build_report(form))


@extend_schema(tags=[TAG])
class FormResponseListView(generics.ListAPIView):
    """Respostas individuais (paginado, mais recentes primeiro)."""

    permission_classes = [IsAuthenticated]
    serializer_class = FormResponseSerializer

    def get_queryset(self):
        if getattr(self, "swagger_fake_view", False):
            return FormResponse.objects.none()
        form = _owned_form(self.request, self.kwargs["pk"])
        return (
            FormResponse.objects.filter(form=form)
            .select_related("invitation")
            .prefetch_related("answers")
        )


@extend_schema(tags=[TAG])
class FormResponseDeleteView(APIView):
    """Exclui uma resposta (spam, teste, duplicada)."""

    permission_classes = [IsAuthenticated]

    def delete(self, request, pk, response_id):
        form = _owned_form(request, pk)
        response = get_object_or_404(FormResponse, pk=response_id, form=form)
        response.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(tags=[TAG])
class FormExportView(APIView):
    """Exporta as respostas em CSV (Excel/Sheets)."""

    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        form = _owned_form(request, pk)
        filename = f"{slugify(form.title) or 'formulario'}-respostas.csv"
        response = HttpResponse(build_csv(form), content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response


# ------------------------------------------------------------------ Público


def _resolve_token(token):
    """Token de convite genérico (link ativo) ou nominal -> (event, link, invitation)."""
    link = EventLink.objects.filter(token=token, is_active=True).select_related("event").first()
    if link:
        return link.event, link, None
    invitation = Invitation.objects.filter(token=token).select_related("event").first()
    if invitation:
        return invitation.event, None, invitation
    return None, None, None


def _answered_form_ids(invitation) -> set[int]:
    if not invitation:
        return set()
    return set(FormResponse.objects.filter(invitation=invitation).values_list("form_id", flat=True))


def _public_form_payload(form: Form, invitation=None) -> dict:
    data = PublicFormSerializer(form).data
    data["respondent_name"] = invitation.guest_name if invitation else ""
    data["already_answered"] = (
        form.id in _answered_form_ids(invitation) and not form.allow_multiple_responses
    )
    return data


def _submit(request, form: Form, link=None, invitation=None) -> Response:
    """Valida e grava uma resposta. Compartilhado pelo link de convite e pelo link direto."""
    if not form.is_accepting_responses:
        return Response(
            {"detail": "Este formulário não está mais aceitando respostas."},
            status=status.HTTP_409_CONFLICT,
        )
    if (
        invitation
        and not form.allow_multiple_responses
        and FormResponse.objects.filter(form=form, invitation=invitation).exists()
    ):
        return Response(
            {"detail": "Você já respondeu este formulário."},
            status=status.HTTP_409_CONFLICT,
        )

    serializer = SubmitResponseSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    raw_answers = serializer.validated_data["answers"]
    name = serializer.validated_data.get("respondent_name", "")
    if invitation:
        name = invitation.guest_name
    elif form.collect_name and not name:
        return Response(
            {"detail": "Informe seu nome.", "errors": {"respondent_name": "Informe seu nome."}},
            status=status.HTTP_400_BAD_REQUEST,
        )

    cleaned: list[tuple[Question, object]] = []
    errors: dict[str, str] = {}
    for question in form.questions.all():
        try:
            value = clean_answer(question, raw_answers.get(str(question.id)))
        except AnswerError as exc:
            errors[str(question.id)] = str(exc)
            continue
        if value is not None:
            cleaned.append((question, value))
    if errors:
        return Response(
            {"detail": "Revise as respostas destacadas.", "errors": errors},
            status=status.HTTP_400_BAD_REQUEST,
        )

    with transaction.atomic():
        response = FormResponse.objects.create(
            form=form, link=link, invitation=invitation, respondent_name=name
        )
        Answer.objects.bulk_create(
            [Answer(response=response, question=q, value=v) for q, v in cleaned]
        )
    return Response(
        {"detail": form.confirmation_message or "Resposta enviada. Obrigado!"},
        status=status.HTTP_201_CREATED,
    )


class _PublicReadView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedThrottle, ScopedSustainedThrottle]
    throttle_scope = "public_read"
    throttle_scope_sustained = "public_read_sustained"


class _PublicWriteView(APIView):
    """Escrita anônima: mesmo teto do RSVP (12/min, 60/h por IP) — impede
    inflar um relatório com milhares de respostas falsas."""

    permission_classes = [AllowAny]
    authentication_classes = []
    serializer_class = SubmitResponseSerializer
    throttle_classes = [ScopedThrottle, ScopedSustainedThrottle]
    throttle_scope = "public_write"
    throttle_scope_sustained = "public_write_sustained"


@extend_schema(tags=[TAG])
class PublicFormListView(_PublicReadView):
    """Formulários abertos do evento, vistos pelo convidado."""

    serializer_class = PublicFormSummarySerializer

    def get(self, request, token):
        event, _link, invitation = _resolve_token(token)
        if not event:
            return Response({"detail": "Convite inválido."}, status=404)
        forms = (
            Form.objects.filter(event=event, status=Form.Status.OPEN)
            .annotate(question_count=Count("questions"))
            .order_by("created_at")
        )
        forms = [f for f in forms if f.is_accepting_responses]
        answered = _answered_form_ids(invitation)
        data = PublicFormSummarySerializer(forms, many=True).data
        for item, form in zip(data, forms, strict=True):
            item["already_answered"] = form.id in answered and not form.allow_multiple_responses
        return Response(data)


@extend_schema(tags=[TAG])
class PublicFormDetailView(_PublicReadView):
    """Formulário de evento, via token de convite (perguntas incluídas)."""

    serializer_class = PublicFormSerializer

    def get(self, request, token, form_uuid):
        event, _link, invitation = _resolve_token(token)
        if not event:
            return Response({"detail": "Convite inválido."}, status=404)
        form = get_object_or_404(
            Form.objects.exclude(status=Form.Status.DRAFT).select_related("event"),
            uuid=form_uuid,
            event=event,
        )
        return Response(_public_form_payload(form, invitation))


@extend_schema(tags=[TAG])
class PublicFormSubmitView(_PublicWriteView):
    """Convidado envia uma resposta via token de convite. Erros por pergunta em `errors`."""

    def post(self, request, token, form_uuid):
        event, link, invitation = _resolve_token(token)
        if not event:
            return Response({"detail": "Convite inválido."}, status=404)
        form = get_object_or_404(Form, uuid=form_uuid, event=event)
        return _submit(request, form, link=link, invitation=invitation)


@extend_schema(tags=[TAG])
class PublicSharedFormView(_PublicReadView):
    """Formulário pelo link direto (`share_token`) — avulso ou de evento, sem convite."""

    serializer_class = PublicFormSerializer

    def get(self, request, share_token):
        form = get_object_or_404(
            Form.objects.exclude(status=Form.Status.DRAFT).select_related("event"),
            share_token=share_token,
        )
        return Response(_public_form_payload(form))


@extend_schema(tags=[TAG])
class PublicSharedFormSubmitView(_PublicWriteView):
    """Resposta pelo link direto (anônima; pede nome se o formulário exigir)."""

    def post(self, request, share_token):
        form = get_object_or_404(Form, share_token=share_token)
        return _submit(request, form)
