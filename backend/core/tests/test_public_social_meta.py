from django.test import TestCase

from core.models import SiteSettings


class PublicSocialMetaTests(TestCase):
    def test_metadata_reads_site_settings(self):
        settings, _ = SiteSettings.objects.get_or_create(pk=1)

        settings.site_name = "فودسک آزمایشی"
        settings.site_description = "سامانه آزمایشی غذا"
        settings.save()

        response = self.client.get("/api/v1/public-meta")

        self.assertEqual(response.status_code, 200)
        self.assertContains(
            response,
            'content="فودسک آزمایشی"',
        )
        self.assertContains(
            response,
            'content="فودسک آزمایشی | سامانه آزمایشی غذا"',
        )
        self.assertContains(
            response,
            'content="سامانه آزمایشی غذا"',
        )

    def test_metadata_escapes_html(self):
        settings, _ = SiteSettings.objects.get_or_create(pk=1)

        settings.site_name = '<script>alert("x")</script>'
        settings.site_description = 'Food "test" & more'
        settings.save()

        response = self.client.get("/api/v1/public-meta")
        body = response.content.decode()

        self.assertEqual(response.status_code, 200)
        self.assertNotIn("<script>", body)
        self.assertIn("&lt;script&gt;", body)
        self.assertIn("&quot;", body)
        self.assertIn("&amp;", body)

    def test_endpoint_is_public(self):
        response = self.client.get("/api/v1/public-meta")

        self.assertEqual(response.status_code, 200)
        self.assertIn(
            "no-store",
            response.headers["Cache-Control"],
        )
