"""Testes do módulo de formulários: construtor, publicação, resposta pública e relatório.

Rodar:  pytest apps/forms/tests.py
"""

import pytest
from django.core.cache import cache
from django.utils import timezone
from model_bakery import baker
from rest_framework.test import APIClient

from apps.events.models import Event
from apps.invitations.models import Invitation

from .models import Form, FormResponse, Question

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _clean_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def owner(django_user_model):
    return django_user_model.objects.create_user(email="dono@convida.app", password="Senha!123")


@pytest.fixture
def event(owner):
    return baker.make(Event, owner=owner, starts_at=timezone.now() + timezone.timedelta(days=10))


@pytest.fixture
def api(owner):
    client = APIClient()
    client.force_authenticate(owner)
    return client


@pytest.fixture
def anon():
    return APIClient()


def question_payload():
    return [
        {"type": "short_text", "label": "Apelido", "required": False},
        {
            "type": "single_choice",
            "label": "Prato principal",
            "required": True,
            "config": {"options": [{"label": "Carne"}, {"label": "Peixe"}, {"label": "Vegano"}]},
        },
        {
            "type": "multi_choice",
            "label": "Restrições",
            "config": {
                "options": [{"id": "lac", "label": "Lactose"}, {"id": "glu", "label": "Glúten"}]
            },
        },
        {"type": "number", "label": "Idade", "config": {"min": 0, "max": 120}},
        {"type": "scale", "label": "Animação", "config": {"scale_min": 1, "scale_max": 5}},
        {"type": "yes_no", "label": "Vai de carro?", "required": True},
        {"type": "email", "label": "E-mail"},
        {"type": "date", "label": "Chegada"},
    ]


def create_form(api, event, publish=True):
    res = api.post(
        f"/api/v1/events/{event.uuid}/forms/",
        {"title": "Pesquisa do jantar", "questions": question_payload()},
        format="json",
    )
    assert res.status_code == 201, res.data
    form = Form.objects.get(pk=res.data["id"])
    if publish:
        res = api.post(f"/api/v1/forms/{form.pk}/status/", {"status": "open"}, format="json")
        assert res.status_code == 200, res.data
        form.refresh_from_db()
    return form


def answers_for(form: Form, **overrides) -> dict:
    by_label = {q.label: q for q in form.questions.all()}
    prato = by_label["Prato principal"]
    base = {
        str(by_label["Apelido"].id): "Zé",
        str(prato.id): prato.options[0]["id"],
        str(by_label["Restrições"].id): ["glu"],
        str(by_label["Idade"].id): 31,
        str(by_label["Animação"].id): 4,
        str(by_label["Vai de carro?"].id): True,
        str(by_label["E-mail"].id): "ZE@Exemplo.com",
        str(by_label["Chegada"].id): "2026-12-24",
    }
    for label, value in overrides.items():
        base[str(by_label[label].id)] = value
    return base


# ------------------------------------------------------------------ construtor
def test_cria_formulario_com_perguntas_e_gera_ids_de_opcao(api, event):
    form = create_form(api, event, publish=False)
    assert form.questions.count() == 8
    prato = form.questions.get(label="Prato principal")
    ids = [o["id"] for o in prato.options]
    assert len(set(ids)) == 3 and all(ids)
    # Ids informados pelo cliente são preservados.
    restricoes = form.questions.get(label="Restrições")
    assert [o["id"] for o in restricoes.options] == ["lac", "glu"]


def test_put_sincroniza_perguntas_cria_edita_e_remove(api, event):
    form = create_form(api, event, publish=False)
    q = list(form.questions.all())
    payload = {
        "title": "Pesquisa v2",
        "questions": [
            {"id": q[1].id, "type": q[1].type, "label": "Prato (editado)", "config": q[1].config},
            {"type": "long_text", "label": "Comentários"},
        ],
    }
    res = api.put(f"/api/v1/forms/{form.pk}/", payload, format="json")
    assert res.status_code == 200, res.data
    labels = list(form.questions.values_list("label", flat=True))
    assert labels == ["Prato (editado)", "Comentários"]
    assert form.questions.get(label="Prato (editado)").pk == q[1].pk


def test_pergunta_de_escolha_sem_opcoes_e_rejeitada(api, event):
    res = api.post(
        f"/api/v1/events/{event.uuid}/forms/",
        {"title": "X", "questions": [{"type": "dropdown", "label": "Cor", "config": {}}]},
        format="json",
    )
    assert res.status_code == 400
    assert "opção" in str(res.data).lower()


def test_nao_publica_sem_perguntas(api, event):
    res = api.post(f"/api/v1/events/{event.uuid}/forms/", {"title": "Vazio"}, format="json")
    form_id = res.data["id"]
    res = api.post(f"/api/v1/forms/{form_id}/status/", {"status": "open"}, format="json")
    assert res.status_code == 400


def test_outro_usuario_nao_acessa_formulario(api, event, django_user_model):
    form = create_form(api, event)
    other = django_user_model.objects.create_user(email="x@convida.app", password="Senha!123")
    client = APIClient()
    client.force_authenticate(other)
    assert client.get(f"/api/v1/forms/{form.pk}/").status_code == 404
    assert client.get(f"/api/v1/forms/{form.pk}/report/").status_code == 404


def test_duplicar_formulario(api, event):
    form = create_form(api, event)
    res = api.post(f"/api/v1/forms/{form.pk}/duplicate/")
    assert res.status_code == 201
    assert res.data["status"] == "draft"
    assert len(res.data["questions"]) == 8


# --------------------------------------------------------------------- público
def test_convidado_responde_pelo_link_generico(api, anon, event):
    form = create_form(api, event)
    token = event.ensure_link().token

    listing = anon.get(f"/api/v1/public/{token}/forms/")
    assert listing.status_code == 200
    assert listing.data[0]["uuid"] == str(form.uuid)

    detail = anon.get(f"/api/v1/public/{token}/forms/{form.uuid}/")
    assert detail.status_code == 200
    assert len(detail.data["questions"]) == 8

    res = anon.post(
        f"/api/v1/public/{token}/forms/{form.uuid}/responses/",
        {"respondent_name": "Zé", "answers": answers_for(form)},
        format="json",
    )
    assert res.status_code == 201, res.data
    response = FormResponse.objects.get()
    assert response.respondent_name == "Zé"
    values = {a.question.label: a.value for a in response.answers.all()}
    assert values["E-mail"] == "ze@exemplo.com"  # normalizado
    assert values["Restrições"] == ["glu"]
    assert values["Vai de carro?"] is True


def test_erros_voltam_por_pergunta(api, anon, event):
    form = create_form(api, event)
    token = event.ensure_link().token
    by_label = {q.label: q for q in form.questions.all()}
    bad = answers_for(
        form,
        **{"Prato principal": "nao-existe", "Idade": 200, "E-mail": "errado", "Vai de carro?": ""},
    )
    res = anon.post(
        f"/api/v1/public/{token}/forms/{form.uuid}/responses/",
        {"respondent_name": "Zé", "answers": bad},
        format="json",
    )
    assert res.status_code == 400
    errors = res.data["errors"]
    assert set(errors) == {
        str(by_label["Prato principal"].id),
        str(by_label["Idade"].id),
        str(by_label["E-mail"].id),
        str(by_label["Vai de carro?"].id),
    }
    assert FormResponse.objects.count() == 0


def test_exige_nome_quando_collect_name(api, anon, event):
    form = create_form(api, event)
    token = event.ensure_link().token
    res = anon.post(
        f"/api/v1/public/{token}/forms/{form.uuid}/responses/",
        {"answers": answers_for(form)},
        format="json",
    )
    assert res.status_code == 400
    assert "respondent_name" in res.data["errors"]


def test_convite_nominal_preenche_nome_e_bloqueia_duplicata(api, anon, event):
    form = create_form(api, event)
    invitation = Invitation.objects.create(event=event, guest_name="Maria Souza")
    url = f"/api/v1/public/{invitation.token}/forms/{form.uuid}/responses/"

    detail = anon.get(f"/api/v1/public/{invitation.token}/forms/{form.uuid}/")
    assert detail.data["respondent_name"] == "Maria Souza"
    assert detail.data["already_answered"] is False

    res = anon.post(url, {"answers": answers_for(form)}, format="json")
    assert res.status_code == 201, res.data
    assert FormResponse.objects.get().display_name == "Maria Souza"

    res = anon.post(url, {"answers": answers_for(form)}, format="json")
    assert res.status_code == 409

    detail = anon.get(f"/api/v1/public/{invitation.token}/forms/{form.uuid}/")
    assert detail.data["already_answered"] is True


def test_rascunho_e_encerrado_nao_aceitam_resposta(api, anon, event):
    form = create_form(api, event, publish=False)
    token = event.ensure_link().token
    assert anon.get(f"/api/v1/public/{token}/forms/{form.uuid}/").status_code == 404
    assert anon.get(f"/api/v1/public/{token}/forms/").data == []

    form.status = Form.Status.CLOSED
    form.save()
    res = anon.post(
        f"/api/v1/public/{token}/forms/{form.uuid}/responses/",
        {"respondent_name": "Zé", "answers": answers_for(form)},
        format="json",
    )
    assert res.status_code == 409


def test_closes_at_no_passado_encerra(api, anon, event):
    form = create_form(api, event)
    form.closes_at = timezone.now() - timezone.timedelta(minutes=1)
    form.save()
    token = event.ensure_link().token
    assert anon.get(f"/api/v1/public/{token}/forms/").data == []
    res = anon.post(
        f"/api/v1/public/{token}/forms/{form.uuid}/responses/",
        {"respondent_name": "Zé", "answers": answers_for(form)},
        format="json",
    )
    assert res.status_code == 409


# ------------------------------------------------------------------- relatório
def test_relatorio_agrega_por_tipo(api, anon, event):
    form = create_form(api, event)
    token = event.ensure_link().token
    prato = form.questions.get(label="Prato principal")
    carne, peixe = prato.options[0]["id"], prato.options[1]["id"]
    submissions = [
        answers_for(
            form, **{"Prato principal": carne, "Idade": 20, "Animação": 5, "Vai de carro?": True}
        ),
        answers_for(
            form, **{"Prato principal": carne, "Idade": 40, "Animação": 3, "Vai de carro?": False}
        ),
        answers_for(
            form, **{"Prato principal": peixe, "Idade": 30, "Animação": 4, "Vai de carro?": True}
        ),
    ]
    for i, answers in enumerate(submissions):
        res = anon.post(
            f"/api/v1/public/{token}/forms/{form.uuid}/responses/",
            {"respondent_name": f"Pessoa {i}", "answers": answers},
            format="json",
        )
        assert res.status_code == 201, res.data

    report = api.get(f"/api/v1/forms/{form.pk}/report/").data
    assert report["total_responses"] == 3
    by_label = {q["label"]: q for q in report["questions"]}

    prato_summary = by_label["Prato principal"]["summary"]
    counts = {o["label"]: o["count"] for o in prato_summary["options"]}
    assert counts == {"Carne": 2, "Peixe": 1, "Vegano": 0}
    assert prato_summary["options"][0]["percent"] == 66.7

    idade = by_label["Idade"]["summary"]
    assert idade["min"] == 20 and idade["max"] == 40 and idade["average"] == 30

    animacao = by_label["Animação"]["summary"]
    assert animacao["average"] == 4.0
    assert [d["count"] for d in animacao["distribution"]] == [0, 0, 1, 1, 1]

    carro = by_label["Vai de carro?"]["summary"]
    assert [o["count"] for o in carro["options"]] == [2, 1]

    assert by_label["Apelido"]["summary"]["kind"] == "text"
    assert by_label["Apelido"]["answered"] == 3
    assert len(report["timeline"]) == 1


def test_lista_e_exclui_respostas(api, anon, event):
    form = create_form(api, event)
    token = event.ensure_link().token
    anon.post(
        f"/api/v1/public/{token}/forms/{form.uuid}/responses/",
        {"respondent_name": "Zé", "answers": answers_for(form)},
        format="json",
    )
    res = api.get(f"/api/v1/forms/{form.pk}/responses/")
    assert res.status_code == 200
    assert res.data["count"] == 1
    row = res.data["results"][0]
    assert row["display_name"] == "Zé" and row["via"] == "link"

    res = api.delete(f"/api/v1/forms/{form.pk}/responses/{row['id']}/")
    assert res.status_code == 204
    assert FormResponse.objects.count() == 0


def test_exporta_csv_com_rotulos_e_protecao_de_formula(api, anon, event):
    form = create_form(api, event)
    token = event.ensure_link().token
    anon.post(
        f"/api/v1/public/{token}/forms/{form.uuid}/responses/",
        {"respondent_name": "=HYPERLINK(1)", "answers": answers_for(form)},
        format="json",
    )
    res = api.get(f"/api/v1/forms/{form.pk}/export/")
    assert res.status_code == 200
    assert res["Content-Type"].startswith("text/csv")
    body = res.content.decode("utf-8-sig")
    header, row = body.strip().splitlines()
    assert '"Prato principal"' in header
    assert '"Carne"' in row and '"Glúten"' in row and '"Sim"' in row and '"24/12/2026"' in row
    assert '"\'=HYPERLINK(1)"' in row


def test_apagar_pergunta_apaga_respostas_dela(api, anon, event):
    form = create_form(api, event)
    token = event.ensure_link().token
    anon.post(
        f"/api/v1/public/{token}/forms/{form.uuid}/responses/",
        {"respondent_name": "Zé", "answers": answers_for(form)},
        format="json",
    )
    keep = [q for q in form.questions.all() if q.label != "Idade"]
    api.put(
        f"/api/v1/forms/{form.pk}/",
        {
            "title": form.title,
            "questions": [
                {"id": q.id, "type": q.type, "label": q.label, "config": q.config} for q in keep
            ],
        },
        format="json",
    )
    assert not Question.objects.filter(form=form, label="Idade").exists()
    response = FormResponse.objects.get()
    assert response.answers.count() == 7


# ------------------------------------------------------------------- avulsos
def test_cria_formulario_avulso_e_responde_pelo_link_direto(api, anon, owner):
    res = api.post(
        "/api/v1/forms/",
        {"title": "Pesquisa geral", "questions": [{"type": "yes_no", "label": "Gostou?"}]},
        format="json",
    )
    assert res.status_code == 201, res.data
    assert res.data["is_standalone"] is True and res.data["event_uuid"] is None
    form = Form.objects.get(pk=res.data["id"])
    assert form.owner == owner and form.event is None
    assert res.data["public_url"].endswith(f"/formulario/{form.share_token}")

    # Rascunho não é público.
    assert anon.get(f"/api/v1/public/forms/{form.share_token}/").status_code == 404
    api.post(f"/api/v1/forms/{form.pk}/status/", {"status": "open"}, format="json")

    detail = anon.get(f"/api/v1/public/forms/{form.share_token}/")
    assert detail.status_code == 200
    assert detail.data["event_title"] is None and detail.data["already_answered"] is False

    qid = str(form.questions.get().id)
    res = anon.post(
        f"/api/v1/public/forms/{form.share_token}/responses/",
        {"respondent_name": "Zé", "answers": {qid: True}},
        format="json",
    )
    assert res.status_code == 201, res.data
    row = api.get(f"/api/v1/forms/{form.pk}/responses/").data["results"][0]
    assert row["via"] == "direct" and row["display_name"] == "Zé"


def test_lista_minha_inclui_avulsos_e_de_eventos(api, event):
    create_form(api, event, publish=False)
    api.post("/api/v1/forms/", {"title": "Avulso"}, format="json")
    res = api.get("/api/v1/forms/")
    assert res.status_code == 200
    kinds = {f["title"]: f["is_standalone"] for f in res.data}
    assert kinds == {"Pesquisa do jantar": False, "Avulso": True}
    assert (
        next(f for f in res.data if f["title"] == "Pesquisa do jantar")["event_title"]
        == event.title
    )


def test_formulario_de_evento_tambem_responde_pelo_link_direto(api, anon, event):
    form = create_form(api, event)
    res = anon.post(
        f"/api/v1/public/forms/{form.share_token}/responses/",
        {"respondent_name": "Zé", "answers": answers_for(form)},
        format="json",
    )
    assert res.status_code == 201, res.data
    assert FormResponse.objects.get().link is None


def test_apagar_evento_apaga_formularios_vinculados_mas_nao_avulsos(api, event, owner):
    create_form(api, event, publish=False)
    api.post("/api/v1/forms/", {"title": "Avulso"}, format="json")
    event.delete()
    assert list(Form.objects.filter(owner=owner).values_list("title", flat=True)) == ["Avulso"]


# ------------------------------------------------------------------- QR code
def test_qr_png_e_pdf_do_formulario(api, event):
    form = create_form(api, event, publish=False)

    png = api.get(f"/api/v1/forms/{form.pk}/qr.png")
    assert png.status_code == 200
    assert png["Content-Type"] == "image/png"
    assert png.content[:8] == b"\x89PNG\r\n\x1a\n"
    assert "qrcode.png" in png["Content-Disposition"]

    pdf = api.get(f"/api/v1/forms/{form.pk}/qr.pdf")
    assert pdf.status_code == 200
    assert pdf["Content-Type"] == "application/pdf"
    assert pdf.content[:5] == b"%PDF-"
    assert len(pdf.content) > 2000


def test_qr_png_decodifica_para_o_link_publico(api, event):
    from io import BytesIO

    from PIL import Image

    form = create_form(api, event, publish=False)
    detail = api.get(f"/api/v1/forms/{form.pk}/").data
    png = api.get(f"/api/v1/forms/{form.pk}/qr.png").content
    image = Image.open(BytesIO(png))
    assert image.size[0] >= 900 and image.size[0] == image.size[1]
    assert detail["public_url"].endswith(f"/formulario/{form.share_token}")


def test_qr_de_outro_usuario_e_404(api, event, django_user_model):
    form = create_form(api, event, publish=False)
    other = django_user_model.objects.create_user(email="y@convida.app", password="Senha!123")
    client = APIClient()
    client.force_authenticate(other)
    assert client.get(f"/api/v1/forms/{form.pk}/qr.png").status_code == 404
    assert client.get(f"/api/v1/forms/{form.pk}/qr.pdf").status_code == 404
