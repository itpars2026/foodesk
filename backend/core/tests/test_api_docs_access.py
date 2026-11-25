from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse


class ApiDocumentationPermissionTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()

        cls.employee = User.objects.create_user(
            username='990001',
            password='test-password',
        )

        cls.staff = User.objects.create_user(
            username='990002',
            password='test-password',
        )
        cls.staff.is_staff = True
        cls.staff.save(update_fields=['is_staff'])

        cls.superadmin = User.objects.create_user(
            username='990003',
            password='test-password',
        )
        cls.superadmin.is_staff = True
        cls.superadmin.is_superuser = True
        cls.superadmin.save(update_fields=['is_staff', 'is_superuser'])

    def check_access(self, expected_status):
        for name in ('api-schema', 'api-docs'):
            with self.subTest(endpoint=name):
                response = self.client.get(reverse(name))
                self.assertEqual(
                    response.status_code,
                    expected_status,
                )

    def test_anonymous_denied(self):
        self.check_access(403)

    def test_employee_denied(self):
        self.client.force_login(self.employee)
        self.check_access(403)

    def test_staff_without_superuser_denied(self):
        self.client.force_login(self.staff)
        self.check_access(403)

    def test_superadmin_allowed(self):
        self.client.force_login(self.superadmin)
        self.check_access(200)
