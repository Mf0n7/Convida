from django.conf import settings
from django.utils import timezone
from rest_framework import serializers

from .models import MAX_QUESTIONS_PER_FORM, Form, FormResponse, Question
from .validation import clean_config


def public_form_url(form: Form) -> str:
    """Link público do formulário.

    Formulário de evento com link de convite ativo: passa pelo token do convite
    (assim o convidado nominal é identificado). Caso contrário, link direto
    pelo `share_token` do próprio formulário.
    """
    if form.event_id:
        link = form.event.active_link()
        if link:
            return f"{settings.FRONTEND_URL}/formulario/{link.token}/{form.uuid}"
    return f"{settings.FRONTEND_URL}/formulario/{form.share_token}"


class QuestionSerializer(serializers.ModelSerializer):
    """Pergunta como o dono edita. `id` é opcional: sem id = criar."""

    id = serializers.IntegerField(required=False, allow_null=True)

    class Meta:
        model = Question
        fields = ["id", "type", "label", "help_text", "required", "order", "config"]
        extra_kwargs = {"order": {"required": False}}

    def validate_label(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Escreva o texto da pergunta.")
        return value

    def validate(self, attrs):
        try:
            attrs["config"] = clean_config(attrs["type"], attrs.get("config"))
        except ValueError as exc:
            raise serializers.ValidationError({"config": str(exc)}) from exc
        return attrs


class _FormContextMixin(serializers.Serializer):
    """Campos comuns de contexto (evento, link) para lista e detalhe."""

    public_url = serializers.SerializerMethodField()
    is_accepting_responses = serializers.BooleanField(read_only=True)
    is_standalone = serializers.BooleanField(read_only=True)
    event_uuid = serializers.SerializerMethodField()
    event_title = serializers.SerializerMethodField()

    def get_public_url(self, obj) -> str:
        return public_form_url(obj)

    def get_event_uuid(self, obj) -> str | None:
        return str(obj.event.uuid) if obj.event_id else None

    def get_event_title(self, obj) -> str | None:
        return obj.event.title if obj.event_id else None


class FormSerializer(_FormContextMixin, serializers.ModelSerializer):
    """Formulário completo (dono). Escrita aninhada sincroniza as perguntas."""

    questions = QuestionSerializer(many=True, required=False)
    response_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Form
        fields = [
            "id",
            "uuid",
            "share_token",
            "title",
            "description",
            "status",
            "collect_name",
            "allow_multiple_responses",
            "confirmation_message",
            "closes_at",
            "is_accepting_responses",
            "is_standalone",
            "event_uuid",
            "event_title",
            "response_count",
            "public_url",
            "questions",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "uuid", "share_token", "status", "created_at", "updated_at"]

    def validate_title(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Dê um título ao formulário.")
        return value

    def validate_questions(self, value):
        if len(value) > MAX_QUESTIONS_PER_FORM:
            raise serializers.ValidationError(
                f"Máximo de {MAX_QUESTIONS_PER_FORM} perguntas por formulário."
            )
        return value

    def create(self, validated_data):
        questions = validated_data.pop("questions", [])
        form = Form.objects.create(**validated_data)
        self._sync_questions(form, questions)
        return form

    def update(self, instance, validated_data):
        questions = validated_data.pop("questions", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if questions is not None:
            self._sync_questions(instance, questions)
        return instance

    @staticmethod
    def _sync_questions(form: Form, items: list[dict]) -> None:
        """Cria/atualiza/remove perguntas para espelhar a lista enviada.

        Ids desconhecidos (ou de outro formulário) são ignorados e viram
        pergunta nova — nunca permitem editar pergunta alheia.
        """
        existing = {q.id: q for q in form.questions.all()}
        keep: set[int] = set()
        for index, item in enumerate(items):
            question_id = item.pop("id", None)
            item["order"] = index
            question = existing.get(question_id) if question_id else None
            if question is None:
                question = Question.objects.create(form=form, **item)
            else:
                for attr, value in item.items():
                    setattr(question, attr, value)
                question.save()
            keep.add(question.id)
        # Apagar perguntas removidas apaga as respostas delas (cascade).
        form.questions.exclude(id__in=keep).delete()


class FormListSerializer(_FormContextMixin, serializers.ModelSerializer):
    """Resumo para listas (painel do evento e página "Formulários")."""

    response_count = serializers.IntegerField(read_only=True)
    question_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Form
        fields = [
            "id",
            "uuid",
            "share_token",
            "title",
            "status",
            "is_accepting_responses",
            "is_standalone",
            "event_uuid",
            "event_title",
            "closes_at",
            "response_count",
            "question_count",
            "public_url",
            "created_at",
            "updated_at",
        ]


class FormStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Form.Status.choices)

    def validate(self, attrs):
        form: Form = self.context["form"]
        if attrs["status"] == Form.Status.OPEN:
            if not form.questions.exists():
                raise serializers.ValidationError(
                    {"status": "Adicione ao menos uma pergunta antes de publicar."}
                )
            if form.closes_at and form.closes_at <= timezone.now():
                raise serializers.ValidationError(
                    {"status": "A data de encerramento já passou. Ajuste-a antes de reabrir."}
                )
        return attrs


# ------------------------------------------------------------------ público
class PublicQuestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Question
        fields = ["id", "type", "label", "help_text", "required", "config"]


class PublicFormSerializer(serializers.ModelSerializer):
    """Formulário como o convidado vê (sem dados do dono, sem contagens)."""

    questions = PublicQuestionSerializer(many=True, read_only=True)
    is_accepting_responses = serializers.BooleanField(read_only=True)
    event_title = serializers.SerializerMethodField()

    class Meta:
        model = Form
        fields = [
            "uuid",
            "title",
            "description",
            "status",
            "is_accepting_responses",
            "collect_name",
            "confirmation_message",
            "closes_at",
            "event_title",
            "questions",
        ]

    def get_event_title(self, obj) -> str | None:
        return obj.event.title if obj.event_id else None


class PublicFormSummarySerializer(serializers.ModelSerializer):
    question_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Form
        fields = ["uuid", "title", "description", "question_count"]


class SubmitResponseSerializer(serializers.Serializer):
    """Corpo da submissão: `{"respondent_name": "...", "answers": {"<id>": valor}}`.

    A validação por pergunta acontece na view (precisa das perguntas carregadas
    e devolve erro por id de pergunta).
    """

    respondent_name = serializers.CharField(
        max_length=120, required=False, allow_blank=True, trim_whitespace=True
    )
    answers = serializers.DictField(required=False, default=dict)


class FormResponseSerializer(serializers.ModelSerializer):
    """Resposta individual como o dono vê."""

    display_name = serializers.CharField(read_only=True)
    answers = serializers.SerializerMethodField()
    via = serializers.SerializerMethodField()

    class Meta:
        model = FormResponse
        fields = ["id", "display_name", "via", "created_at", "answers"]

    def get_answers(self, obj) -> dict:
        return {str(a.question_id): a.value for a in obj.answers.all()}

    def get_via(self, obj) -> str:
        if obj.invitation_id:
            return "nominal"
        if obj.link_id:
            return "link"
        return "direct"
