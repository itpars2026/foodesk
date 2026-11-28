import { describe, expect, it } from 'vitest'
import type { User } from '../api/types'
import { canAccessCatalog, canSeeReport, isManager } from './permissions'

const baseUser: User = {
  id: 1,
  username: '1001',
  first_name: 'Test',
  last_name: 'User',
  is_active: true,
  is_superuser: false,
  must_change_password: false,
  roles: [],
  permissions: [],
}

function makeUser(overrides: Partial<User> = {}): User {
  return { ...baseUser, ...overrides }
}

describe('User permissions', () => {
  it.each([
    {
      title: 'Super Admin',
      user: makeUser({ is_superuser: true }),
      manage: true,
      report: true,
    },
    {
      title: 'hrFood',
      user: makeUser({ roles: ['hrFood'], permissions: ['food.add_food', 'food.view_management_reports'] }),
      manage: true,
      report: true,
    },
    {
      title: 'Viewer',
      user: makeUser({ roles: ['Viewer'], permissions: ['food.view_management_reports'] }),
      manage: false,
      report: true,
    },
    {
      title: 'custom food operator',
      user: makeUser({
        roles: ['FoodOperator'],
        permissions: ['food.add_food'],
      }),
      manage: true,
      report: false,
    },
    {
      title: 'custom report operator',
      user: makeUser({
        roles: ['ReportOperator'],
        permissions: ['food.view_management_reports'],
      }),
      manage: false,
      report: true,
    },
    {
      title: 'role name alone grants no permission',
      user: makeUser({ roles: ['hrFood'] }),
      manage: false,
      report: false,
    },
    {
      title: 'ordinary employee',
      user: makeUser(),
      manage: false,
      report: false,
    },
    {
      title: 'unknown role',
      user: makeUser({ roles: ['UnknownRole'] }),
      manage: false,
      report: false,
    },
    {
      title: 'Viewer and hrFood together',
      user: makeUser({ roles: ['Viewer', 'hrFood'], permissions: ['food.add_food', 'food.view_management_reports'] }),
      manage: true,
      report: true,
    },
  ])('$title permissions', ({ user, manage, report }) => {
    expect(isManager(user)).toBe(manage)
    expect(canSeeReport(user)).toBe(report)
  })
})

describe('canAccessCatalog', () => {
  it('allows an active super admin', () => {
    expect(canAccessCatalog({
      ...baseUser,
      is_superuser: true,
    })).toBe(true)
  })

  it('allows hrFood without catalog permissions', () => {
    expect(canAccessCatalog({
      ...baseUser,
      roles: ['hrFood'],
      permissions: [],
    })).toBe(true)
  })

  it('allows a custom group user with catalog permissions', () => {
    expect(canAccessCatalog({
      ...baseUser,
      roles: ['FoodOperator'],
      permissions: ['food.add_food'],
    })).toBe(true)
  })

  it('denies a user without catalog permissions', () => {
    expect(canAccessCatalog(baseUser)).toBe(false)
  })

  it('denies an inactive hrFood user', () => {
    expect(canAccessCatalog({
      ...baseUser,
      is_active: false,
      roles: ['hrFood'],
    })).toBe(false)
  })

  it('denies an inactive super admin', () => {
    expect(canAccessCatalog({
      ...baseUser,
      is_active: false,
      is_superuser: true,
    })).toBe(false)
  })
})
