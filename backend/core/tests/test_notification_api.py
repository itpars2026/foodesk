from rest_framework.test import APIClient

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from datetime import timedelta

from core.models import Notification, NotificationRecipient

User = get_user_model()
BASE_URL = '/api/v1/notifications'


class NotificationAPITests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(
            username='notification_api_user',
            password='test-password',
        )
        cls.other_user = User.objects.create_user(
            username='notification_api_other',
            password='test-password',
        )

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def create_notification(self, **kwargs):
        values = {
            'title': 'اعلان آزمایشی',
            'message': 'متن اعلان',
            'is_active': True,
            'send_to_all': True,
            'starts_at': timezone.now() - timedelta(hours=1),
        }
        values.update(kwargs)
        return Notification.objects.create(**values)

    def assign(self, notification, user=None):
        return NotificationRecipient.objects.create(
            notification=notification,
            user=user or self.user,
        )

    def test_list_only_visible_notifications(self):
        own = self.create_notification()
        self.assign(own)

        other = self.create_notification()
        self.assign(other, self.other_user)

        inactive = self.create_notification(is_active=False)
        self.assign(inactive)

        future = self.create_notification(
            starts_at=timezone.now() + timedelta(days=1),
        )
        self.assign(future)

        expired = self.create_notification(
            expires_at=timezone.now() - timedelta(minutes=1),
        )
        self.assign(expired)

        response = self.client.get(BASE_URL)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['id'], own.pk)

    def test_unread_count(self):
        self.assign(self.create_notification())
        self.assign(self.create_notification())

        response = self.client.get(f'{BASE_URL}/unread-count')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['unread_count'], 2)

    def test_mark_read_is_idempotent(self):
        notification = self.create_notification()
        recipient = self.assign(notification)
        url = f'{BASE_URL}/{notification.pk}/read'

        first = self.client.post(url)
        recipient.refresh_from_db()
        first_read_at = recipient.read_at

        second = self.client.post(url)
        recipient.refresh_from_db()

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertIsNotNone(first_read_at)
        self.assertEqual(recipient.read_at, first_read_at)
        self.assertTrue(second.data['is_read'])

    def test_cannot_read_another_users_notification(self):
        notification = self.create_notification()
        recipient = self.assign(notification, self.other_user)

        response = self.client.post(f'{BASE_URL}/{notification.pk}/read')

        recipient.refresh_from_db()

        self.assertEqual(response.status_code, 404)
        self.assertIsNone(recipient.read_at)

    def test_mark_all_read(self):
        self.assign(self.create_notification())
        self.assign(self.create_notification())

        response = self.client.post(f'{BASE_URL}/read-all')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['marked_read'], 2)
        self.assertEqual(response.data['unread_count'], 0)

    def test_anonymous_user_denied(self):
        self.client.force_authenticate(user=None)

        response = self.client.get(BASE_URL)

        self.assertIn(response.status_code, (401, 403))

    def test_initial_password_change_required(self):
        self.user.must_change_password = True
        self.user.save(update_fields=['must_change_password'])

        response = self.client.get(BASE_URL)

        self.assertEqual(response.status_code, 403)
