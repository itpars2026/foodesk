from types import SimpleNamespace

from django.contrib.admin.sites import AdminSite
from django.core.exceptions import ValidationError
from django.test import RequestFactory, TestCase

from core.admin import SiteSettingsAdmin
from core.models import SiteSettings


class SiteSettingsModelTests(TestCase):
    def test_default_values(self):
        config = SiteSettings.objects.create()

        self.assertEqual(config.pk, 1)
        self.assertEqual(config.site_name_en, 'Foodesk')
        self.assertEqual(
            config.site_description,
            'سامانه رزرو غذای سازمانی',
        )

    def test_cannot_create_second_record(self):
        SiteSettings.objects.create()

        with self.assertRaises(ValidationError):
            SiteSettings.objects.create()

        self.assertEqual(SiteSettings.objects.count(), 1)

    def test_cannot_save_other_primary_key(self):
        config = SiteSettings.objects.create()
        config.pk = 2

        with self.assertRaises(ValidationError):
            config.save()


class SiteSettingsAdminTests(TestCase):
    def setUp(self):
        self.site_admin = SiteSettingsAdmin(
            SiteSettings,
            AdminSite(),
        )
        self.factory = RequestFactory()

    def request_for(self, *, is_superuser, is_active=True):
        request = self.factory.get('/admin/core/sitesettings/')
        request.user = SimpleNamespace(
            is_authenticated=True,
            is_superuser=is_superuser,
            is_active=is_active,
        )
        return request

    def test_regular_user_cannot_manage_settings(self):
        request = self.request_for(is_superuser=False)

        self.assertFalse(
            self.site_admin.has_view_permission(request)
        )
        self.assertFalse(
            self.site_admin.has_change_permission(request)
        )
        self.assertFalse(
            self.site_admin.has_add_permission(request)
        )

    def test_inactive_superuser_cannot_manage_settings(self):
        request = self.request_for(
            is_superuser=True,
            is_active=False,
        )

        self.assertFalse(
            self.site_admin.has_view_permission(request)
        )
        self.assertFalse(
            self.site_admin.has_change_permission(request)
        )

    def test_superuser_can_manage_settings(self):
        request = self.request_for(is_superuser=True)

        self.assertTrue(
            self.site_admin.has_view_permission(request)
        )
        self.assertTrue(
            self.site_admin.has_change_permission(request)
        )
        self.assertTrue(
            self.site_admin.has_add_permission(request)
        )

        SiteSettings.objects.create()

        self.assertFalse(
            self.site_admin.has_add_permission(request)
        )

    def test_deletion_is_always_disabled(self):
        request = self.request_for(is_superuser=True)

        self.assertFalse(
            self.site_admin.has_delete_permission(request)
        )


class SiteSettingsMetadataTests(TestCase):
    def test_default_metadata_without_settings_record(self):
        response = self.client.get('/api/v1/public-meta')

        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'فود')
        self.assertContains(
            response,
            'سامانه رزرو غذای سازمانی',
        )

    def test_open_graph_url_uses_request_host(self):
        response = self.client.get(
            '/api/v1/public-meta',
            secure=True,
        )

        self.assertEqual(response.status_code, 200)
        self.assertContains(
            response,
            'property="og:url" content="https://testserver/"',
        )

    def test_metadata_reflects_database_changes(self):
        config = SiteSettings.objects.create(
            site_name='نسخه اول',
        )

        first = self.client.get('/api/v1/public-meta')
        self.assertContains(first, 'نسخه اول')

        config.site_name = 'نسخه دوم'
        config.save()

        second = self.client.get('/api/v1/public-meta')
        self.assertContains(second, 'نسخه دوم')
        self.assertNotContains(second, 'نسخه اول')
