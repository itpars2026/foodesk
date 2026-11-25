from django.db import transaction
from django.utils import timezone

from datetime import datetime, time, timedelta

import jdatetime

from core.models import MonthlySubsidyPreference
from core.validators import validate_subsidy_change
from food.services import is_working_day


def jalali_month_bounds(year: int, month: int):
    if not 1 <= month <= 12 or year < 1:
        raise ValueError('Invalid Jalali year or month')
    first = jdatetime.date(year, month, 1).togregorian()
    next_year, next_month = (year + 1, 1) if month == 12 else (year, month + 1)
    next_first = jdatetime.date(next_year, next_month, 1).togregorian()
    return first, next_first - timedelta(days=1)


def subsidy_deadline(year: int, month: int, cutoff_hour: int = 10):
    if not 0 <= cutoff_hour <= 23:
        raise ValueError('Invalid cutoff hour')
    _, month_end = jalali_month_bounds(year, month)
    deadline_day = month_end - timedelta(days=1)

    while not is_working_day(deadline_day):
        deadline_day -= timedelta(days=1)

    return timezone.make_aware(
        datetime.combine(deadline_day, time(hour=cutoff_hour)),
        timezone.get_default_timezone(),
    )


def current_and_next_jalali_month(now=None):
    now = timezone.localtime(now or timezone.now(), timezone.get_default_timezone())
    today = jdatetime.date.fromgregorian(date=now.date())
    current = (today.year, today.month)

    following = (today.year + 1, 1) if today.month == 12 else (today.year, today.month + 1)
    return current, following


def can_change_subsidy(year: int, month: int, *, now=None, cutoff_hour=10):
    now = timezone.localtime(now or timezone.now(), timezone.get_default_timezone())
    return (year, month) in current_and_next_jalali_month(now) and now < subsidy_deadline(year, month, cutoff_hour)


def effective_subsidy(profile, year: int, month: int):
    """Missing preference means subsidy is enabled; no default rows are created."""
    value = (
        MonthlySubsidyPreference.objects.filter(profile=profile, jalali_year=year, jalali_month=month)
        .values_list('receive_subsidy', flat=True)
        .first()
    )
    return True if value is None else value


@transaction.atomic
def set_monthly_subsidy(profile, year: int, month: int, receive_subsidy: bool, *, now=None):
    validate_subsidy_change(year, month, receive_subsidy, now=now)
    preference, _ = MonthlySubsidyPreference.objects.update_or_create(
        profile=profile,
        jalali_year=year,
        jalali_month=month,
        defaults={'receive_subsidy': receive_subsidy},
    )
    return preference
