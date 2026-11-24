from django.apps import AppConfig


class FoodConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'food'

    def ready(self):
        from . import receivers  # noqa: F401\n        from . import notification_handlers  # noqa: F401
        from . import notification_handlers  # noqa: F401
