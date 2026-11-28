import { useState } from 'react'
import type { FormEvent } from 'react'

import { updateGroup } from './api'
import type { AssignablePermission, ManagedGroup } from './api'
import { getApiMessage } from '../../utils/errors'
import ErrorMessage from '../../components/ui/ErrorMessage'

type Props = {
  group: ManagedGroup
  permissions: AssignablePermission[]
  onSaved: () => Promise<void>
  onCancel: () => void
}

export default function EditGroupForm({
  group,
  permissions,
  onSaved,
  onCancel,
}: Props) {
  const [name, setName] = useState(group.name)
  const [selectedIds, setSelectedIds] = useState<number[]>(
    [...group.permissions],
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const permissionGroups = permissions.reduce<
    Record<string, AssignablePermission[]>
  >((groups, permission) => {
    const key = permission.app_label
    if (!groups[key]) groups[key] = []
    groups[key].push(permission)
    return groups
  }, {})

  function togglePermission(id: number, checked: boolean) {
    setSelectedIds((current) =>
      checked
        ? [...new Set([...current, id])]
        : current.filter((value) => value !== id),
    )
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (saving || group.is_system) return

    const trimmedName = name.trim()

    if (!trimmedName) {
      setError('نام گروه الزامی است.')
      return
    }

    setSaving(true)
    setError('')

    try {
      await updateGroup(group.id, {
        name: trimmedName,
        permissions: selectedIds,
      })

      await onSaved()
    } catch (cause) {
      setError(getApiMessage(cause))
    } finally {
      setSaving(false)
    }
  }

  if (group.is_system) {
    return (
      <p className="text-sm text-muted">
        گروه‌های سیستمی قابل ویرایش نیستند.
      </p>
    )
  }

  return (
    <form
      className="grid gap-4 rounded-xl border border-line bg-surface p-4"
      onSubmit={(event) => void handleSubmit(event)}
    >
      <h3 className="m-0 text-base font-bold text-ink">
        ویرایش گروه {group.name}
      </h3>

      {error && <ErrorMessage message={error} />}

      <label className="grid gap-2 text-sm font-semibold text-ink">
        نام گروه
        <input
          className="min-h-11 rounded-lg border border-line bg-surface px-3 text-ink"
          value={name}
          maxLength={150}
          required
          onChange={(event) => setName(event.target.value)}
        />
      </label>

      <fieldset className="grid gap-3 rounded-lg border border-line p-3">
        <legend className="px-2 text-sm font-bold text-ink">
          مجوزهای گروه
        </legend>

        {Object.entries(permissionGroups).map(([appLabel, items]) => (
          <section key={appLabel} className="grid gap-2">
            <h4 className="m-0 text-sm font-semibold text-accent">
              {appLabel === 'food' ? 'مدیریت غذا' : 'مدیریت کاربران'}
            </h4>

            <div className="grid gap-2 sm:grid-cols-2">
              {items.map((permission) => (
                <div
                  key={permission.id}
                  className="flex items-start gap-3 rounded-lg border border-line p-3"
                >
                  <input
                    id={`edit-group-${group.id}-permission-${permission.id}`}
                    type="checkbox"
                    checked={selectedIds.includes(permission.id)}
                    onChange={(event) =>
                      togglePermission(permission.id, event.target.checked)
                    }
                    className="mt-1 accent-accent"
                  />
                  <label
                    htmlFor={`edit-group-${group.id}-permission-${permission.id}`}
                    className="min-w-0 flex-1 cursor-pointer text-sm text-ink"
                  >
                    <span className="block font-medium">
                      {permission.name}
                    </span>
                    <span className="block text-xs text-muted" dir="ltr">
                      {permission.app_label}.{permission.codename}
                    </span>
                  </label>
                </div>
              ))}
            </div>
          </section>
        ))}
      </fieldset>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-muted">
          {selectedIds.length} مجوز انتخاب شده
        </span>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="min-h-11 rounded-lg border border-line px-4 text-sm text-ink"
          >
            انصراف
          </button>

          <button
            type="submit"
            disabled={saving}
            className="min-h-11 rounded-lg bg-accent px-4 text-sm font-bold text-white disabled:opacity-50"
          >
            {saving ? 'در حال ذخیره…' : 'ذخیره تغییرات'}
          </button>
        </div>
      </div>
    </form>
  )
}
