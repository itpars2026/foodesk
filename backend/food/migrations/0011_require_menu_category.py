"""Apply only AFTER manual category creation and legacy menu backfill.

PostgreSQL will reject the NOT NULL change if any menu is still uncategorized.
"""
from django.db import migrations, models
import django.db.models.deletion


def validate_categories(apps, schema_editor):
    Menu = apps.get_model('food', 'Menu')
    if Menu.objects.using(schema_editor.connection.alias).filter(category__isnull=True).exists():
        raise RuntimeError('Uncategorized menus remain. Create a category and run assign_legacy_menus before migration 0011.')


class Migration(migrations.Migration):
    dependencies = [('food', '0010_menu_categories')]

    operations = [
        migrations.RunPython(validate_categories, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='menu', name='category',
            field=models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='menus', to='food.menucategory'),
        ),
        migrations.RemoveConstraint(model_name='menu', name='unique_menu_per_date'),
        migrations.AddConstraint(model_name='menu', constraint=models.UniqueConstraint(fields=('date', 'category'), name='unique_menu_per_date_category')),
    ]
