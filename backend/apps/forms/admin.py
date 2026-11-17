from django.contrib import admin

from .models import Answer, Form, FormResponse, Question


class QuestionInline(admin.TabularInline):
    model = Question
    extra = 0
    fields = ["order", "type", "label", "required", "config"]


@admin.register(Form)
class FormAdmin(admin.ModelAdmin):
    list_display = ["title", "owner", "event", "status", "closes_at", "created_at"]
    list_filter = ["status", "event"]
    search_fields = ["title", "event__title", "owner__email"]
    readonly_fields = ["uuid", "share_token", "created_at", "updated_at"]
    inlines = [QuestionInline]


class AnswerInline(admin.TabularInline):
    model = Answer
    extra = 0
    readonly_fields = ["question", "value"]
    can_delete = False


@admin.register(FormResponse)
class FormResponseAdmin(admin.ModelAdmin):
    list_display = ["__str__", "form", "respondent_name", "invitation", "created_at"]
    list_filter = ["form"]
    search_fields = ["respondent_name", "form__title", "invitation__guest_name"]
    readonly_fields = ["created_at"]
    inlines = [AnswerInline]
