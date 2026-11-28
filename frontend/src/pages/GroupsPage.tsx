import { useEffect, useState } from 'react'
import { RefreshCw, Shield, Users } from 'lucide-react'

import {
  listGroups,
  listAssignablePermissions,
} from '../features/groups/api'
import type {
  ManagedGroup,
  AssignablePermission,
} from '../features/groups/api'
import CreateGroupForm from '../features/groups/CreateGroupForm'
import EditGroupForm from '../features/groups/EditGroupForm'
import DeleteGroupButton from '../features/groups/DeleteGroupButton'
import GroupMembersPanel from '../features/groups/GroupMembersPanel'
import { getApiMessage } from '../utils/errors'
import ErrorMessage from '../components/ui/ErrorMessage'
import LoadingRows from '../components/ui/LoadingRows'

export default function GroupsPage() {
  const [groups, setGroups] = useState<ManagedGroup[]>([])
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null)
  const [membersGroupId, setMembersGroupId] = useState<number | null>(null)
  const [permissions, setPermissions] = useState<AssignablePermission[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function loadData() {
    setLoading(true)
    setError('')

    try {
      const [groupRows, permissionRows] = await Promise.all([
        listGroups(),
        listAssignablePermissions(),
      ])

      setGroups(groupRows)
      setPermissions(permissionRows)
    } catch (cause) {
      setError(getApiMessage(cause))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true

    Promise.all([
      listGroups(),
      listAssignablePermissions(),
    ])
      .then(([groupRows, permissionRows]) => {
        if (!active) return
        setGroups(groupRows)
        setPermissions(permissionRows)
      })
      .catch((cause: unknown) => {
        if (active) setError(getApiMessage(cause))
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  return (
    <section className="grid min-w-0 gap-5" dir="rtl">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="mb-2 text-xs font-semibold text-accent">
            مدیریت سامانه
          </p>
          <h1 className="m-0 text-2xl font-bold text-ink">
            گروه‌ها و مجوزهای دسترسی
          </h1>
          <p className="mt-2 text-sm text-muted">
            مدیریت نقش‌های سفارشی و سطح دسترسی کاربران
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadData()}
          disabled={loading}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line bg-surface px-4 text-sm text-ink disabled:opacity-50"
        >
          <RefreshCw size={17} />
          تازه‌سازی
        </button>
      </header>

      {error && <ErrorMessage message={error} />}

      {loading ? (
        <LoadingRows />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <SummaryCard
              title="کل گروه‌ها"
              value={groups.length}
              icon="groups"
            />
            <SummaryCard
              title="گروه‌های سیستمی"
              value={groups.filter((group) => group.is_system).length}
              icon="system"
            />
            <SummaryCard
              title="گروه‌های سفارشی"
              value={groups.filter((group) => !group.is_system).length}
              icon="groups"
            />
          </div>

          <CreateGroupForm
            permissions={permissions}
            onCreated={loadData}
          />

          <section className="min-w-0 rounded-xl border border-line bg-surface p-4">
            <h2 className="mb-4 mt-0 text-lg font-bold text-ink">
              فهرست گروه‌ها
            </h2>

            {groups.length === 0 ? (
              <p className="text-sm text-muted">
                گروهی برای نمایش وجود ندارد.
              </p>
            ) : (
              <div className="grid gap-3">
                {groups.map((group) => (
                  <article
                    key={group.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-raised p-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-accent-soft p-2 text-accent">
                        {group.is_system
                          ? <Shield size={20} />
                          : <Users size={20} />}
                      </div>

                      <div>
                        <h3 className="m-0 text-sm font-bold text-ink">
                          {group.name}
                        </h3>
                        <p className="mb-0 mt-1 text-xs text-muted">
                          {group.is_system
                            ? 'گروه سیستمی'
                            : 'گروه سفارشی'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted">
                        {group.permissions.length} مجوز
                      </span>

                      <button
                        type="button"
                        className="min-h-10 rounded-lg border border-line bg-surface px-4 text-sm text-ink"
                        aria-expanded={membersGroupId === group.id}
                        onClick={() =>
                          setMembersGroupId((current) =>
                            current === group.id ? null : group.id
                          )
                        }
                      >
                        {membersGroupId === group.id
                          ? 'بستن اعضا'
                          : 'مشاهده اعضا'}
                      </button>

                      {!group.is_system && (
                        <>
                          <button
                            type="button"
                            className="min-h-10 rounded-lg border border-line bg-surface px-4 text-sm text-ink"
                            onClick={() =>
                              setEditingGroupId((current) =>
                                current === group.id ? null : group.id
                              )
                            }
                          >
                            {editingGroupId === group.id ? 'بستن ویرایش' : 'ویرایش'}
                          </button>

                          <DeleteGroupButton
                            group={group}
                            onDeleted={async () => {
                              setEditingGroupId(null)
                              await loadData()
                            }}
                          />
                        </>
                      )}
                    </div>
                    {membersGroupId === group.id && (
                      <div className="w-full">
                        <GroupMembersPanel
                          key={group.id}
                          group={group}
                        />
                      </div>
                    )}

                    {editingGroupId === group.id && !group.is_system && (
                      <div className="w-full">
                        <EditGroupForm
                          key={group.id}
                          group={group}
                          permissions={permissions}
                          onSaved={async () => {
                            await loadData()
                            setEditingGroupId(null)
                          }}
                          onCancel={() => setEditingGroupId(null)}
                        />
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}

            <p className="mb-0 mt-4 text-xs text-muted">
              {permissions.length} مجوز قابل تخصیص در سامانه شناسایی شد.
            </p>
          </section>
        </>
      )}
    </section>
  )
}

function SummaryCard({
  title,
  value,
  icon,
}: {
  title: string
  value: number
  icon: 'groups' | 'system'
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="mb-3 text-accent">
        {icon === 'system'
          ? <Shield size={21} />
          : <Users size={21} />}
      </div>
      <p className="mb-1 text-xs text-muted">{title}</p>
      <strong className="text-2xl text-ink">{value}</strong>
    </div>
  )
}
