from django.db import migrations, models
from django.utils import timezone


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0009_alter_building_number"),
    ]

    operations = [
        migrations.AddField(
            model_name="building",
            name="datetime_created",
            field=models.DateTimeField(
                auto_now_add=True,
                default=timezone.now,
                editable=False,
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="building",
            name="datetime_modified",
            field=models.DateTimeField(
                auto_now=True,
                default=timezone.now,
                editable=False,
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="department",
            name="datetime_created",
            field=models.DateTimeField(
                auto_now_add=True,
                default=timezone.now,
                editable=False,
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="department",
            name="datetime_modified",
            field=models.DateTimeField(
                auto_now=True,
                default=timezone.now,
                editable=False,
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="sitesettings",
            name="datetime_created",
            field=models.DateTimeField(
                auto_now_add=True,
                default=timezone.now,
                editable=False,
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name="sitesettings",
            name="datetime_modified",
            field=models.DateTimeField(
                auto_now=True,
                default=timezone.now,
                editable=False,
            ),
            preserve_default=False,
        ),
    ]
