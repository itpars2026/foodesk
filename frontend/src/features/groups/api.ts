import { api } from '../../api/client'

export type ManagedGroup = {
  id: number
  name: string
  permissions: number[]
  is_system: boolean
}

export type AssignablePermission = {
  id: number
  app_label: string
  codename: string
  name: string
}

export type GroupMember = {
  id: number
  username: string
  first_name: string
  last_name: string
  is_active: boolean
}

export type GroupAssignableEmployee = {
  id: number
  personnel_number: string
  first_name: string
  last_name: string
  is_active: boolean
}

export function listGroupAssignableEmployees(): Promise<GroupAssignableEmployee[]> {
  return api<GroupAssignableEmployee[]>('/employees')
}

export type GroupPayload = {
  name: string
  permissions: number[]
}

export function listGroups(): Promise<ManagedGroup[]> {
  return api<ManagedGroup[]>('/groups')
}

export function listAssignablePermissions(): Promise<AssignablePermission[]> {
  return api<AssignablePermission[]>('/permissions')
}

export function createGroup(payload: GroupPayload): Promise<ManagedGroup> {
  return api<ManagedGroup>('/groups', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updateGroup(
  groupId: number,
  payload: Partial<GroupPayload>,
): Promise<ManagedGroup> {
  return api<ManagedGroup>(`/groups/${groupId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export function deleteGroup(groupId: number): Promise<void> {
  return api<void>(`/groups/${groupId}`, {
    method: 'DELETE',
  })
}

export function listGroupMembers(groupId: number): Promise<GroupMember[]> {
  return api<GroupMember[]>(`/groups/${groupId}/members`)
}

export function addGroupMember(
  groupId: number,
  userId: number,
): Promise<{ group_id: number; user_id: number; added: boolean }> {
  return api(`/groups/${groupId}/members`, {
    method: 'POST',
    body: JSON.stringify({ user_id: userId }),
  })
}

export function removeGroupMember(
  groupId: number,
  userId: number,
): Promise<void> {
  return api<void>(`/groups/${groupId}/members/${userId}`, {
    method: 'DELETE',
  })
}
