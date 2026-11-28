HR_FOOD_ROLE = 'hrFood'
EMPLOYEE_ROLE = 'Employee'
VIEWER_ROLE = 'Viewer'

ROLE_NAMES = (HR_FOOD_ROLE, EMPLOYEE_ROLE, VIEWER_ROLE)

HR_FOOD_CORE_PERMISSIONS = (
    'add_customuser',
    'change_customuser',
    'view_customuser',
    'add_profile',
    'change_profile',
    'view_profile',
)

HR_FOOD_FOOD_PERMISSIONS = (
    'add_food',
    'change_food',
    'view_food',
    'add_side',
    'change_side',
    'view_side',
    'add_drink',
    'change_drink',
    'view_drink',
    'add_menu',
    'change_menu',
    'view_menu',
    'view_management_reports',
)

VIEWER_FOOD_PERMISSIONS = (
    'view_food',
    'view_side',
    'view_drink',
    'view_menu',
    'view_management_reports',
)
# Permissions available to custom groups through Foodesk API.
# Internal Django administration permissions are deliberately excluded.
ASSIGNABLE_PERMISSIONS = {
    'core': frozenset(HR_FOOD_CORE_PERMISSIONS),
    'food': frozenset(HR_FOOD_FOOD_PERMISSIONS),
}
