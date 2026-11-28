from django.test import TestCase, override_settings

from datetime import timedelta

import jdatetime

from core.subsidy import can_change_subsidy, jalali_month_bounds, subsidy_deadline
from food.models import Holiday


class SubsidyDeadlineTests(TestCase):
    def test_month_bounds_cover_leap_and_year_transition(self):
        for year, month in ((1404, 12), (1405, 1), (1405, 6), (1405, 7)):
            first, last = jalali_month_bounds(year, month)
            self.assertEqual(jdatetime.date.fromgregorian(date=first).day, 1)
            self.assertEqual(jdatetime.date.fromgregorian(date=last).month, month)
            self.assertNotEqual(jdatetime.date.fromgregorian(date=last + timedelta(days=1)).month, month)

    @override_settings(MONTHLY_SUBSIDY_CUTOFF_DAY=20)
    def test_deadline_is_day_20_or_previous_working_day(self):
        year, month = 1405, 9
        deadline = subsidy_deadline(year, month)
        expected = jdatetime.date(year, month, 20).togregorian()
        while expected.weekday() == 4:
            expected -= timedelta(days=1)
        self.assertEqual(deadline.date(), expected)
        self.assertEqual(deadline.hour, 10)

    def test_registered_holiday_moves_deadline_back(self):
        year, month = 1405, 9
        prior = subsidy_deadline(year, month)
        Holiday.objects.create(date=prior.date(), description='آزمون تعطیلی')
        changed = subsidy_deadline(year, month)
        self.assertLess(changed, prior)

    def test_cutoff_exactly_at_ten_is_closed(self):
        year, month = 1405, 9
        deadline = subsidy_deadline(year, month)
        self.assertTrue(can_change_subsidy(year, month, now=deadline - timedelta(minutes=1)))
        self.assertFalse(can_change_subsidy(year, month, now=deadline))
