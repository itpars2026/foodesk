import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Bell, Send } from 'lucide-react'
import { api } from '../../api/client'
import { getSession } from '../../api/endpoints'
import { buttonClass } from '../../components/ui/buttonStyles'
import ErrorMessage from '../../components/ui/ErrorMessage'
import { getApiMessage } from '../../utils/errors'

type NotificationType = 'info' | 'reminder' | 'warning'

type TargetRole = {
  name: string
}

type CreateResponse = {
  id: number
  title: string
  recipient_count: number
  send_to_all: boolean
  role_names: string[]
}

const roleLabels: Record<string, string> = {
  Employee: 'کارمند',
  hrFood: 'مسئول تغذیه',
  Viewer: 'مشاهده‌گر',
}

const fieldClass =
  'min-h-11 w-full rounded-lg border border-line bg-surface px-3 py-2 text-ink'

export default function NotificationManagement() {
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [initializing, setInitializing] = useState(true)
  const [initializationFailed, setInitializationFailed] = useState(false)
  const [roles, setRoles] = useState<TargetRole[]>([])
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [notificationType, setNotificationType] =
    useState<NotificationType>('info')
  const [sendToAll, setSendToAll] = useState(true)
  const [selectedRoles, setSelectedRoles] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    let active = true

    async function initialize() {
      try {
        const session = await getSession()

        if (!active) return

        if (!('is_superuser' in session)) {
          throw new Error('نشست کاربری معتبر نیست.')
        }

        if (session.is_superuser) {
          const availableRoles = await api<TargetRole[]>(
            '/notifications/manage/roles',
          )

          if (!active) return

          setRoles(availableRoles)
          setIsSuperAdmin(true)
        }
      } catch (cause) {
        if (active) {
          setInitializationFailed(true)
          setError(getApiMessage(cause))
        }
      } finally {
        if (active) setInitializing(false)
      }
    }

    void initialize()

    return () => {
      active = false
    }
  }, [])

  function toggleRole(roleName: string) {
    setSelectedRoles((current) =>
      current.includes(roleName)
        ? current.filter((name) => name !== roleName)
        : [...current, roleName],
    )
  }

  async function createNotification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (submitting || initializing) return

    setError('')
    setSuccess('')

    if (isSuperAdmin && !sendToAll && selectedRoles.length === 0) {
      setError('حداقل یک نقش دریافت‌کننده انتخاب کن.')
      return
    }

    setSubmitting(true)

    try {
      const payload = {
        title: title.trim(),
        message: message.trim(),
        notification_type: notificationType,
        send_to_all: isSuperAdmin ? sendToAll : true,
        ...(isSuperAdmin && !sendToAll
          ? { role_names: selectedRoles }
          : {}),
      }

      const result = await api<CreateResponse>(
        '/notifications/manage',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      )

      setSuccess(
        `اعلان «${result.title}» با موفقیت برای ${result.recipient_count.toLocaleString('fa-IR')} کاربر ثبت شد.`,
      )

      setTitle('')
      setMessage('')
      setNotificationType('info')
      setSendToAll(true)
      setSelectedRoles([])
    } catch (cause) {
      setError(getApiMessage(cause))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <details className="relative min-w-0 rounded-xl border border-line bg-surface">
      <summary className="flex cursor-pointer items-center gap-3 bg-accent-soft px-5 py-5 text-base font-bold text-accent hover:bg-active dark:bg-active">
        <Bell size={19} aria-hidden="true" />
        مدیریت اعلان‌ها
      </summary>

      <div className="grid gap-4 bg-raised p-4">
        <p className="m-0 text-sm leading-7 text-muted">
          اطلاعیه‌های سازمانی را برای کاربران سامانه منتشر کن.
        </p>

        {error && <ErrorMessage message={error} />}

        {success && (
          <p
            role="status"
            className="rounded-lg border border-line bg-surface p-3 text-sm leading-7 text-ink"
          >
            {success}
          </p>
        )}

        {initializing ? (
          <p role="status" className="text-sm text-muted">
            در حال دریافت اطلاعات دسترسی...
          </p>
        ) : initializationFailed ? (
          <p role="alert" className="text-sm text-muted">
            اطلاعات دسترسی بارگذاری نشد. صفحه را دوباره بارگذاری کن.
          </p>
        ) : (
          <form
            className="grid gap-4"
            onSubmit={(event) => void createNotification(event)}
          >
            <label className="grid gap-2 text-sm font-semibold text-ink">
              عنوان اعلان
              <input
                className={fieldClass}
                maxLength={200}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="مثلاً اطلاعیه تغییر برنامه غذایی"
                required
                value={title}
              />
            </label>

            <label className="grid gap-2 text-sm font-semibold text-ink">
              متن اعلان
              <textarea
                className={`${fieldClass} min-h-32 resize-y`}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="متن کامل اطلاعیه را وارد کن..."
                required
                rows={5}
                value={message}
              />
            </label>

            <label className="grid gap-2 text-sm font-semibold text-ink">
              نوع اعلان
              <select
                className={fieldClass}
                onChange={(event) =>
                  setNotificationType(
                    event.target.value as NotificationType,
                  )
                }
                value={notificationType}
              >
                <option value="info">اطلاع‌رسانی</option>
                <option value="reminder">یادآوری</option>
                <option value="warning">هشدار</option>
              </select>
            </label>

            {isSuperAdmin ? (
              <fieldset className="grid gap-3 rounded-xl border border-line bg-surface p-4">
                <legend className="px-2 text-sm font-bold text-ink">
                  دریافت‌کنندگان
                </legend>

                <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
                  <input
                    type="radio"
                    name="notification-audience"
                    checked={sendToAll}
                    onChange={() => setSendToAll(true)}
                  />
                  تمام کاربران فعال
                </label>

                <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
                  <input
                    type="radio"
                    name="notification-audience"
                    checked={!sendToAll}
                    onChange={() => setSendToAll(false)}
                  />
                  نقش‌های مشخص
                </label>

                {!sendToAll && (
                  <div className="grid gap-3 border-t border-line pt-3">
                    {roles.length === 0 && (
                      <p className="text-sm text-muted">
                        نقشی برای انتخاب یافت نشد.
                      </p>
                    )}

                    {roles.map((role) => (
                      <label
                        key={role.name}
                        className="flex cursor-pointer items-center gap-2 text-sm text-ink"
                      >
                        <input
                          type="checkbox"
                          checked={selectedRoles.includes(role.name)}
                          onChange={() => toggleRole(role.name)}
                        />
                        {roleLabels[role.name] ?? role.name}
                      </label>
                    ))}
                  </div>
                )}
              </fieldset>
            ) : (
              <p className="m-0 rounded-lg border border-line bg-surface p-3 text-sm text-muted">
                این اعلان برای تمام کاربران فعال سامانه ارسال می‌شود.
              </p>
            )}

            <div className="flex justify-end">
              <button
                className={buttonClass('primary', '')}
                disabled={
                  submitting ||
                  !title.trim() ||
                  !message.trim() ||
                  (isSuperAdmin &&
                    !sendToAll &&
                    selectedRoles.length === 0)
                }
                type="submit"
              >
                <span className="inline-flex items-center gap-2">
                  <Send size={17} aria-hidden="true" />
                  {submitting ? 'در حال ثبت...' : 'ثبت و انتشار اعلان'}
                </span>
              </button>
            </div>
          </form>
        )}
      </div>
    </details>
  )
}
