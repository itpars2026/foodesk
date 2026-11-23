from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from django.conf import settings
from django.db.models import Prefetch
from django.utils.dateparse import parse_date

from typing import ClassVar

from core.permissions import HasChangedInitialPassword, IsCatalogReaderOrManager, IsHRFoodViewerOrSuperAdmin
from food.daily_excel import export_daily_excel
from food.history_excel import export_full_history
from food.models import Drink, Food, Menu, MenuCategory, Reservation, ReservationItem, Side
from food.serializers import (
    DailyReportSerializer,
    DrinkSerializer,
    FoodSerializer,
    MenuCategorySerializer,
    MenuSerializer,
    ReservationBatchInputSerializer,
    ReservationRevisionInputSerializer,
    ReservationSerializer,
    SideSerializer,
    WeeklyMenuSerializer,
)
from food.services import create_reservations, revise_reservation, weekly_menus
from food.wallet import current_month_wallet


class CatalogViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    http_method_names: ClassVar[list] = ['get', 'post', 'patch', 'head', 'options']
    permission_classes: ClassVar[list] = [
        IsAuthenticated,
        HasChangedInitialPassword,
        IsCatalogReaderOrManager,
    ]


class FoodViewSet(CatalogViewSet):
    queryset = Food.objects.all()
    serializer_class = FoodSerializer


class SideViewSet(CatalogViewSet):
    queryset = Side.objects.all()
    serializer_class = SideSerializer


class DrinkViewSet(CatalogViewSet):
    queryset = Drink.objects.all()
    serializer_class = DrinkSerializer


class MenuCategoryViewSet(viewsets.ReadOnlyModelViewSet):
    permission_classes: ClassVar[list] = [IsAuthenticated, HasChangedInitialPassword]
    queryset = MenuCategory.objects.filter(is_active=True).order_by('sort_order', 'id')
    serializer_class = MenuCategorySerializer


class MenuViewSet(CatalogViewSet):
    queryset = Menu.objects.select_related('food', 'category').all()
    serializer_class = MenuSerializer


class ReservationViewSet(viewsets.ModelViewSet):
    http_method_names: ClassVar[list] = ['get', 'post', 'patch', 'head', 'options']
    permission_classes: ClassVar[list] = [IsAuthenticated, HasChangedInitialPassword]
    queryset = Reservation.objects.none()
    serializer_class = ReservationSerializer

    def get_queryset(self):
        return (
            Reservation.objects.filter(user=self.request.user)
            .select_related('menu__food', 'menu__category', 'user')
            .prefetch_related(
                'items__side',
                'items__drink',
                'items__side_items__side',
                'items__drink_items__drink',
            )
        )

    def create(self, request, *args, **kwargs):
        input_serializer = ReservationBatchInputSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)
        reservations = create_reservations(
            request.user,
            input_serializer.validated_data['reservations'],
            cutoff_hour=settings.RESERVATION_CUTOFF_HOUR,
        )
        return Response(
            self.get_serializer(reservations, many=True).data,
            status=status.HTTP_201_CREATED,
        )

    def partial_update(self, request, *args, **kwargs):
        reservation = self.get_object()
        input_serializer = ReservationRevisionInputSerializer(data=request.data, partial=True)
        input_serializer.is_valid(raise_exception=True)
        revise_reservation(
            reservation,
            input_serializer.validated_data,
            cutoff_hour=settings.RESERVATION_CUTOFF_HOUR,
        )
        return Response(self.get_serializer(self.get_object()).data)

    @action(detail=False, methods=['get'], url_path='wallet-summary')
    def wallet_summary(self, request):
        return Response(current_month_wallet(self.get_queryset()))

    @action(detail=False, methods=['get'], url_path='history-export')
    def history_export(self, request):
        from core.models import Profile

        person_id = Profile.objects.filter(user=request.user).values_list('personnel_number', flat=True).first()

        if not person_id:
            raise ValidationError({'personnel_number': 'کد پرسنلی کاربر ثبت نشده است.'})

        return export_full_history(
            self.get_queryset(),
            str(person_id),
        )

    @action(detail=False, methods=['get'])
    def weekly(self, request):
        start_date = parse_date(request.query_params.get('start', ''))
        if start_date is None:
            raise ValidationError({'start': 'تاریخ شروع هفته با قالب YYYY-MM-DD الزامی است.'})
        menus = weekly_menus(request.user, start_date)
        return Response(WeeklyMenuSerializer(menus, many=True, context={'request': request}).data)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        reservation = self.get_object()
        revise_reservation(
            reservation,
            {},
            cancelled=True,
            cutoff_hour=settings.RESERVATION_CUTOFF_HOUR,
        )
        return Response(self.get_serializer(self.get_object()).data)


class DailyReportViewSet(viewsets.ViewSet):
    permission_classes: ClassVar[list] = [
        IsAuthenticated,
        HasChangedInitialPassword,
        IsHRFoodViewerOrSuperAdmin,
    ]
    queryset = Menu.objects.none()
    serializer_class = DailyReportSerializer

    def _report_data(self, request):
        start_date = parse_date(request.query_params.get('from', ''))
        end_date = parse_date(request.query_params.get('to', ''))
        if start_date is None or end_date is None:
            raise ValidationError({'date_range': 'پارامترهای from و to با قالب YYYY-MM-DD الزامی‌اند.'})
        if end_date < start_date:
            raise ValidationError({'to': 'تاریخ پایان نباید قبل از تاریخ شروع باشد.'})

        current_items = ReservationItem.objects.filter(
            is_current=True,
        ).prefetch_related(
            'side_items',
            'drink_items',
        )

        report_reservations = Reservation.objects.prefetch_related(
            Prefetch(
                'items',
                queryset=current_items,
                to_attr='report_current_items',
            ),
        )

        menus = (
            Menu.objects.filter(date__range=(start_date, end_date))
            .select_related('food', 'category')
            .prefetch_related(
                Prefetch(
                    'reservations',
                    queryset=report_reservations,
                    to_attr='report_reservations',
                ),
            )
            .order_by('date')
        )

        data = []

        for menu in menus:
            reserved_count = 0
            cancelled_count = 0
            food_quantity = 0
            total_toman = 0

            for reservation in menu.report_reservations:
                if reservation.status == Reservation.Status.CANCELLED:
                    cancelled_count += 1
                    continue

                if reservation.status != Reservation.Status.RESERVED:
                    continue

                reserved_count += 1

                for item in reservation.report_current_items:
                    if item.is_cancelled:
                        continue

                    food_quantity += item.food_quantity
                    total_toman += item.total_price

            data.append(
                {
                    'date': menu.date,
                    'food': menu.food.name,
                    'category': menu.category.name,
                    'reserved_count': reserved_count,
                    'cancelled_count': cancelled_count,
                    'food_quantity': food_quantity,
                    'total_toman': total_toman,
                }
            )

        return data

    def list(self, request):
        return Response(self._report_data(request))

    @action(detail=False, methods=['get'], url_path='buildings')
    def buildings(self, request):
        """Active reservations grouped by delivery building and menu day."""
        start_date = parse_date(request.query_params.get('from', ''))
        end_date = parse_date(request.query_params.get('to', ''))

        if start_date is None or end_date is None:
            raise ValidationError({'date_range': 'پارامترهای from و to با قالب YYYY-MM-DD الزامی‌اند.'})
        if end_date < start_date:
            raise ValidationError({'to': 'تاریخ پایان نباید قبل از تاریخ شروع باشد.'})

        items = ReservationItem.objects.filter(
            reservation__menu__date__range=(start_date, end_date),
            reservation__status=Reservation.Status.RESERVED,
            is_current=True,
            is_cancelled=False,
        ).select_related(
            'building',
            'reservation__menu__food',
            'reservation__menu__category',
        )

        grouped = {}

        for item in items:
            number = item.building_number_snapshot or (item.building.number if item.building_id else '')

            if not number:
                continue

            number = str(number)
            menu = item.reservation.menu

            building = grouped.setdefault(
                number,
                {
                    'building_number': number,
                    'reserved_count': 0,
                    'days': {},
                },
            )

            day_key = (menu.date, menu.category_id, menu.food.name)
            day = building['days'].setdefault(
                day_key,
                {
                    'date': menu.date.isoformat(),
                    'food': menu.food.name,
                    'category': menu.category.name,
                    'reserved_count': 0,
                    'food_quantity': 0,
                },
            )

            building['reserved_count'] += 1
            day['reserved_count'] += 1
            day['food_quantity'] += item.food_quantity

        def number_sort(value):
            return (0, int(value), value) if value.isdecimal() else (1, value)

        result = []

        for number in sorted(grouped, key=number_sort):
            building = grouped[number]
            result.append(
                {
                    'building_number': number,
                    'reserved_count': building['reserved_count'],
                    'days': [building['days'][key] for key in sorted(building['days'])],
                }
            )

        return Response({'buildings': result})

    @action(detail=False, methods=['get'], url_path='export')
    def export(self, request):
        """Export three Jalali XLSX sheets using dynamic catalog item columns."""
        start_date = parse_date(request.query_params.get('from', ''))
        end_date = parse_date(request.query_params.get('to', ''))
        if start_date is None or end_date is None:
            raise ValidationError({'date_range': 'پارامترهای from و to با قالب YYYY-MM-DD الزامی‌اند.'})
        if end_date < start_date:
            raise ValidationError({'to': 'تاریخ پایان نباید قبل از تاریخ شروع باشد.'})
        return export_daily_excel(start_date, end_date)
