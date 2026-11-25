from django.contrib import admin, messages
from django.contrib.auth.admin import UserAdmin
from django.contrib.auth.models import Group
from django.core.exceptions import ValidationError

from unfold.admin import ModelAdmin
from unfold.forms import AdminPasswordChangeForm, UserChangeForm, UserCreationForm

from core.forms import NotificationAdminForm
from core.models import (
    Building,
    CustomUser,
    Department,
    Notification,
    NotificationRecipient,
    NotificationRole,
    Profile,
    SiteSettings,
)
from core.notifications import deactivate_notification, publish_manual_notification
from core.roles import ROLE_NAMES


@admin.register(CustomUser)
class CustomUserAdmin(UserAdmin, ModelAdmin):
    form = UserChangeForm
    add_form = UserCreationForm
    change_password_form = AdminPasswordChangeForm

    fieldsets = (*UserAdmin.fieldsets, ('Initial password', {'fields': ('must_change_password',)}))
    search_fields = ('username',)


@admin.register(Profile)
class ProfileAdmin(ModelAdmin):
    list_display = (
        'personnel_number',
        'user',
        'building',
        'department',
    )
    search_fields = ('personnel_number',)
    list_select_related = ('user', 'building', 'department')


@admin.register(Building)
class BuildingAdmin(ModelAdmin):
    list_display = ('number', 'is_active')
    list_display_links = ('number',)
    list_filter = ('is_active',)
    search_fields = ('number',)
    ordering = ('number',)


@admin.register(Department)
class DepartmentAdmin(ModelAdmin):
    list_display = ('number', 'is_active')
    list_display_links = ('number',)
    list_filter = ('is_active',)
    search_fields = ('number',)
    ordering = ('number',)


@admin.register(SiteSettings)
class SiteSettingsAdmin(ModelAdmin):
    fields = (
        'site_name',
        'site_name_en',
        'site_description',
        'logo',
        'favicon',
    )
    list_display = ('site_name', 'site_name_en')

    def has_module_permission(self, request):
        return request.user.is_active and request.user.is_superuser

    def has_view_permission(self, request, obj=None):
        return request.user.is_active and request.user.is_superuser

    def has_add_permission(self, request):
        return request.user.is_active and request.user.is_superuser and not SiteSettings.objects.exists()

    def has_change_permission(self, request, obj=None):
        return request.user.is_active and request.user.is_superuser

    def has_delete_permission(self, request, obj=None):
        return False


class NotificationRoleInline(admin.TabularInline):
    model = NotificationRole
    extra = 0

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == 'group':
            kwargs['queryset'] = Group.objects.filter(name__in=ROLE_NAMES)

        return super().formfield_for_foreignkey(db_field, request, **kwargs)


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    form = NotificationAdminForm

    list_display = (
        'title',
        'notification_type',
        'source',
        'send_to_all',
        'is_active',
        'starts_at',
        'expires_at',
    )

    list_filter = (
        'notification_type',
        'source',
        'send_to_all',
        'is_active',
    )

    search_fields = (
        'title',
        'message',
        'event_key',
    )

    readonly_fields = (
        'source',
        'event_key',
        'is_active',
        'datetime_created',
        'datetime_modified',
    )

    fields = (
        'title',
        'message',
        'notification_type',
        'source',
        'event_key',
        'send_to_all',
        'starts_at',
        'expires_at',
        'is_active',
        'datetime_created',
        'datetime_modified',
    )

    inlines = (NotificationRoleInline,)

    actions = (
        'publish_selected',
        'deactivate_selected',
    )

    def has_module_permission(self, request):
        return bool(request.user.is_active and request.user.is_superuser)

    def has_view_permission(self, request, obj=None):
        return self.has_module_permission(request)

    def has_add_permission(self, request):
        return self.has_module_permission(request)

    def has_change_permission(self, request, obj=None):
        return self.has_module_permission(request)

    def has_delete_permission(self, request, obj=None):
        return False

    def save_model(self, request, obj, form, change):
        if not change:
            obj.source = Notification.NotificationSource.MANUAL
            obj.is_active = False

        super().save_model(request, obj, form, change)

    @admin.action(description='انتشار اعلان‌های انتخاب‌شده')
    def publish_selected(self, request, queryset):
        for notification in queryset:
            try:
                count = publish_manual_notification(notification.pk)

            except ValidationError as exc:
                self.message_user(request, f'{notification.title}: {"; ".join(exc.messages)}', level=messages.ERROR)

            else:
                self.message_user(request, f'{notification.title}: {count} کاربر هدف.', level=messages.SUCCESS)

    @admin.action(description='غیرفعال‌سازی اعلان‌های انتخاب‌شده')
    def deactivate_selected(self, request, queryset):
        for notification in queryset:
            try:
                deactivate_notification(notification.pk)

            except ValidationError as exc:
                self.message_user(request, f'{notification.title}: {"; ".join(exc.messages)}', level=messages.ERROR)

            else:
                self.message_user(request, f'{notification.title}: غیرفعال شد.', level=messages.SUCCESS)


@admin.register(NotificationRecipient)
class NotificationRecipientAdmin(admin.ModelAdmin):
    list_display = (
        'notification',
        'user',
        'read_at',
        'datetime_created',
    )

    list_filter = ('read_at',)

    search_fields = (
        'notification__title',
        'user__username',
    )

    readonly_fields = (
        'notification',
        'user',
        'read_at',
        'datetime_created',
        'datetime_modified',
    )

    def has_module_permission(self, request):
        return bool(request.user.is_active and request.user.is_superuser)

    def has_view_permission(self, request, obj=None):
        return self.has_module_permission(request)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
