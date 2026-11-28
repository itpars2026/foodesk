"""Authenticated API and persistence tests for monthly subsidy preferences."""

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase, override_settings
from django.urls import reverse

from datetime import timedelta
from unittest.mock import patch

from core.models import MonthlySubsidyPreference, Profile
from core.subsidy import (
    current_and_next_jalali_month,
    effective_subsidy,
    set_monthly_subsidy,
    subsidy_deadline,
)


class SubsidyPreferenceApiTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.user = User.objects.create_user(username='subs-101', password='ExampleStrong123!')
        cls.profile, _ = Profile.objects.get_or_create(user=cls.user)
        hr_group, _ = Group.objects.get_or_create(name='hrFood')
        cls.user.groups.add(hr_group)
        cls.admin = User.objects.create_superuser(
            username='subs-admin',
            password='ExampleStrong123!',
        )
        Profile.objects.get_or_create(user=cls.admin)
        cls.other = User.objects.create_user(username='subs-102', password='ExampleStrong123!')
        cls.other_profile, _ = Profile.objects.get_or_create(user=cls.other)

    def setUp(self):
        self.url = reverse('auth-subsidy-preferences')

    def test_employee_can_read_and_update_own_subsidy(self):
        self.client.force_login(self.other)

        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)

        year, month = current_and_next_jalali_month()[1]
        with patch('core.subsidy.is_working_day', return_value=True):
            response = self.client.patch(
                self.url,
                {
                    'jalali_year': year,
                    'jalali_month': month,
                    'receive_subsidy': False,
                },
                content_type='application/json',
            )

        self.assertEqual(response.status_code, 200, response.content)
        self.assertFalse(effective_subsidy(self.other_profile, year, month))
        self.assertTrue(effective_subsidy(self.profile, year, month))

    def test_viewer_and_custom_group_can_read_subsidy(self):
        for group_name in ('Viewer', 'FoodOperator'):
            with self.subTest(group=group_name):
                group, _ = Group.objects.get_or_create(name=group_name)
                self.other.groups.clear()
                self.other.groups.add(group)
                self.client.force_login(self.other)

                response = self.client.get(self.url)
                self.assertEqual(response.status_code, 200)

    def test_superadmin_can_access_subsidy(self):
        self.client.force_login(self.admin)
        self.assertEqual(self.client.get(self.url).status_code, 200)

    def test_unauthenticated_cannot_read_or_write(self):
        self.assertIn(self.client.get(self.url).status_code, (401, 403))
        self.assertIn(self.client.patch(self.url, {}, content_type='application/json').status_code, (401, 403))

    def test_get_returns_current_and_next_default_true(self):
        self.client.force_login(self.user)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200, response.content)
        months = response.json()['months']
        self.assertEqual(len(months), 2)
        self.assertEqual(
            [(row['jalali_year'], row['jalali_month']) for row in months],
            list(current_and_next_jalali_month()),
        )
        self.assertTrue(all(row['receive_subsidy'] for row in months))
        self.assertEqual(MonthlySubsidyPreference.objects.count(), 0)

    def test_patch_disable_then_enable_without_duplicate_and_other_user_is_unchanged(self):
        self.client.force_login(self.user)
        year, month = current_and_next_jalali_month()[1]
        for enabled in (False, True):
            response = self.client.patch(
                self.url,
                {'jalali_year': year, 'jalali_month': month, 'receive_subsidy': enabled},
                content_type='application/json',
            )
            self.assertEqual(response.status_code, 200, response.content)
            self.assertEqual(response.json()['receive_subsidy'], enabled)
            self.assertEqual(effective_subsidy(self.profile, year, month), enabled)
        self.assertEqual(MonthlySubsidyPreference.objects.filter(profile=self.profile).count(), 1)
        self.assertTrue(effective_subsidy(self.other_profile, year, month))

    def test_patch_rejects_invalid_input(self):
        self.client.force_login(self.user)
        year, month = current_and_next_jalali_month()[1]
        for payload in (
            {'jalali_year': year, 'jalali_month': 13, 'receive_subsidy': False},
            {'jalali_year': 0, 'jalali_month': month, 'receive_subsidy': False},
            {'jalali_year': year, 'jalali_month': month},
        ):
            with self.subTest(payload=payload):
                response = self.client.patch(self.url, payload, content_type='application/json')
                self.assertEqual(response.status_code, 400, response.content)
        self.assertFalse(MonthlySubsidyPreference.objects.exists())

    def test_patch_rejects_month_outside_current_and_next(self):
        self.client.force_login(self.user)
        year, month = current_and_next_jalali_month()[1]
        after_next = (year + 1, 1) if month == 12 else (year, month + 1)
        response = self.client.patch(
            self.url,
            {'jalali_year': after_next[0], 'jalali_month': after_next[1], 'receive_subsidy': False},
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 400, response.content)
        self.assertFalse(MonthlySubsidyPreference.objects.exists())

    def test_service_closes_at_exact_cutoff(self):
        year, month = current_and_next_jalali_month()[1]
        deadline = subsidy_deadline(year, month)
        before = deadline - timedelta(seconds=1)
        with patch('core.subsidy.current_and_next_jalali_month', return_value=((year, month), (year, month))):
            set_monthly_subsidy(self.profile, year, month, False, now=before)
            self.assertFalse(effective_subsidy(self.profile, year, month))
            from django.core.exceptions import ValidationError

            with self.assertRaises(ValidationError):
                set_monthly_subsidy(self.profile, year, month, True, now=deadline)
        self.assertFalse(effective_subsidy(self.profile, year, month))

    @override_settings(MONTHLY_SUBSIDY_CUTOFF_DAY=20)
    def test_deadline_is_day_20_of_same_jalali_month(self):
        import jdatetime

        with patch('core.subsidy.is_working_day', return_value=True):
            deadline = subsidy_deadline(1405, 9)

        expected = jdatetime.date(1405, 9, 20).togregorian()
        self.assertEqual(deadline.date(), expected)
        self.assertEqual((deadline.hour, deadline.minute), (10, 0))

    @override_settings(MONTHLY_SUBSIDY_CUTOFF_DAY=15)
    def test_deadline_respects_configured_day(self):
        import jdatetime

        with patch('core.subsidy.is_working_day', return_value=True):
            deadline = subsidy_deadline(1405, 9)

        self.assertEqual(
            deadline.date(),
            jdatetime.date(1405, 9, 15).togregorian(),
        )

    @override_settings(MONTHLY_SUBSIDY_CUTOFF_DAY=20)
    def test_nonworking_cutoff_moves_to_previous_working_day(self):
        import jdatetime

        cutoff = jdatetime.date(1405, 9, 20).togregorian()
        previous_day = cutoff - timedelta(days=1)

        with patch(
            'core.subsidy.is_working_day',
            side_effect=lambda day: day != cutoff,
        ):
            deadline = subsidy_deadline(1405, 9)

        self.assertEqual(deadline.date(), previous_day)

    @override_settings(MONTHLY_SUBSIDY_CUTOFF_DAY=20)
    def test_friday_cutoff_moves_to_thursday(self):
        import jdatetime

        # Find a Jalali month whose 20th day is Friday.
        matching = None
        for year in (1405, 1406, 1407):
            for month in range(1, 13):
                day = jdatetime.date(year, month, 20).togregorian()
                if day.weekday() == 4:
                    matching = (year, month, day)
                    break
            if matching:
                break

        self.assertIsNotNone(matching)
        year, month, friday = matching

        deadline = subsidy_deadline(year, month)

        self.assertEqual(
            deadline.date(),
            friday - timedelta(days=1),
        )

    @override_settings(MONTHLY_SUBSIDY_CUTOFF_DAY=20)
    def test_official_holiday_moves_cutoff_back(self):
        import jdatetime

        from food.models import Holiday

        # Select a month whose 20th is a working weekday.
        year = 1405
        month = next(m for m in range(1, 13) if jdatetime.date(year, m, 20).togregorian().weekday() != 4)

        cutoff = jdatetime.date(year, month, 20).togregorian()

        Holiday.objects.create(
            date=cutoff,
            description='Test holiday',
        )

        deadline = subsidy_deadline(year, month)
        expected = cutoff - timedelta(days=1)

        while expected.weekday() == 4:
            expected -= timedelta(days=1)

        self.assertEqual(deadline.date(), expected)

    def test_user_must_change_initial_password(self):
        self.user.must_change_password = True
        self.user.save(update_fields=['must_change_password'])
        self.client.force_login(self.user)
        self.assertEqual(self.client.get(self.url).status_code, 403)
