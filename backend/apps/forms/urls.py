from django.urls import path

from .views import (
    FormDetailView,
    FormDuplicateView,
    FormExportView,
    FormListCreateView,
    FormReportView,
    FormResponseDeleteView,
    FormResponseListView,
    FormStatusView,
    MyFormListCreateView,
    PublicFormDetailView,
    PublicFormListView,
    PublicFormSubmitView,
    PublicSharedFormSubmitView,
    PublicSharedFormView,
)

app_name = "forms"

urlpatterns = [
    # Dono
    path("forms/", MyFormListCreateView.as_view(), name="my-forms"),
    path("events/<uuid:uuid>/forms/", FormListCreateView.as_view(), name="event-forms"),
    path("forms/<int:pk>/", FormDetailView.as_view(), name="form-detail"),
    path("forms/<int:pk>/status/", FormStatusView.as_view(), name="form-status"),
    path("forms/<int:pk>/duplicate/", FormDuplicateView.as_view(), name="form-duplicate"),
    path("forms/<int:pk>/report/", FormReportView.as_view(), name="form-report"),
    path("forms/<int:pk>/responses/", FormResponseListView.as_view(), name="form-responses"),
    path(
        "forms/<int:pk>/responses/<int:response_id>/",
        FormResponseDeleteView.as_view(),
        name="form-response-delete",
    ),
    path("forms/<int:pk>/export/", FormExportView.as_view(), name="form-export"),
    # Público — link direto do formulário (avulso ou de evento)
    path("public/forms/<uuid:share_token>/", PublicSharedFormView.as_view(), name="public-shared"),
    path(
        "public/forms/<uuid:share_token>/responses/",
        PublicSharedFormSubmitView.as_view(),
        name="public-shared-submit",
    ),
    # Público — via token de convite (genérico ou nominal)
    path("public/<uuid:token>/forms/", PublicFormListView.as_view(), name="public-forms"),
    path(
        "public/<uuid:token>/forms/<uuid:form_uuid>/",
        PublicFormDetailView.as_view(),
        name="public-form",
    ),
    path(
        "public/<uuid:token>/forms/<uuid:form_uuid>/responses/",
        PublicFormSubmitView.as_view(),
        name="public-form-submit",
    ),
]
