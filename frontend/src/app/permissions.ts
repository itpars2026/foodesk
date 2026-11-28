import type { User } from '../api/types'

export function hasPermission(user: User, permission: string): boolean {
  return user.is_active && (
    user.is_superuser || user.permissions.includes(permission)
  )
}

const catalogPermissions = [
  'food.add_food',
  'food.change_food',
  'food.add_side',
  'food.change_side',
  'food.add_drink',
  'food.change_drink',
  'food.add_menu',
  'food.change_menu',
] as const

export function isManager(user: User): boolean {
  return catalogPermissions.some((permission) =>
    hasPermission(user, permission)
  )
}

export function canSeeReport(user: User): boolean {
  return hasPermission(user, 'food.view_management_reports')
}

export function canCreateEmployee(user: User): boolean {
  return hasPermission(user, 'core.add_customuser')
}


export function canAccessCatalog(user: User): boolean {
  return isManager(user) || (
    user.is_active && user.roles.includes('hrFood')
  )
}
