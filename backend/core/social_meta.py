from django.http import HttpResponse
from django.utils.html import format_html
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_GET

from core.models import SiteSettings


@never_cache
@require_GET
def public_social_meta(request):
    config = SiteSettings.objects.filter(pk=1).first()

    site_name = (
        config.site_name if config and config.site_name
        else "فود"
    )
    description = (
        config.site_description
        if config and config.site_description
        else "سامانه رزرو غذای سازمانی"
    )

    title = f"{site_name} | {description}"
    site_url = request.build_absolute_uri('/')

    html = format_html(
        """
<meta name="description" content="{}" />
<meta property="og:type" content="website" />
<meta property="og:locale" content="fa_IR" />
<meta property="og:site_name" content="{}" />
<meta property="og:title" content="{}" />
<meta property="og:description" content="{}" />
<meta property="og:url" content="{}" />
<meta name="twitter:card" content="summary" />
<meta name="twitter:title" content="{}" />
<meta name="twitter:description" content="{}" />
""",
        description,
        site_name,
        title,
        description,
        site_url,
        title,
        description,
    )

    return HttpResponse(
        html,
        content_type="text/html; charset=utf-8",
    )
