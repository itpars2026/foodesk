from rest_framework.routers import DefaultRouter

from core.views import AuthViewSet, ConfigViewSet, EmployeeViewSet, HealthViewSet, NotificationViewSet
from food.views import (
    DailyReportViewSet,
    DrinkViewSet,
    FoodViewSet,
    MenuCategoryViewSet,
    MenuViewSet,
    ReservationViewSet,
    SideViewSet,
)

router = DefaultRouter(trailing_slash=False)
router.register('health', HealthViewSet, basename='health')
router.register('config', ConfigViewSet, basename='config')
router.register('auth', AuthViewSet, basename='auth')
router.register('employees', EmployeeViewSet, basename='employee')
router.register('notifications', NotificationViewSet, basename='notification')
router.register('foods', FoodViewSet, basename='food')
router.register('sides', SideViewSet, basename='side')
router.register('drinks', DrinkViewSet, basename='drink')
router.register('menu-categories', MenuCategoryViewSet, basename='menu-category')
router.register('menus', MenuViewSet, basename='menu')
router.register('reservations', ReservationViewSet, basename='reservation')
router.register('reports/daily', DailyReportViewSet, basename='daily-report')

urlpatterns = router.urls
