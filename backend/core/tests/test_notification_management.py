from rest_framework.exceptions import PermissionDenied, ValidationError

from django.contrib.auth.models import Group
from django.test import TestCase

from core.models import CustomUser, Notification, NotificationRecipient
from core.notification_management import create_manual_notification
from core.roles import EMPLOYEE_ROLE, HR_FOOD_ROLE


class NotificationManagementTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.hr_group, _ = Group.objects.get_or_create(name=HR_FOOD_ROLE)
        cls.employee_group, _ = Group.objects.get_or_create(name=EMPLOYEE_ROLE)

        cls.admin = CustomUser.objects.create_superuser(
            username='notification_admin',
            password='test-password',
        )
        cls.hr = CustomUser.objects.create_user(
            username='notification_hr',
            password='test-password',
        )
        cls.hr.groups.add(cls.hr_group)

        cls.employee = CustomUser.objects.create_user(
            username='notification_employee',
            password='test-password',
        )
        cls.employee.groups.add(cls.employee_group)

    def payload(self, **overrides):
        data = {
            'title': 'اطلاعیه آزمایشی',
            'message': 'متن اعلان',
            'notification_type': 'info',
            'send_to_all': True,
        }
        data.update(overrides)
        return data

    def test_superadmin_can_send_to_all(self):
        result = create_manual_notification(
            self.admin,
            self.payload(),
        )

        self.assertEqual(result['recipient_count'], 3)
        self.assertEqual(Notification.objects.count(), 1)
        self.assertEqual(NotificationRecipient.objects.count(), 3)

    def test_superadmin_can_target_a_role(self):
        result = create_manual_notification(
            self.admin,
            self.payload(
                send_to_all=False,
                role_names=[EMPLOYEE_ROLE],
            ),
        )

        self.assertEqual(result['recipient_count'], 1)
        self.assertTrue(NotificationRecipient.objects.filter(user=self.employee).exists())

    def test_hr_can_send_to_all(self):
        result = create_manual_notification(
            self.hr,
            self.payload(),
        )
        self.assertEqual(result['recipient_count'], 3)

    def test_hr_cannot_target_roles(self):
        with self.assertRaises(PermissionDenied):
            create_manual_notification(
                self.hr,
                self.payload(
                    send_to_all=False,
                    role_names=[EMPLOYEE_ROLE],
                ),
            )
        self.assertEqual(Notification.objects.count(), 0)

    def test_hr_cannot_send_to_selected_roles_even_with_all_true(self):
        with self.assertRaises(PermissionDenied):
            create_manual_notification(
                self.hr,
                self.payload(role_names=[EMPLOYEE_ROLE]),
            )

    def test_employee_cannot_create_notifications(self):
        with self.assertRaises(PermissionDenied):
            create_manual_notification(
                self.employee,
                self.payload(),
            )

    def test_reject_unknown_role(self):
        with self.assertRaises(ValidationError):
            create_manual_notification(
                self.admin,
                self.payload(
                    send_to_all=False,
                    role_names=['unknown-role'],
                ),
            )
        self.assertEqual(Notification.objects.count(), 0)
