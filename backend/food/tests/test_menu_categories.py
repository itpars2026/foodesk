from django.db import IntegrityError, transaction
from django.test import TestCase

from datetime import date

from food.models import Food, Menu, MenuCategory


class MenuCategoryTests(TestCase):
    def test_categories_are_not_seeded(self):
        self.assertEqual(
            list(MenuCategory.objects.values_list('slug', flat=True)),
            [],
        )

    def test_different_categories_can_share_a_service_date(self):
        food = Food.objects.create(name='Test food', price=1000, container_price=100)
        iranian = MenuCategory.objects.create(name='آزمایشی یک', slug='first', sort_order=1)
        foreign = MenuCategory.objects.create(name='آزمایشی دو', slug='second', sort_order=2)
        service_date = date(2099, 1, 2)
        iranian_menu = Menu.objects.create(date=service_date, food=food, category=iranian)
        foreign_menu = Menu.objects.create(date=service_date, food=food, category=foreign)
        self.assertNotEqual(iranian_menu.pk, foreign_menu.pk)

        with self.assertRaises(IntegrityError), transaction.atomic():
            Menu.objects.create(date=service_date, food=food, category=iranian)

    def test_additional_category_without_schema_change(self):
        category = MenuCategory.objects.create(name='رژیمی', slug='diet', sort_order=3)
        food = Food.objects.create(name='Diet food', price=800, container_price=100)
        menu = Menu.objects.create(date=date(2099, 1, 3), food=food, category=category)
        self.assertEqual(menu.category.slug, 'diet')
