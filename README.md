# Convida 🎉

Plataforma de **convites online e confirmação de presença (RSVP)** para festas, aniversários,
casamentos e eventos em geral. Convites genéricos e nominais, lista de presentes e camadas de
acesso pagas por capacidade de convidados.

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | Python 3.13 · Django 5 · Django REST Framework |
| Auth | JWT (simplejwt) · Google SSO (allauth + dj-rest-auth) · reset de senha por e-mail |
| Docs API | drf-spectacular (Swagger / Redoc) |
| Pagamentos | Stripe (assinatura por faixa + compra avulsa por evento + addon de presentes) |
| Async | Celery + Redis |
| Banco | PostgreSQL |
| Frontend | Next.js 15 (App Router) · TypeScript · Tailwind · shadcn/ui · zod · TanStack Query · next-themes |
| Infra | Docker · Coolify (Hostinger VPS) |

## Estrutura

```
convida/
├── backend/      # API Django + DRF
├── frontend/     # App Next.js
├── docker-compose.yml          # ambiente de desenvolvimento
└── docker-compose.coolify.yml  # deploy (Coolify)
```

## Modelo de negócio (resumo)

Capacidade do evento = nº de confirmados (acompanhantes contam).

| Capacidade | Evento (avulso) | Assinatura/mês (1,8×) |
|---|---|---|
| até 20 | Grátis | — |
| 50 / 100 / 150 / 200 | R$ 10 / 20 / 25 / 28 | R$ 18 / 36 / 45 / 50 |
| 250 / 300 / 350 | R$ 31 / 35 / 40 | R$ 56 / 63 / 72 |
| 400 / 450 / 500 | R$ 46 / 53 / 61 | R$ 83 / 95 / 110 |

- **Sempre grátis:** criar evento, receber confirmações sem teto e ver a *quantidade* de confirmados.
- **Pago (faixa):** ver os *nomes* dos confirmados acima de 20 — revela as primeiras N confirmações
  até a capacidade da faixa (avulsa para 1 evento, ou assinatura para eventos ilimitados na faixa).
- **Addon separado:** lista de presentes (R$ 5 por evento, ou incluída em assinaturas ativas).
- **Sempre grátis:** formulários personalizados (estilo Google Forms) — vinculados a um evento ou avulsos.

## Formulários

Qualquer usuário cria formulários com perguntas tipadas (resposta curta, parágrafo, e-mail,
telefone, número, múltipla escolha, caixas de seleção, lista suspensa, escala linear, data,
hora, sim/não), publica e acompanha um relatório de respostas (agregado por pergunta,
respostas individuais e exportação CSV).

- **De evento:** criado na página do evento (`/dashboard/events/<uuid>/edit#formularios`).
  Aparece dentro do convite público; pelo convite nominal o convidado é identificado e
  responde uma vez só (configurável).
- **Avulso:** criado em `/dashboard/forms`, sem evento. Qualquer pessoa com o link direto
  (`/formulario/<share_token>`) responde.
- Limites: 10 formulários por evento, 20 avulsos por usuário, 50 perguntas por formulário,
  30 opções por pergunta. Escrita anônima passa pelo mesmo rate limit do RSVP.
- **QR code** do link público: `GET /api/v1/forms/<id>/qr.png` (código limpo, ~1024 px) e
  `GET /api/v1/forms/<id>/qr.pdf` (A4 com moldura do Convida e título). Botão "QR code" no construtor.
- API: `GET/POST /api/v1/forms/`, `/api/v1/events/<uuid>/forms/`, `/api/v1/forms/<id>/`
  (`status/`, `duplicate/`, `report/`, `responses/`, `export/`) e rotas públicas
  `/api/v1/public/forms/<share_token>/` e `/api/v1/public/<token>/forms/`.

## Desenvolvimento local

### Com Docker (recomendado)

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
docker compose up --build
```

- API:        http://localhost:8000
- Docs API:   http://localhost:8000/api/docs/
- Frontend:   http://localhost:3000

### Sem Docker

Backend:
```bash
cd backend
python -m venv .venv && source .venv/Scripts/activate   # Windows (Git Bash)
pip install -r requirements-dev.txt                     # ou: pip install -r requirements.txt (só runtime)
python manage.py migrate
python manage.py runserver
```

> As dependências vivem no `pyproject.toml`; o `requirements.txt` / `requirements-dev.txt`
> são espelhos para quem prefere instalar com `pip install -r`.

Frontend:
```bash
cd frontend
npm install
npm run dev
```

## Pagamentos (Stripe — modo teste)

Checkout hospedado do Stripe, com **cartão + Pix**. Cobrança híbrida:
compra avulsa por evento **ou** assinatura mensal por faixa.

Para testar o fluxo real localmente:

1. Em `backend/.env`, defina `STRIPE_SECRET_KEY=sk_test_...`.
2. Crie os planos de assinatura no Stripe (faixas recorrentes):
   ```bash
   cd backend && python manage.py seed_stripe
   ```
3. Encaminhe os webhooks com a Stripe CLI e copie o `whsec_...` para `STRIPE_WEBHOOK_SECRET`:
   ```bash
   stripe listen --forward-to localhost:8000/api/v1/billing/webhook/
   ```

Sem as chaves, os endpoints de checkout respondem `503` e o gating de nomes continua
funcionando normalmente (faixa grátis = 20). A faixa avulsa de um evento pode ser liberada
manualmente pelo Django admin (`EventPurchase` com status `paid`) para testes sem Stripe.

## SEO

Metadados ricos (title/description/keywords/Open Graph), `sitemap.xml`, `robots.txt` e dados
estruturados (JSON-LD) já configurados no frontend. Defina `NEXT_PUBLIC_SITE_URL` com o domínio
de produção para canonical/sitemap corretos.

## Deploy (Coolify)

Usar `docker-compose.coolify.yml`. Variáveis de ambiente definidas no painel do Coolify.
Coolify cuida do proxy reverso e TLS (Traefik).
