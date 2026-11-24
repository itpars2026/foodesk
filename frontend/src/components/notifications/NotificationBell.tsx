import {
  Bell,
  CheckCheck,
  Info,
  AlertTriangle,
  Clock3,
  RefreshCw,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import {
  getNotifications,
  getNotificationUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
} from '../../api/endpoints'
import type { NotificationItem } from '../../api/types'

const NOTIFICATIONS_UPDATED_EVENT = 'foodesk:notifications-updated'

function notificationIcon(type: NotificationItem['notification_type']) {
  if (type === 'warning') return AlertTriangle
  if (type === 'reminder') return Clock3
  return Info
}

export default function NotificationBell() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [readingAll, setReadingAll] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true

    const refresh = () => {
      getNotificationUnreadCount()
        .then((result) => {
          if (mounted) setUnreadCount(result.unread_count)
        })
        .catch(() => {
          // A transient error must not interrupt the application shell.
        })
    }

    const refreshWhenVisible = () => {
      if (!document.hidden) refresh()
    }

    refresh()

    window.addEventListener('focus', refresh)
    window.addEventListener(NOTIFICATIONS_UPDATED_EVENT, refresh)
    document.addEventListener('visibilitychange', refreshWhenVisible)

    return () => {
      mounted = false
      window.removeEventListener('focus', refresh)
      window.removeEventListener(NOTIFICATIONS_UPDATED_EVENT, refresh)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [])

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !containerRef.current?.contains(event.target)
      ) {
        setOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  async function refreshNotifications() {
    setLoading(true)
    setError('')

    try {
      const [list, count] = await Promise.all([
        getNotifications(),
        getNotificationUnreadCount(),
      ])

      setItems(list.results)
      setUnreadCount(count.unread_count)
    } catch {
      setError('دریافت اعلان‌ها انجام نشد. دوباره تلاش کنید.')
    } finally {
      setLoading(false)
    }
  }

  function togglePanel() {
    if (open) {
      setOpen(false)
      return
    }

    setOpen(true)
    void refreshNotifications()
  }

  async function readNotification(notification: NotificationItem) {
    if (notification.is_read || busyId !== null || readingAll) return

    setBusyId(notification.id)
    setError('')

    try {
      const updated = await markNotificationRead(notification.id)

      setItems((previous) =>
        previous.map((item) =>
          item.id === updated.id ? updated : item,
        ),
      )

      setUnreadCount((previous) => Math.max(0, previous - 1))
      window.dispatchEvent(new Event(NOTIFICATIONS_UPDATED_EVENT))
    } catch {
      setError('ثبت وضعیت خوانده‌شدن انجام نشد.')
    } finally {
      setBusyId(null)
    }
  }

  async function readAll() {
    if (readingAll || busyId !== null || unreadCount === 0) return

    setReadingAll(true)
    setError('')

    try {
      await markAllNotificationsRead()

      setItems((previous) =>
        previous.map((item) => ({
          ...item,
          is_read: true,
          read_at: item.read_at ?? new Date().toISOString(),
        })),
      )

      setUnreadCount(0)
      window.dispatchEvent(new Event(NOTIFICATIONS_UPDATED_EVENT))
    } catch {
      setError('خواندن همه اعلان‌ها انجام نشد.')
    } finally {
      setReadingAll(false)
    }
  }

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={togglePanel}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface text-ink transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        aria-label={
          unreadCount > 0
            ? `اعلان‌ها، ${unreadCount} خوانده‌نشده`
            : 'اعلان‌ها'
        }
        aria-haspopup="dialog"
        aria-expanded={open}
        title="اعلان‌ها"
      >
        <Bell size={19} aria-hidden="true" />

        {unreadCount > 0 && (
          <span
            className="absolute -top-1 -end-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-negative px-1 text-[10px] font-bold leading-none text-white"
            aria-hidden="true"
          >
            {unreadCount > 99 ? '۹۹+' : unreadCount.toLocaleString('fa-IR')}
          </span>
        )}
      </button>

      {open && (
        <section
          role="dialog"
          aria-label="اعلان‌های سامانه"
          className="absolute end-0 top-[calc(100%+10px)] z-50 w-[min(350px,calc(100vw-24px))] overflow-hidden rounded-xl border border-line bg-surface text-ink shadow-xl"
        >
          <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
            <div className="flex items-center gap-2">
              <Bell size={17} aria-hidden="true" />
              <strong className="text-sm">اعلان‌ها</strong>
              {unreadCount > 0 && (
                <span className="text-xs text-muted">
                  {unreadCount.toLocaleString('fa-IR')} خوانده‌نشده
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void refreshNotifications()}
                disabled={loading}
                aria-label="به‌روزرسانی اعلان‌ها"
                title="به‌روزرسانی"
                className="rounded-md p-1.5 text-muted hover:bg-raised disabled:opacity-50"
              >
                <RefreshCw size={16} aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={() => void readAll()}
                disabled={readingAll || loading || unreadCount === 0}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs text-accent hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50"
              >
                <CheckCheck size={15} aria-hidden="true" />
                خواندن همه
              </button>
            </div>
          </div>

          {error && (
            <p role="alert" className="mx-3 mt-3 rounded-lg bg-raised p-3 text-xs text-negative">
              {error}
            </p>
          )}

          <div className="max-h-[min(420px,65vh)] overflow-y-auto">
            {loading ? (
              <p className="p-6 text-center text-sm text-muted">
                در حال دریافت اعلان‌ها...
              </p>
            ) : error && items.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <button
                  type="button"
                  onClick={() => void refreshNotifications()}
                  className="rounded-lg border border-line px-4 py-2 text-xs text-accent hover:bg-raised"
                >
                  تلاش مجدد
                </button>
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-9 text-center text-muted">
                <Bell size={26} aria-hidden="true" />
                <p className="text-sm">اعلانی برای نمایش وجود ندارد.</p>
              </div>
            ) : (
              <ul className="m-0 list-none p-0">
                {items.map((item) => {
                  const Icon = notificationIcon(item.notification_type)

                  return (
                    <li key={item.id} className="border-b border-line last:border-b-0">
                      <button
                        type="button"
                        disabled={busyId !== null || readingAll}
                        onClick={() => void readNotification(item)}
                        className={`flex w-full items-start gap-3 px-4 py-3 text-right transition-colors hover:bg-raised disabled:cursor-default ${
                          item.is_read ? '' : 'bg-accent-soft/40'
                        }`}
                      >
                        <Icon
                          size={18}
                          className="mt-0.5 shrink-0 text-accent"
                          aria-hidden="true"
                        />

                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <strong className="text-sm font-semibold">
                              {item.title}
                            </strong>

                            {!item.is_read && (
                              <span
                                className="h-2 w-2 shrink-0 rounded-full bg-accent"
                                aria-label="خوانده‌نشده"
                              />
                            )}
                          </span>

                          <span className="mt-1 block whitespace-pre-line text-xs leading-6 text-muted">
                            {item.message}
                          </span>

                          <span className="mt-1 block text-[11px] text-muted">
                            {new Date(item.starts_at).toLocaleDateString(
                              'fa-IR-u-ca-persian',
                              { dateStyle: 'medium' },
                            )}
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
