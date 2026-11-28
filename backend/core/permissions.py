from rest_framework.permissions import BasePermission

from core.roles import EMPLOYEE_ROLE, HR_FOOD_ROLE, VIEWER_ROLE


class HasChangedInitialPassword(BasePermission):
    message = 'You must change your initial password before continuing.'

    def has_permission(self, request, view) -> bool:
        user = request.user
        return bool(user and user.is_authenticated and (user.is_superuser or not user.must_change_password))


class IsHRFoodOrSuperAdmin(BasePermission):
    message = 'You do not have permission to manage employees.'

    EMPLOYEE_ACTION_PERMISSIONS = {
        'list': 'core.view_customuser',
        'retrieve': 'core.view_customuser',
        'create': 'core.add_customuser',
        'partial_update': 'core.change_customuser',
        'update': 'core.change_customuser',
    }

    def has_permission(self, request, view) -> bool:
        user = request.user

        if not user or not user.is_authenticated or not user.is_active:
            return False

        if user.is_superuser:
            return True

        # Employee API: authorize each action by its Django permission.
        if getattr(view, 'basename', None) == 'employee':
            required = self.EMPLOYEE_ACTION_PERMISSIONS.get(
                getattr(view, 'action', None)
            )

            return bool(required and user.has_perm(required))

        # Preserve existing behavior for other endpoints using this
        # permission class, including subsidy preferences.
        return user.groups.filter(name=HR_FOOD_ROLE).exists()


class IsHRFoodViewerOrSuperAdmin(BasePermission):
    message = 'You do not have permission to access this resource.'

    def has_permission(self, request, view) -> bool:
        user = request.user

        if not user or not user.is_authenticated or not user.is_active:
            return False

        if user.is_superuser:
            return True

        # Organizational reports require their own explicit permission.
        if getattr(view, 'basename', None) == 'daily-report':
            if request.method not in ('GET', 'HEAD', 'OPTIONS'):
                return False

            return user.has_perm('food.view_management_reports')

        # Preserve existing behavior for unrelated endpoints.
        if user.groups.filter(name=HR_FOOD_ROLE).exists():
            return True

        return bool(
            request.method in ('GET', 'HEAD', 'OPTIONS')
            and user.groups.filter(name=VIEWER_ROLE).exists()
        )


class IsCatalogReaderOrManager(BasePermission):
    message = 'You do not have permission to perform this catalog operation.'

    def has_permission(self, request, view) -> bool:
        user = request.user

        if not user or not user.is_authenticated or not user.is_active:
            return False

        if user.is_superuser:
            return True

        queryset = getattr(view, 'queryset', None)
        model = getattr(queryset, 'model', None)

        if model is None:
            return False

        app_label = model._meta.app_label
        model_name = model._meta.model_name

        method_permissions = {
            'GET': 'view',
            'HEAD': 'view',
            'OPTIONS': 'view',
            'POST': 'add',
            'PUT': 'change',
            'PATCH': 'change',
        }

        operation = method_permissions.get(request.method)

        if operation is None:
            return False

        permission = f'{app_label}.{operation}_{model_name}'

        if user.has_perm(permission):
            return True

        # Preserve existing employee/viewer catalog read access.
        if request.method in ('GET', 'HEAD', 'OPTIONS'):
            return user.groups.filter(
                name__in=(EMPLOYEE_ROLE, VIEWER_ROLE)
            ).exists()

        return False


class IsSuperAdmin(BasePermission):
    message = 'Only active super administrators can access API documentation.'

    def has_permission(self, request, view) -> bool:
        user = request.user

        return bool(user and user.is_authenticated and user.is_active and user.is_superuser)
