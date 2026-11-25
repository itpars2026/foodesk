import { api } from './client'
import type { Profile, ProfileOptions, User, SubsidyPreferenceMonth, SubsidyPreferencesResponse, SubsidyPreferenceUpdate } from './types'

export const getCsrf = () => api<{ csrf_token: string }>('/auth/csrf')
export const getSession = () =>
  api<User | { authenticated: false }>('/auth/session')
export const logout = () => api<void>('/auth/logout', { method: 'POST', body: '{}' })

export async function login(username: string, password: string): Promise<User> {
  await getCsrf()
  return api<User>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) })
}

export function changePassword(old_password: string, new_password: string, new_password_confirm: string) {
  return api<User>('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ old_password, new_password, new_password_confirm }),
  })
}



export const getProfile = () =>
  api<Profile>('/auth/profile')

export const getProfileOptions = () =>
  api<ProfileOptions>('/auth/profile-options')

export function updateProfile(data: {
  building?: number
  department?: number
}) {
  return api<Profile>('/auth/profile', {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

import type {
  NotificationItem,
  NotificationListResponse,
  NotificationUnreadCount,
  NotificationReadAllResponse,
} from './types'

export const getNotifications = () =>
  api<NotificationListResponse>('/notifications')

export const getNotificationUnreadCount = () =>
  api<NotificationUnreadCount>('/notifications/unread-count')

export const markNotificationRead = (id: number) =>
  api<NotificationItem>(`/notifications/${id}/read`, {
    method: 'POST',
  })

export const markAllNotificationsRead = () =>
  api<NotificationReadAllResponse>('/notifications/read-all', {
    method: 'POST',
  })

export const getSubsidyPreferences = () =>
  api<SubsidyPreferencesResponse>('/auth/subsidy-preferences')

export const updateSubsidyPreference = (data: SubsidyPreferenceUpdate) =>
  api<SubsidyPreferenceMonth>('/auth/subsidy-preferences', {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
