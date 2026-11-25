from rest_framework.test import APIClient

from django.contrib.auth.models import Group
from django.test import TestCase

from core.models import CustomUser, Notification, NotificationRecipient
from core.roles import EMPLOYEE_ROLE, HR_FOOD_ROLE


class NotificationManagementAPITests(TestCase):
    @classmethod
    def setUpTestData(cls):
        hr_group, _ = Group.objects.get_or_create(name=HR_FOOD_ROLE)
        employee_group, _ = Group.objects.get_or_create(name=EMPLOYEE_ROLE)

        cls.admin = CustomUser.objects.create_superuser(
            username='api_notification_admin',
            password='test-password',
        )
        cls.hr = CustomUser.objects.create_user(
            username='api_notification_hr',
            password='test-password',
            must_change_password=False,
        )
        cls.hr.groups.add(hr_group)

        cls.employee = CustomUser.objects.create_user(
            username='api_notification_employee',
            password='test-password',
            must_change_password=False,
        )
        cls.employee.groups.add(employee_group)

    def setUp(self):
        self.client = APIClient()
        self.url = '/api/v1/notifications/manage'

    def payload(self, **changes):
        data = {
            'title': 'اعلان آزمایشی',
            'message': 'متن تست اعلان',
            'notification_type': 'info',
            'send_to_all': True,
        }
        data.update(changes)
        return data

    def test_superadmin_can_publish_for_all(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.post(self.url, self.payload(), format='json')

        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['recipient_count'], 3)
        self.assertEqual(Notification.objects.count(), 1)
        self.assertEqual(NotificationRecipient.objects.count(), 3)

    def test_superadmin_can_target_employee_role(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.post(
            self.url,
            self.payload(
                send_to_all=False,
                role_names=[EMPLOYEE_ROLE],
            ),
            format='json',
        )

        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['recipient_count'], 1)
        self.assertEqual(
            NotificationRecipient.objects.get().user_id,
            self.employee.pk,
        )

    def test_hr_can_publish_for_all(self):
        self.client.force_authenticate(user=self.hr)

        response = self.client.post(self.url, self.payload(), format='json')

        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['recipient_count'], 3)

    def test_hr_cannot_target_roles(self):
        self.client.force_authenticate(user=self.hr)

        response = self.client.post(
            self.url,
            self.payload(
                send_to_all=False,
                role_names=[EMPLOYEE_ROLE],
            ),
            format='json',
        )

        self.assertEqual(response.status_code, 403, response.data)
        self.assertEqual(Notification.objects.count(), 0)

    def test_hr_cannot_smuggle_roles(self):
        self.client.force_authenticate(user=self.hr)

        response = self.client.post(
            self.url,
            self.payload(role_names=[EMPLOYEE_ROLE]),
            format='json',
        )

        self.assertEqual(response.status_code, 403, response.data)
        self.assertEqual(Notification.objects.count(), 0)

    def test_employee_cannot_publish(self):
        self.client.force_authenticate(user=self.employee)

        response = self.client.post(self.url, self.payload(), format='json')

        self.assertEqual(response.status_code, 403, response.data)
        self.assertEqual(Notification.objects.count(), 0)

    def test_anonymous_user_cannot_publish(self):
        response = self.client.post(self.url, self.payload(), format='json')

        self.assertIn(response.status_code, (401, 403))
        self.assertEqual(Notification.objects.count(), 0)

    def test_superadmin_can_list_target_roles(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.get(self.url + '/roles')

        self.assertEqual(response.status_code, 200, response.data)
        names = {item['name'] for item in response.data}
        self.assertIn(EMPLOYEE_ROLE, names)
        self.assertIn(HR_FOOD_ROLE, names)

    def test_hr_cannot_list_target_roles(self):
        self.client.force_authenticate(user=self.hr)

        response = self.client.get(self.url + '/roles')

        self.assertEqual(response.status_code, 403, response.data)

    def test_cannot_override_system_fields(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.post(
            self.url,
            self.payload(source='system'),
            format='json',
        )

        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(Notification.objects.count(), 0)
