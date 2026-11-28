import json

from django.contrib.auth.models import Group, Permission
from django.test import TestCase
from django.urls import reverse

from core.models import CustomUser
from core.roles import EMPLOYEE_ROLE, HR_FOOD_ROLE, VIEWER_ROLE


class GroupManagementAPITests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = CustomUser.objects.create_superuser(
            username='groups-admin',
            password='SecureAdminPassword2026!',
        )

        cls.regular_user = CustomUser.objects.create_user(
            username='groups-employee',
            password='SecureEmployeePassword2026!',
            must_change_password=False,
        )

        cls.permission = Permission.objects.get(
            content_type__app_label='food',
            codename='add_food',
        )

    def login_admin(self):
        self.client.force_login(self.admin)

    def test_only_superadmin_can_list_groups(self):
        url = reverse('group-list')

        self.client.force_login(self.regular_user)
        self.assertEqual(self.client.get(url).status_code, 403)

        self.login_admin()
        self.assertEqual(self.client.get(url).status_code, 200)

    def test_superadmin_can_create_group_with_permissions(self):
        self.login_admin()

        response = self.client.post(
            reverse('group-list'),
            data=json.dumps({
                'name': 'FoodManager',
                'permissions': [self.permission.id],
            }),
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 201, response.content)

        group = Group.objects.get(name='FoodManager')
        self.assertTrue(
            group.permissions.filter(pk=self.permission.pk).exists()
        )

    def test_regular_user_cannot_create_group(self):
        self.client.force_login(self.regular_user)

        response = self.client.post(
            reverse('group-list'),
            data=json.dumps({
                'name': 'UnauthorizedGroup',
                'permissions': [self.permission.id],
            }),
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 403)
        self.assertFalse(
            Group.objects.filter(name='UnauthorizedGroup').exists()
        )

    def test_system_groups_cannot_be_deleted(self):
        self.login_admin()

        for name in (HR_FOOD_ROLE, EMPLOYEE_ROLE, VIEWER_ROLE):
            group = Group.objects.get(name=name)

            response = self.client.delete(
                reverse('group-detail', kwargs={'pk': group.pk})
            )

            self.assertEqual(response.status_code, 403)
            self.assertTrue(Group.objects.filter(pk=group.pk).exists())

    def test_superadmin_can_delete_custom_group(self):
        group = Group.objects.create(name='TemporaryFoodGroup')
        self.login_admin()

        response = self.client.delete(
            reverse('group-detail', kwargs={'pk': group.pk})
        )

        self.assertEqual(response.status_code, 204)
        self.assertFalse(Group.objects.filter(pk=group.pk).exists())

    def test_group_permission_is_effective_for_member(self):
        group = Group.objects.create(name='FoodManager')
        group.permissions.add(self.permission)
        self.regular_user.groups.add(group)

        self.assertTrue(
            self.regular_user.has_perm('food.add_food')
        )

    def test_system_group_cannot_be_renamed(self):
        self.login_admin()
        group = Group.objects.get(name=HR_FOOD_ROLE)

        response = self.client.patch(
            reverse('group-detail', kwargs={'pk': group.pk}),
            json.dumps({'name': 'RenamedHR'}),
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 403)
        group.refresh_from_db()
        self.assertEqual(group.name, HR_FOOD_ROLE)

    def test_system_group_permissions_cannot_be_modified(self):
        self.login_admin()
        group = Group.objects.get(name=HR_FOOD_ROLE)
        original = set(group.permissions.values_list('pk', flat=True))

        response = self.client.patch(
            reverse('group-detail', kwargs={'pk': group.pk}),
            json.dumps({'permissions': []}),
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 403)
        self.assertEqual(
            set(group.permissions.values_list('pk', flat=True)),
            original,
        )

    def test_reserved_group_name_is_rejected(self):
        self.login_admin()

        response = self.client.post(
            reverse('group-list'),
            json.dumps({'name': 'hrfood'}),
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertFalse(Group.objects.filter(name='hrfood').exists())

    def test_duplicate_group_name_is_case_insensitive(self):
        Group.objects.create(name='FoodManager')
        self.login_admin()

        response = self.client.post(
            reverse('group-list'),
            json.dumps({'name': 'foodmanager'}),
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 400)

    def test_superadmin_can_update_custom_group_permissions(self):
        group = Group.objects.create(name='FoodManager')
        self.login_admin()

        response = self.client.patch(
            reverse('group-detail', kwargs={'pk': group.pk}),
            json.dumps({'permissions': [self.permission.pk]}),
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 200, response.content)
        self.assertTrue(group.permissions.filter(pk=self.permission.pk).exists())

    def test_staff_user_cannot_manage_groups(self):
        staff = CustomUser.objects.create_user(
            username='groups-staff',
            password='SecureStaffPassword2026!',
            is_staff=True,
            must_change_password=False,
        )

        self.client.force_login(staff)
        self.assertEqual(
            self.client.get(reverse('group-list')).status_code,
            403,
        )

    def test_inactive_superadmin_cannot_manage_groups(self):
        self.admin.is_active = False
        self.admin.save(update_fields=('is_active',))

        self.client.force_login(self.admin)

        response = self.client.get(reverse('group-list'))
        self.assertIn(response.status_code, (401, 403))


    def test_sensitive_permission_cannot_be_assigned(self):
        sensitive_permission = Permission.objects.get(
            content_type__app_label='auth',
            codename='change_group',
        )

        self.login_admin()

        response = self.client.post(
            reverse('group-list'),
            data=json.dumps({
                'name': 'UnsafeGroup',
                'permissions': [sensitive_permission.pk],
            }),
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 400, response.content)
        self.assertFalse(
            Group.objects.filter(name='UnsafeGroup').exists()
        )


    def test_superadmin_can_list_assignable_permissions(self):
        self.login_admin()

        response = self.client.get(reverse('permission-list'))

        self.assertEqual(response.status_code, 200, response.content)

        data = response.json()
        permission_ids = {item['id'] for item in data}

        self.assertIn(self.permission.pk, permission_ids)

        sensitive = Permission.objects.get(
            content_type__app_label='auth',
            codename='change_group',
        )

        self.assertNotIn(sensitive.pk, permission_ids)

        item = next(
            item for item in data
            if item['id'] == self.permission.pk
        )

        self.assertEqual(item['app_label'], 'food')
        self.assertEqual(item['codename'], 'add_food')
        self.assertIn('name', item)

    def test_regular_user_cannot_list_permissions(self):
        self.client.force_login(self.regular_user)

        response = self.client.get(reverse('permission-list'))

        self.assertEqual(response.status_code, 403)


    def test_superadmin_can_add_group_member(self):
        group = Group.objects.create(name='FoodManager')
        self.login_admin()

        response = self.client.post(
            reverse('group-members', kwargs={'pk': group.pk}),
            data=json.dumps({'user_id': self.regular_user.pk}),
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 200, response.content)
        self.assertTrue(
            group.user_set.filter(pk=self.regular_user.pk).exists()
        )

    def test_adding_existing_member_is_idempotent(self):
        group = Group.objects.create(name='FoodManager')
        self.regular_user.groups.add(group)
        self.login_admin()

        response = self.client.post(
            reverse('group-members', kwargs={'pk': group.pk}),
            data=json.dumps({'user_id': self.regular_user.pk}),
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(
            group.user_set.filter(pk=self.regular_user.pk).count(),
            1,
        )

    def test_superadmin_can_remove_group_member(self):
        group = Group.objects.create(name='FoodManager')
        self.regular_user.groups.add(group)
        self.login_admin()

        response = self.client.delete(
            reverse(
                'group-member-detail',
                kwargs={
                    'pk': group.pk,
                    'user_id': self.regular_user.pk,
                },
            )
        )

        self.assertEqual(response.status_code, 204, response.content)
        self.assertFalse(
            group.user_set.filter(pk=self.regular_user.pk).exists()
        )

    def test_regular_user_cannot_manage_members(self):
        group = Group.objects.create(name='FoodManager')
        self.client.force_login(self.regular_user)

        response = self.client.post(
            reverse('group-members', kwargs={'pk': group.pk}),
            data=json.dumps({'user_id': self.regular_user.pk}),
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 403)

    def test_system_group_membership_cannot_be_changed(self):
        group = Group.objects.get(name=HR_FOOD_ROLE)
        self.login_admin()

        response = self.client.post(
            reverse('group-members', kwargs={'pk': group.pk}),
            data=json.dumps({'user_id': self.regular_user.pk}),
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 403)
        self.assertFalse(
            group.user_set.filter(pk=self.regular_user.pk).exists()
        )
