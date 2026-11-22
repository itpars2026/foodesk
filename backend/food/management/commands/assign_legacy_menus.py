"""Assign currently uncategorized legacy menus to one existing category."""
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from food.models import Menu, MenuCategory


class Command(BaseCommand):
    help = 'Assign uncategorized legacy menus to an existing category selected by slug.'

    def add_arguments(self, parser):
        parser.add_argument('--category', required=True, help='Slug of an EXISTING MenuCategory')
        parser.add_argument('--apply', action='store_true', help='Actually update records; default is dry-run')

    @transaction.atomic
    def handle(self, *args, **options):
        slug = options['category']
        try:
            category = MenuCategory.objects.get(slug=slug)
        except MenuCategory.DoesNotExist as exc:
            raise CommandError(f'Category {slug!r} does not exist. Add it manually first.') from exc
        uncategorized = Menu.objects.select_for_update().filter(category__isnull=True)
        count = uncategorized.count()
        # Block reassignment when a categorized menu already exists on a matching date.
        conflicts = list(
            uncategorized.filter(date__in=Menu.objects.filter(category=category).values('date'))
            .values_list('date', flat=True)[:5]
        )
        if conflicts:
            raise CommandError(f'Date conflicts with category {slug}: {conflicts}')
        if not options['apply']:
            self.stdout.write(f'DRY RUN: {count} uncategorized menu(s) would be assigned to {slug}. Add --apply to execute.')
            return
        updated = uncategorized.update(category=category)
        self.stdout.write(self.style.SUCCESS(f'Assigned {updated} menu(s) to {slug}.'))
