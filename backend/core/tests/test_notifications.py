from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.db import transaction
from django.test import TestCase
from django.utils import timezone

from datetime import date

from core.models import Notification, NotificationRecipient
from core.notifications import publish_manual_notification
from core.roles import HR_FOOD_ROLE
from food.models import Holiday

User = get_user_model()


class NotificationServiceTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.hr_group, _ = Group.objects.get_or_create(
            name=HR_FOOD_ROLE,
        )

        cls.hr_user = User.objects.create_user(
            username='notify_hr',
            password='test-password',
        )
        cls.hr_user.groups.add(cls.hr_group)

        cls.employee = User.objects.create_user(
            username='notify_employee',
            password='test-password',
        )

        cls.inactive_user = User.objects.create_user(
            username='notify_inactive',
            password='test-password',
            is_active=False,
        )

    def create_notification(self, **kwargs):
        defaults = {
            'title': 'اطلاعیه آزمایشی',
            'message': 'متن اعلان',
            'source': Notification.NotificationSource.MANUAL,
            'is_active': False,
        }
        defaults.update(kwargs)
        return Notification.objects.create(**defaults)

    def test_manual_notification_for_hr_only(self):
        notification = self.create_notification()
        notification.target_roles.create(group=self.hr_group)

        count = publish_manual_notification(notification.pk)

        recipients = set(
            NotificationRecipient.objects.filter(
                notification=notification,
            ).values_list('user_id', flat=True)
        )

        self.assertEqual(count, 1)
        self.assertEqual(recipients, {self.hr_user.pk})

        notification.refresh_from_db()
        self.assertTrue(notification.is_active)

    def test_public_notification_for_active_users(self):
        notification = self.create_notification(
            send_to_all=True,
        )

        count = publish_manual_notification(notification.pk)

        recipients = set(
            NotificationRecipient.objects.filter(
                notification=notification,
            ).values_list('user_id', flat=True)
        )

        self.assertEqual(count, 2)
        self.assertEqual(
            recipients,
            {self.hr_user.pk, self.employee.pk},
        )
        self.assertNotIn(self.inactive_user.pk, recipients)

    def test_republishing_does_not_duplicate_recipients(self):
        notification = self.create_notification(
            send_to_all=True,
        )

        publish_manual_notification(notification.pk)
        publish_manual_notification(notification.pk)

        self.assertEqual(
            NotificationRecipient.objects.filter(
                notification=notification,
            ).count(),
            2,
        )


class HolidayNotificationTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(
            username='holiday_notify_user',
            password='test-password',
        )

    def create_holiday(self):
        with self.captureOnCommitCallbacks(execute=True):
            holiday = Holiday.objects.create(
                date=date(2026, 12, 15),
                description='تعطیلی آزمایشی',
            )
        return holiday  # noqa: RET504

    def get_notification(self, holiday):
        return Notification.objects.get(
            event_key=f'holiday:{holiday.pk}',
        )

    def test_create_holiday_publishes_notification(self):
        holiday = self.create_holiday()
        notification = self.get_notification(holiday)

        self.assertTrue(notification.is_active)
        self.assertTrue(notification.send_to_all)
        self.assertEqual(
            notification.source,
            Notification.NotificationSource.SYSTEM,
        )
        self.assertIn('تعطیلی آزمایشی', notification.message)

        self.assertTrue(
            NotificationRecipient.objects.filter(
                notification=notification,
                user=self.user,
            ).exists()
        )

    def test_update_holiday_reuses_notification(self):
        holiday = self.create_holiday()
        notification = self.get_notification(holiday)

        recipient = NotificationRecipient.objects.get(
            notification=notification,
            user=self.user,
        )
        recipient.read_at = timezone.now()
        recipient.save(update_fields=['read_at'])

        with self.captureOnCommitCallbacks(execute=True):
            holiday.description = 'تعطیلی ویرایش‌شده'
            holiday.save(update_fields=['description'])

        notification.refresh_from_db()
        recipient.refresh_from_db()

        self.assertEqual(
            Notification.objects.filter(
                event_key=f'holiday:{holiday.pk}',
            ).count(),
            1,
        )
        self.assertIn('تعطیلی ویرایش‌شده', notification.message)
        self.assertIsNone(recipient.read_at)

    def test_unchanged_holiday_keeps_read_status(self):
        holiday = self.create_holiday()
        notification = self.get_notification(holiday)

        recipient = NotificationRecipient.objects.get(
            notification=notification,
            user=self.user,
        )
        read_at = timezone.now()
        recipient.read_at = read_at
        recipient.save(update_fields=['read_at'])

        with self.captureOnCommitCallbacks(execute=True):
            holiday.save()

        recipient.refresh_from_db()
        self.assertEqual(recipient.read_at, read_at)

    def test_delete_holiday_deactivates_notification(self):
        holiday = self.create_holiday()
        notification = self.get_notification(holiday)

        with self.captureOnCommitCallbacks(execute=True):
            holiday.delete()

        notification.refresh_from_db()

        self.assertFalse(notification.is_active)
        self.assertTrue(
            NotificationRecipient.objects.filter(
                notification=notification,
                user=self.user,
            ).exists()
        )

    def test_rollback_does_not_publish_notification(self):
        with self.captureOnCommitCallbacks(execute=True), self.assertRaises(RuntimeError), transaction.atomic():
            Holiday.objects.create(
                date=date(2026, 12, 16),
                description='تعطیلی Rollback',
            )
            raise RuntimeError('Rollback test')

        self.assertFalse(
            Notification.objects.filter(
                source=Notification.NotificationSource.SYSTEM,
                message__contains='تعطیلی Rollback',
            ).exists()
        )
