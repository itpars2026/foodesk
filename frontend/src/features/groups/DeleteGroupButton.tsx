import { useState } from 'react'

import { deleteGroup } from './api'
import type { ManagedGroup } from './api'
import { getApiMessage } from '../../utils/errors'

type Props = {
  group: ManagedGroup
  onDeleted: () => Promise<void>
}

export default function DeleteGroupButton({ group, onDeleted }: Props) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  if (group.is_system) return null

  async function handleDelete() {
    if (!confirming || deleting || group.is_system) return

    setDeleting(true)
    setError('')

    try {
      await deleteGroup(group.id)
      await onDeleted()
      setConfirming(false)
    } catch (cause) {
      setError(getApiMessage(cause))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="grid gap-2">
      {!confirming ? (
        <button
          type="button"
          className="min-h-10 rounded-lg border border-negative px-4 text-sm text-negative"
          onClick={() => setConfirming(true)}
        >
          حذف گروه
        </button>
      ) : (
        <div className="grid gap-2 rounded-lg border border-negative p-3">
          <p className="m-0 text-sm text-ink">
            گروه «{group.name}» حذف شود؟ این عملیات عضویت کاربران
            در این گروه را نیز از بین می‌برد.
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={deleting}
              className="min-h-10 rounded-lg bg-negative px-4 text-sm text-white disabled:opacity-50"
              onClick={() => void handleDelete()}
            >
              {deleting ? 'در حال حذف…' : 'تأیید حذف'}
            </button>

            <button
              type="button"
              disabled={deleting}
              className="min-h-10 rounded-lg border border-line px-4 text-sm text-ink"
              onClick={() => setConfirming(false)}
            >
              انصراف
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="m-0 text-sm text-negative">
          {error}
        </p>
      )}
    </div>
  )
}
