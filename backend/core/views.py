from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from django.contrib.auth import login as auth_login, logout as auth_logout, update_session_auth_hash
from django.db.models import Q
from django.middleware.csrf import get_token
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie

from typing import ClassVar

from core.models import Building, CustomUser, Department, NotificationRecipient, Profile, SiteSettings
from core.paginations import NotificationPagination
from core.permissions import HasChangedInitialPassword, IsHRFoodOrSuperAdmin
from core.serializers import (
    ChangePasswordSerializer,
    EmployeeCreateSerializer,
    EmployeeSerializer,
    EmployeeUpdateSerializer,
    LoginSerializer,
    MonthlySubsidyUpdateSerializer,
    NotificationSerializer,
    ProfileSerializer,
    SessionUserSerializer,
)
from core.subsidy import (
    can_change_subsidy,
    current_and_next_jalali_month,
    effective_subsidy,
    subsidy_deadline,
)


class HealthViewSet(viewsets.ViewSet):
    authentication_classes: ClassVar[list] = []
    permission_classes: ClassVar[list] = [AllowAny]

    @extend_schema(
        responses=inline_serializer(
            name='HealthResponse',
            fields={'status': serializers.CharField()},
        )
    )
    def list(self, request):
        return Response({'status': 'ok'})


class ConfigViewSet(viewsets.ViewSet):
    """Public, read-only application branding configuration."""

    authentication_classes: ClassVar[list] = []
    permission_classes: ClassVar[list] = [AllowAny]
    http_method_names: ClassVar[list] = ['get', 'head', 'options']

    @extend_schema(
        responses=inline_serializer(
            name='PublicSiteConfig',
            fields={
                'site_name': serializers.CharField(),
                'site_name_en': serializers.CharField(),
                'site_description': serializers.CharField(),
                'logo_url': serializers.URLField(allow_null=True),
                'favicon_url': serializers.URLField(allow_null=True),
            },
        )
    )
    def list(self, request):
        config = SiteSettings.objects.filter(pk=1).first()

        if config is None:
            return Response(
                {
                    'site_name': 'فود',
                    'site_name_en': 'Foodesk',
                    'site_description': 'سامانه رزرو غذای سازمانی',
                    'logo_url': None,
                    'favicon_url': None,
                }
            )

        return Response(
            {
                'site_name': config.site_name,
                'site_name_en': config.site_name_en,
                'site_description': config.site_description,
                'logo_url': config.logo.url if config.logo else None,
                'favicon_url': config.favicon.url if config.favicon else None,
            }
        )


class AuthViewSet(viewsets.GenericViewSet):
    permission_classes: ClassVar[list] = [IsAuthenticated]
    serializer_class = SessionUserSerializer

    def get_serializer_class(self):
        serializer_classes = {
            'login': LoginSerializer,
            'session': SessionUserSerializer,
            'profile': ProfileSerializer,
            'change_password': ChangePasswordSerializer,
        }
        return serializer_classes.get(self.action, self.serializer_class)

    @extend_schema(
        responses=inline_serializer(
            name='CsrfTokenResponse',
            fields={'csrf_token': serializers.CharField()},
        )
    )
    @action(
        detail=False,
        methods=['get'],
        authentication_classes=[],
        permission_classes=[AllowAny],
    )
    @method_decorator(ensure_csrf_cookie)
    def csrf(self, request):
        return Response({'csrf_token': get_token(request)})

    @extend_schema(responses={200: SessionUserSerializer})
    @action(
        detail=False,
        methods=['post'],
        authentication_classes=[],
        permission_classes=[AllowAny],
    )
    @method_decorator(csrf_protect)
    def login(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data['user']
        auth_login(request, user)
        return Response(SessionUserSerializer(user).data)

    @action(detail=False, methods=['get'], permission_classes=[AllowAny])
    def session(self, request):
        if not request.user.is_authenticated:
            return Response({'authenticated': False})

        return Response(self.get_serializer(request.user).data)

    @extend_schema(responses={200: SessionUserSerializer})
    @action(detail=False, methods=['post'], url_path='change-password')
    def change_password(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = request.user
        user.set_password(serializer.validated_data['new_password'])
        user.must_change_password = False
        user.save(update_fields=('password', 'must_change_password'))
        update_session_auth_hash(request, user)
        return Response(SessionUserSerializer(user).data)

    @action(detail=False, methods=['get', 'patch'])
    def profile(self, request):
        profile = request.user.profile

        if request.method == 'GET':
            return Response(self.get_serializer(profile).data)

        serializer = self.get_serializer(
            profile,
            data=request.data,
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()

        return Response(serializer.data)

    @extend_schema(
        request=inline_serializer(
            name='MonthlySubsidyUpdateRequest',
            fields={
                'jalali_year': serializers.IntegerField(min_value=1),
                'jalali_month': serializers.IntegerField(min_value=1, max_value=12),
                'receive_subsidy': serializers.BooleanField(),
            },
        ),
        responses={
            200: inline_serializer(
                name='MonthlySubsidyMonthResponse',
                fields={
                    'jalali_year': serializers.IntegerField(),
                    'jalali_month': serializers.IntegerField(),
                    'receive_subsidy': serializers.BooleanField(),
                    'can_change': serializers.BooleanField(),
                    'deadline': serializers.DateTimeField(),
                },
            )
        },
    )
    @action(
        detail=False,
        methods=['get', 'patch'],
        url_path='subsidy-preferences',
        permission_classes=[
            IsAuthenticated,
            HasChangedInitialPassword,
            IsHRFoodOrSuperAdmin,
        ],
    )
    def subsidy_preferences(self, request):
        profile = get_object_or_404(Profile, user=request.user)

        if request.method == 'GET':
            months = current_and_next_jalali_month()
            return Response(
                {
                    'months': [self._subsidy_result(profile, year, month) for year, month in months],
                }
            )

        serializer = MonthlySubsidyUpdateSerializer(
            data=request.data,
            context={'profile': profile},
        )
        serializer.is_valid(raise_exception=True)
        preference = serializer.save()

        return Response(
            self._subsidy_result(
                profile,
                preference.jalali_year,
                preference.jalali_month,
            )
        )

    @staticmethod
    def _subsidy_result(profile, year, month):
        return {
            'jalali_year': year,
            'jalali_month': month,
            'receive_subsidy': effective_subsidy(profile, year, month),
            'can_change': can_change_subsidy(year, month),
            'deadline': subsidy_deadline(year, month),
        }

    @action(detail=False, methods=['get'], url_path='profile-options')
    def profile_options(self, request):
        buildings = list(Building.objects.filter(is_active=True).order_by('number').values('id', 'number'))
        departments = list(Department.objects.filter(is_active=True).order_by('number').values('id', 'number'))

        return Response(
            {
                'buildings': buildings,
                'departments': departments,
            }
        )

    @extend_schema(request=None, responses={204: None})
    @action(detail=False, methods=['post'])
    def logout(self, request):
        auth_logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class EmployeeViewSet(
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
        IsHRFoodOrSuperAdmin,
    ]
    queryset = CustomUser.objects.filter(profile__isnull=False).select_related('profile')

    def get_serializer_class(self):
        if self.action == 'create':
            return EmployeeCreateSerializer
        if self.action == 'partial_update':
            return EmployeeUpdateSerializer
        return EmployeeSerializer


class NotificationViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    serializer_class = NotificationSerializer
    pagination_class = NotificationPagination

    lookup_field = 'notification_id'
    lookup_url_kwarg = 'pk'

    permission_classes = (
        IsAuthenticated,
        HasChangedInitialPassword,
    )
    http_method_names = ('get', 'post', 'head', 'options')

    @action(detail=False, methods=['post'], url_path='manage')
    def manage_create(self, request):
        from core.notification_management import create_manual_notification

        result = create_manual_notification(request.user, request.data)
        return Response(result, status=201)

    @action(detail=False, methods=['get'], url_path='manage/roles')
    def manage_roles(self, request):
        from core.notification_management import list_target_roles

        return Response(list_target_roles(request.user))

    def get_queryset(self):
        now = timezone.now()

        return (
            NotificationRecipient.objects.filter(
                user=self.request.user,
                notification__is_active=True,
                notification__starts_at__lte=now,
            )
            .filter(Q(notification__expires_at__isnull=True) | Q(notification__expires_at__gt=now))
            .select_related('notification')
            .order_by(
                '-notification__starts_at',
                '-notification_id',
            )
        )

    @action(detail=False, methods=['get'], url_path='unread-count')
    def unread_count(self, request):
        count = (
            self.get_queryset()
            .filter(
                read_at__isnull=True,
            )
            .count()
        )

        return Response({'unread_count': count})

    @action(detail=True, methods=['post'], url_path='read', url_name='read')
    def mark_read(self, request, pk=None):
        recipient = self.get_object()

        if recipient.read_at is None:
            recipient.read_at = timezone.now()
            recipient.save(
                update_fields=[
                    'read_at',
                    'datetime_modified',
                ],
            )

        serializer = self.get_serializer(recipient)
        return Response(serializer.data)

    @action(detail=False, methods=['post'], url_path='read-all')
    def read_all(self, request):
        now = timezone.now()

        count = (
            self.get_queryset()
            .filter(
                read_at__isnull=True,
            )
            .update(
                read_at=now,
                datetime_modified=now,
            )
        )

        return Response(
            {
                'marked_read': count,
                'unread_count': 0,
            }
        )
