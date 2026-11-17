import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def populate(apps, schema_editor):
    Form = apps.get_model("forms", "Form")
    for form in Form.objects.select_related("event").iterator():
        form.owner_id = form.event.owner_id
        form.share_token = uuid.uuid4()
        form.save(update_fields=["owner", "share_token"])


class Migration(migrations.Migration):
    dependencies = [
        ("events", "0002_eventlink"),
        ("forms", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AlterField(
            model_name="form",
            name="event",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="forms",
                to="events.event",
            ),
        ),
        migrations.AddField(
            model_name="form",
            name="owner",
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="forms",
                to=settings.AUTH_USER_MODEL,
                verbose_name="dono",
            ),
        ),
        migrations.AddField(
            model_name="form",
            name="share_token",
            field=models.UUIDField(default=uuid.uuid4, editable=False, null=True),
        ),
        migrations.RunPython(populate, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="form",
            name="owner",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name="forms",
                to=settings.AUTH_USER_MODEL,
                verbose_name="dono",
            ),
        ),
        migrations.AlterField(
            model_name="form",
            name="share_token",
            field=models.UUIDField(default=uuid.uuid4, editable=False, unique=True),
        ),
    ]
