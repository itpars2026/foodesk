from core.social_meta import public_social_meta
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from core.permissions import IsSuperAdmin

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.contrib.staticfiles.views import serve as staticfiles_serve
from django.urls import include, path, re_path as rp

urlpatterns = [
    path('api/v1/public-meta', public_social_meta, name='public-social-meta'),
    path('admin/', admin.site.urls),
    path('api/v1/', include('apis.urls')),
    path(
        'api/v1/schema',
        SpectacularAPIView.as_view(
            permission_classes=[IsSuperAdmin],
        ),
        name='api-schema',
    ),
    path(
        'api/v1/docs',
        SpectacularSwaggerView.as_view(
            url_name='api-schema',
            permission_classes=[IsSuperAdmin],
        ),
        name='api-docs',
    ),
]


if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += (rp(r'^static/(?P<path>.*)$', staticfiles_serve, name='development-static'),)
