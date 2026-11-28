import { useEffect, useState } from 'react'

import {
  addGroupMember,
  listGroupAssignableEmployees,
  listGroupMembers,
  removeGroupMember,
} from './api'
import type {
  GroupAssignableEmployee,
  GroupMember,
  ManagedGroup,
} from './api'
import { getApiMessage } from '../../utils/errors'

type Props = {
  group: ManagedGroup
}

export default function GroupMembersPanel({ group }: Props) {
  const [members, setMembers] = useState<GroupMember[]>([])
  const [employees, setEmployees] = useState<GroupAssignableEmployee[]>([])
  const [search, setSearch] = useState('')
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [membersLoaded, setMembersLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)
      setError('')
      setMembers([])
      setMembersLoaded(false)
      setEmployees([])
      setSelectedUserId(null)
      setSearch('')

      try {
        const [membersResult, employeesResult] = await Promise.allSettled([
          listGroupMembers(group.id),
          group.is_system
            ? Promise.resolve([] as GroupAssignableEmployee[])
            : listGroupAssignableEmployees(),
        ])

        if (!active) return

        if (membersResult.status === 'fulfilled') {
          setMembers(membersResult.value)
          setMembersLoaded(true)
        } else {
          setError(getApiMessage(membersResult.reason))
        }

        if (employeesResult.status === 'fulfilled') {
          setEmployees(employeesResult.value)
        } else if (membersResult.status === 'fulfilled') {
          setError(
            'اعضای گروه دریافت شدند، اما فهرست کارکنان بارگذاری نشد.'
          )
        }
      } catch (cause) {
        if (active) setError(getApiMessage(cause))
      } finally {
        if (active) setLoading(false)
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [group.id, group.is_system])

  async function refreshMembers() {
    setMembers(await listGroupMembers(group.id))
  }

  async function handleAdd() {
    if (
      group.is_system ||
      !membersLoaded ||
      saving ||
      selectedUserId === null ||
      members.some((member) => member.id === selectedUserId)
    ) return

    setSaving(true)
    setError('')

    try {
      await addGroupMember(group.id, selectedUserId)
      await refreshMembers()
      setSelectedUserId(null)
      setSearch('')
    } catch (cause) {
      setError(getApiMessage(cause))
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove(userId: number) {
    if (group.is_system || !membersLoaded || saving) return

    setSaving(true)
    setError('')

    try {
      await removeGroupMember(group.id, userId)
      await refreshMembers()
    } catch (cause) {
      setError(getApiMessage(cause))
    } finally {
      setSaving(false)
    }
  }

  const memberIds = new Set(members.map((member) => member.id))
  const normalizedSearch = search.trim().toLocaleLowerCase()

  const candidates = employees
    .filter((employee) => !memberIds.has(employee.id))
    .filter((employee) => {
      if (!normalizedSearch) return false

      const searchableText = [
        employee.personnel_number,
        employee.first_name,
        employee.last_name,
      ].join(' ').toLocaleLowerCase()

      return searchableText.includes(normalizedSearch)
    })
    .slice(0, 20)

  return (
    <section className="grid gap-4 rounded-xl border border-line bg-surface p-4">
      <h3 className="m-0 text-base font-bold text-ink">
        اعضای گروه {group.name}
      </h3>

      {error && (
        <p role="alert" className="text-sm text-negative">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-muted">در حال دریافت اعضا…</p>
      ) : (
        <>
          <div className="grid gap-2">
            {members.length === 0 ? (
              <p className="text-sm text-muted">
                این گروه عضوی ندارد.
              </p>
            ) : (
              members.map((member) => (
                <div
                  key={member.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line p-3"
                >
                  <div className="grid gap-1">
                    <span className="text-sm font-semibold text-ink">
                      {[member.first_name, member.last_name]
                        .filter(Boolean)
                        .join(' ') || member.username}
                    </span>
                    <span className="text-xs text-muted" dir="ltr">
                      {member.username}
                    </span>
                  </div>

                  {!group.is_system && (
                    <button
                      type="button"
                      disabled={saving}
                      className="min-h-10 rounded-lg border border-negative px-3 text-sm text-negative disabled:opacity-50"
                      onClick={() => void handleRemove(member.id)}
                    >
                      حذف عضویت
                    </button>
                  )}
                </div>
              ))
            )}
          </div>

          {!membersLoaded ? (
            <p className="text-sm text-muted">
              دریافت اعضای گروه ناموفق بود. تغییر عضویت امکان‌پذیر نیست.
            </p>
          ) : group.is_system ? (
            <p className="text-xs text-muted">
              عضویت در گروه‌های سیستمی از این بخش قابل تغییر نیست.
            </p>
          ) : (
            <div className="grid gap-3 border-t border-line pt-4">
              <label className="grid gap-2 text-sm text-ink">
                جست‌وجوی کاربر با کد پرسنلی یا نام
                <input
                  type="search"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value)
                    setSelectedUserId(null)
                  }}
                  className="min-h-11 rounded-lg border border-line bg-surface px-3 text-ink"
                />
              </label>

              {candidates.length > 0 && (
                <div className="grid max-h-60 gap-2 overflow-y-auto">
                  {candidates.map((employee) => (
                    <button
                      key={employee.id}
                      type="button"
                      disabled={saving}
                      onClick={() => setSelectedUserId(employee.id)}
                      aria-pressed={selectedUserId === employee.id}
                      className="rounded-lg border border-line p-3 text-start text-sm text-ink aria-pressed:border-accent"
                    >
                      {employee.personnel_number} —{' '}
                      {[employee.first_name, employee.last_name]
                        .filter(Boolean)
                        .join(' ')}
                    </button>
                  ))}
                </div>
              )}

              <button
                type="button"
                disabled={saving || selectedUserId === null}
                onClick={() => void handleAdd()}
                className="min-h-11 rounded-lg bg-accent px-4 text-sm font-bold text-white disabled:opacity-50"
              >
                {saving ? 'در حال ذخیره…' : 'افزودن به گروه'}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}
