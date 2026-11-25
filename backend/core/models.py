# ruff: noqa: RUF001, RUF012
from django.conf import settings
from django.contrib.auth.models import AbstractUser, Group
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import F, Q
from django.utils import timezone

from typing import ClassVar

from core.base_models import TimeStampedModel
from core.validators import validate_brand_image


class CustomUser(AbstractUser):
    """Project user model; employee fields will live in the Profile model."""

    must_change_password = models.BooleanField(default=False)


class Building(TimeStampedModel):
    number = models.CharField(max_length=5, unique=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ('number',)

    def __str__(self) -> str:
        return self.number


class Department(TimeStampedModel):
    number = models.CharField(max_length=3, unique=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ('number',)

    def __str__(self) -> str:
        return self.number


class Profile(models.Model):
    user = models.OneToOneField(CustomUser, on_delete=models.CASCADE, related_name='profile')
    personnel_number = models.CharField(max_length=32, unique=True)

    building = models.ForeignKey(Building, on_delete=models.PROTECT, null=True, blank=True, related_name='profiles')
    department = models.ForeignKey(Department, on_delete=models.PROTECT, null=True, blank=True, related_name='profiles')

    def save(self, *args, **kwargs) -> None:
        # CustomUser.username is the canonical employee identifier.
        self.personnel_number = self.user.username
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return self.personnel_number


class SiteSettings(TimeStampedModel):
    """Single database-backed configuration for public site branding."""

    site_name = models.CharField(max_length=100, default='فودسک')
    site_name_en = models.CharField(max_length=100, default='Foodesk')
    site_description = models.CharField(
        max_length=255,
        default='سامانه رزرو غذای سازمانی',
    )
    logo = models.ImageField(
        upload_to='branding/logos/',
        blank=True,
        validators=[validate_brand_image],
    )
    favicon = models.ImageField(
        upload_to='branding/favicons/',
        blank=True,
        validators=[validate_brand_image],
    )

    class Meta:
        verbose_name = 'تنظیمات سامانه'
        verbose_name_plural = 'تنظیمات سامانه'
        constraints: ClassVar[list] = [
            models.CheckConstraint(
                condition=models.Q(pk=1),
                name='core_sitesettings_pk_one',
            ),
        ]

    def save(self, *args, **kwargs):
        if self.pk is not None and self.pk != 1:
            raise ValidationError('تنها یک رکورد تنظیمات مجاز است.')

        if self._state.adding and type(self).objects.exists():
            raise ValidationError('رکورد تنظیمات سامانه قبلاً ایجاد شده است.')

        self.pk = 1
        super().save(*args, **kwargs)

    def __str__(self):
        return self.site_name


class Notification(TimeStampedModel):
    class NotificationType(models.TextChoices):
        INFO = 'info', 'اطلاع‌رسانی'
        REMINDER = 'reminder', 'یادآوری'
        WARNING = 'warning', 'هشدار'

    class NotificationSource(models.TextChoices):
        MANUAL = 'manual', 'دستی'
        SYSTEM = 'system', 'سیستمی'

    title = models.CharField(max_length=200)
    message = models.TextField()

    notification_type = models.CharField(max_length=8, choices=NotificationType.choices, default=NotificationType.INFO)

    source = models.CharField(max_length=6, choices=NotificationSource.choices, default=NotificationSource.MANUAL)

    event_key = models.CharField(max_length=150, unique=True, null=True, blank=True)

    is_active = models.BooleanField(default=False)
    send_to_all = models.BooleanField(default=False, verbose_name='ارسال به تمام کاربران')

    starts_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ('-datetime_created',)
        verbose_name = 'اعلان'
        verbose_name_plural = 'اعلان‌ها'
        indexes = [
            models.Index(
                fields=('is_active', 'starts_at'),
            ),
        ]
        constraints = [
            models.CheckConstraint(
                condition=(
                    Q(expires_at__isnull=True)
                    | Q(expires_at__gt=F('starts_at'))
                ),
                name='core_notification_valid_dates',
            ),
        ]

    def __str__(self) -> str:
        return self.title


class NotificationRole(TimeStampedModel):
    notification = models.ForeignKey(Notification, on_delete=models.CASCADE, related_name='target_roles')

    group = models.ForeignKey(Group, on_delete=models.CASCADE, related_name='notification_roles')

    class Meta:
        verbose_name = 'نقش دریافت‌کننده اعلان'
        verbose_name_plural = 'نقش‌های دریافت‌کننده اعلان'
        constraints = [
            models.UniqueConstraint(
                fields=('notification', 'group'),
                name='core_unique_notification_role',
            ),
        ]

    def __str__(self) -> str:
        return f'{self.notification.title} - {self.group.name}'


class NotificationRecipient(TimeStampedModel):
    notification = models.ForeignKey(Notification, on_delete=models.CASCADE, related_name='recipients')

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='notifications')

    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ('-datetime_created',)
        verbose_name = 'دریافت‌کننده اعلان'
        verbose_name_plural = 'دریافت‌کنندگان اعلان'
        constraints = [
            models.UniqueConstraint(
                fields=('notification', 'user'),
                name='core_unique_notification_recipient',
            ),
        ]
        indexes = [
            models.Index(
                fields=('user', 'read_at'),
            ),
        ]

    def __str__(self) -> str:
        return f'{self.user.username} - {self.notification.title}'


class MonthlySubsidyPreference(TimeStampedModel):
    """An employee's explicit subsidy selection for one Jalali month."""

    profile = models.ForeignKey(Profile, on_delete=models.CASCADE, related_name='subsidy_preferences')

    jalali_year = models.PositiveSmallIntegerField()
    jalali_month = models.PositiveSmallIntegerField()

    receive_subsidy = models.BooleanField(default=True)

    class Meta:
        ordering = ('-jalali_year', '-jalali_month')
        constraints = [
            models.UniqueConstraint(
                fields=('profile', 'jalali_year', 'jalali_month'),
                name='core_unique_monthly_subsidy',
            ),
            models.CheckConstraint(
                condition=models.Q(jalali_month__gte=1, jalali_month__lte=12),
                name='core_valid_subsidy_month',
            ),
            models.CheckConstraint(
                condition=models.Q(jalali_year__gte=1),
                name='core_valid_subsidy_year',
            ),
        ]

    def __str__(self):
        return f'{self.profile_id}: {self.jalali_year}/{self.jalali_month:02d}'
