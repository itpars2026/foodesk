"""Introduce categories without creating records or touching legacy menu assignments.

Deploy this migration first, create categories manually, then run assign_legacy_menus
before applying 0011. Do not use an unqualified migrate on production yet.
"""
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [('food', '0009_alter_reservationitem_building_number_snapshot')]

    operations = [
        migrations.CreateModel(
            name='MenuCategory',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('datetime_created', models.DateTimeField(auto_now_add=True)),
                ('datetime_modified', models.DateTimeField(auto_now=True)),
                ('name', models.CharField(max_length=100)),
                ('slug', models.SlugField(max_length=100, unique=True)),
                ('sort_order', models.PositiveIntegerField(default=0)),
                ('is_active', models.BooleanField(default=True)),
            ],
            options={'ordering': ('sort_order', 'id'), 'verbose_name_plural': 'Menu categories'},
        ),
        migrations.AddField(
            model_name='menu',
            name='category',
            field=models.ForeignKey(null=True, blank=True, on_delete=django.db.models.deletion.PROTECT, related_name='menus', to='food.menucategory'),
        ),
    ]
