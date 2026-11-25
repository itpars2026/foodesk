"""Authenticated API and persistence tests for monthly subsidy preferences."""
from django.contrib.auth import get_user_model
from django.test import TestCase
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
        cls.other = User.objects.create_user(username='subs-102', password='ExampleStrong123!')
        cls.other_profile, _ = Profile.objects.get_or_create(user=cls.other)

    def setUp(self):
        self.url = reverse('auth-subsidy-preferences')

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

    def test_user_must_change_initial_password(self):
        self.user.must_change_password = True
        self.user.save(update_fields=['must_change_password'])
        self.client.force_login(self.user)
        self.assertEqual(self.client.get(self.url).status_code, 403)
