from django.contrib.auth.models import Group, Permission
from django.test import Client, TestCase
from django.urls import reverse

import json

from core.models import Building, Department
from core.serializers import SessionUserSerializer
from core.services import create_employee


class AuthenticationAPITests(TestCase):
    @classmethod
    def setUpTestData(cls):
        Building.objects.create(number='07', is_active=True)
        Department.objects.create(number='003', is_active=True)

    def create_test_employee(self):
        return create_employee(
            national_id='0012345678',
            personnel_number='001234',
            building_number='07',
            department_number='003',
        )

    def test_session_and_login_include_effective_permissions(self):
        employee = self.create_test_employee()

        group = Group.objects.create(name='SessionReportOperator')
        group.permissions.add(
            Permission.objects.get(
                content_type__app_label='food',
                codename='view_management_reports',
            )
        )
        employee.groups.add(group)

        self.client.force_login(employee)

        session_response = self.client.get(reverse('auth-session'))

        self.assertEqual(session_response.status_code, 200)
        session_data = session_response.json()

        self.assertIn('permissions', session_data)
        self.assertIn('SessionReportOperator', session_data['roles'])
        self.assertIn(
            'food.view_management_reports',
            session_data['permissions'],
        )
        self.assertEqual(
            session_data['permissions'],
            sorted(set(session_data['permissions'])),
        )

        self.client.logout()

        login_response = self.client.post(
            reverse('auth-login'),
            data=json.dumps(
                {
                    'username': '001234',
                    'password': '0012345678',
                }
            ),
            content_type='application/json',
        )

        self.assertEqual(login_response.status_code, 200)
        login_data = login_response.json()

        self.assertIn(
            'food.view_management_reports',
            login_data['permissions'],
        )
        self.assertIn('SessionReportOperator', login_data['roles'])
        self.assertEqual(
            login_data['permissions'],
            session_data['permissions'],
        )

    def test_inactive_user_serializer_has_no_permissions(self):
        employee = self.create_test_employee()
        employee.is_active = False
        employee.save(update_fields=['is_active'])

        data = SessionUserSerializer(employee).data

        self.assertEqual(data['permissions'], [])
        self.assertFalse(data['is_active'])

    def test_login_requires_csrf_and_returns_password_change_state(self):
        self.create_test_employee()

        csrf_client = Client(enforce_csrf_checks=True)
        payload = {'username': '001234', 'password': '0012345678'}

        rejected_response = csrf_client.post(
            reverse('auth-login'),
            data=json.dumps(payload),
            content_type='application/json',
        )
        self.assertEqual(rejected_response.status_code, 403)

        csrf_response = csrf_client.get(reverse('auth-csrf'))
        login_response = csrf_client.post(
            reverse('auth-login'),
            data=json.dumps(payload),
            content_type='application/json',
            HTTP_X_CSRFTOKEN=csrf_response.json()['csrf_token'],
        )

        self.assertEqual(login_response.status_code, 200)
        self.assertTrue(login_response.json()['must_change_password'])

    def test_initial_password_blocks_business_api_but_not_session(self):
        employee = self.create_test_employee()
        self.client.force_login(employee)

        session_response = self.client.get(reverse('auth-session'))
        restricted_response = self.client.get(reverse('employee-list'))

        self.assertEqual(session_response.status_code, 200)
        self.assertEqual(restricted_response.status_code, 403)
        self.assertIn(
            'change your initial password',
            restricted_response.json()['detail'],
        )

    def test_employee_can_change_initial_password_and_keep_session(self):
        employee = self.create_test_employee()
        self.client.force_login(employee)

        response = self.client.post(
            reverse('auth-change-password'),
            {
                'old_password': '0012345678',
                'new_password': 'Safer-Meal-Password-2026',
                'new_password_confirm': 'Safer-Meal-Password-2026',
            },
        )

        self.assertEqual(response.status_code, 200)

        employee.refresh_from_db()
        self.assertFalse(employee.must_change_password)
        self.assertTrue(employee.check_password('Safer-Meal-Password-2026'))
        self.assertFalse(employee.check_password('0012345678'))
        self.assertEqual(
            self.client.get(reverse('auth-session')).status_code,
            200,
        )

    def test_new_password_cannot_equal_personnel_number(self):
        employee = self.create_test_employee()
        self.client.force_login(employee)

        response = self.client.post(
            reverse('auth-change-password'),
            {
                'old_password': '0012345678',
                'new_password': '001234',
                'new_password_confirm': '001234',
            },
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn('new_password', response.json())

    def test_new_password_cannot_equal_current_initial_password(self):
        employee = self.create_test_employee()
        self.client.force_login(employee)

        response = self.client.post(
            reverse('auth-change-password'),
            {
                'old_password': '0012345678',
                'new_password': '0012345678',
                'new_password_confirm': '0012345678',
            },
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn('new_password', response.json())

        employee.refresh_from_db()
        self.assertTrue(employee.must_change_password)
        self.assertTrue(employee.check_password('0012345678'))

    def test_logout_ends_session(self):
        employee = self.create_test_employee()
        self.client.force_login(employee)

        response = self.client.post(reverse('auth-logout'))
        self.assertEqual(response.status_code, 204)

        session_response = self.client.get(reverse('auth-session'))
        self.assertEqual(session_response.status_code, 200)
        self.assertEqual(
            session_response.json(),
            {'authenticated': False},
        )
