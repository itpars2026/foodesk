import { useState } from 'react'
import type { FormEvent } from 'react'

import { createGroup } from './api'
import type { AssignablePermission } from './api'
import { getApiMessage } from '../../utils/errors'
import ErrorMessage from '../../components/ui/ErrorMessage'

type Props = {
  permissions: AssignablePermission[]
  onCreated: () => Promise<void>
}

export default function CreateGroupForm({
  permissions,
  onCreated,
}: Props) {
  const [name, setName] = useState('')
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const permissionGroups = permissions.reduce<
    Record<string, AssignablePermission[]>
  >((groups, permission) => {
    const appLabel = permission.app_label

    if (!groups[appLabel]) {
      groups[appLabel] = []
    }

    groups[appLabel].push(permission)
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

    if (submitting) return

    const trimmedName = name.trim()

    if (!trimmedName) {
      setError('نام گروه الزامی است.')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      await createGroup({
        name: trimmedName,
        permissions: selectedIds,
      })

      setName('')
      setSelectedIds([])
      await onCreated()
    } catch (cause) {
      setError(getApiMessage(cause))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <h2 className="mb-2 mt-0 text-lg font-bold text-ink">
        ایجاد گروه سفارشی
      </h2>

      <p className="mb-5 text-sm text-muted">
        نام گروه و مجوزهای موردنیاز آن را انتخاب کنید.
      </p>

      {error && <ErrorMessage message={error} />}

      <form className="grid gap-5" onSubmit={(event) => void handleSubmit(event)}>
        <label className="grid gap-2 text-sm font-semibold text-ink">
          نام گروه
          <input
            aria-label="نام گروه جدید"
            className="min-h-11 rounded-lg border border-line bg-surface px-3 text-ink"
            maxLength={150}
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="مثلاً FoodOperator"
          />
        </label>

        <fieldset className="grid gap-4 rounded-xl border border-line p-4">
          <legend className="px-2 text-sm font-bold text-ink">
            مجوزهای گروه
          </legend>

          {Object.entries(permissionGroups).map(([appLabel, items]) => (
            <div key={appLabel} className="grid gap-2">
              <h3 className="m-0 text-sm font-semibold text-accent">
                {appLabel === 'food' ? 'مدیریت غذا' : 'مدیریت کاربران'}
              </h3>

              <div className="grid gap-2 sm:grid-cols-2">
                {(items ?? []).map((permission) => (
                  <div
                    key={permission.id}
                    className="flex items-start gap-3 rounded-lg border border-line p-3 text-sm text-ink"
                  >
                    <input
                      id={`group-permission-${permission.id}`}
                        aria-label={`${permission.name} (${permission.app_label}.${permission.codename})`}
                      type="checkbox"
                      className="mt-1 accent-accent"
                      checked={selectedIds.includes(permission.id)}
                      onChange={(event) =>
                        togglePermission(permission.id, event.target.checked)
                      }
                    />

                    <span className="min-w-0">
                      <span className="block font-medium">
                        {permission.name}
                      </span>
                      <span className="block text-xs text-muted" dir="ltr">
                        {permission.app_label}.{permission.codename}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {permissions.length === 0 && (
            <p className="text-sm text-muted">
              مجوز قابل تخصیصی دریافت نشده است.
            </p>
          )}
        </fieldset>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-muted">
            {selectedIds.length} مجوز انتخاب شده
          </span>

          <button
            type="submit"
            disabled={submitting}
            className="min-h-11 rounded-lg bg-accent px-5 text-sm font-bold text-white disabled:opacity-50"
          >
            {submitting ? 'در حال ثبت…' : 'ایجاد گروه'}
          </button>
        </div>
      </form>
    </section>
  )
}
