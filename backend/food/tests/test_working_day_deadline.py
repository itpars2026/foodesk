from rest_framework.exceptions import ValidationError

from django.test import TestCase
from django.utils import timezone

from datetime import date, datetime
from types import SimpleNamespace
from unittest.mock import patch

from food.models import Holiday
from food.services import (
    is_reservation_window_open,
    reservation_deadline,
    validate_reservation_window,
)


class WorkingDayDeadlineTests(TestCase):
    def deadline(self, service_date, cutoff_hour=10):
        return reservation_deadline(
            SimpleNamespace(date=service_date),
            cutoff_hour,
        )

    def local_datetime(self, value):
        return timezone.make_aware(
            value,
            timezone.get_default_timezone(),
        )

    def test_saturday_deadline_is_thursday(self):
        result = self.deadline(date(2026, 11, 28))
        self.assertEqual(result.date(), date(2026, 11, 26))
        self.assertEqual(result.hour, 10)

    def test_thursday_holiday_moves_saturday_deadline_to_wednesday(self):
        Holiday.objects.create(
            date=date(2026, 11, 26),
            description='تعطیلی آزمایشی',
        )

        result = self.deadline(date(2026, 11, 28))
        self.assertEqual(result.date(), date(2026, 11, 25))

    def test_consecutive_holidays(self):
        for day in (25, 26):
            Holiday.objects.create(
                date=date(2026, 11, day),
                description='تعطیلی آزمایشی',
            )

        result = self.deadline(date(2026, 11, 28))
        self.assertEqual(result.date(), date(2026, 11, 24))

    def test_saturday_holiday_moves_sunday_deadline_to_thursday(self):
        Holiday.objects.create(
            date=date(2026, 11, 28),
            description='تعطیلی آزمایشی',
        )

        result = self.deadline(date(2026, 11, 29))
        self.assertEqual(result.date(), date(2026, 11, 26))

    def test_cutoff_boundary(self):
        menu = SimpleNamespace(date=date(2026, 11, 28))

        before = self.local_datetime(datetime(2026, 11, 26, 9, 59))
        exact = self.local_datetime(datetime(2026, 11, 26, 10, 0))

        with patch('food.services._local_now', return_value=before):
            self.assertTrue(is_reservation_window_open(menu, 10))
            validate_reservation_window(menu, 10)

        with patch('food.services._local_now', return_value=exact):
            self.assertFalse(is_reservation_window_open(menu, 10))
            with self.assertRaises(ValidationError):
                validate_reservation_window(menu, 10)

    def test_configurable_cutoff_hour(self):
        result = self.deadline(date(2026, 11, 28), cutoff_hour=9)

        self.assertEqual(result.date(), date(2026, 11, 26))
        self.assertEqual(result.hour, 9)
