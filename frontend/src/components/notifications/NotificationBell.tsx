import {
  Bell,
  CheckCheck,
  Info,
  AlertTriangle,
  Clock3,
  RefreshCw,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import {
  getNotifications,
  getNotificationUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
} from '../../api/endpoints'
import type { NotificationItem } from '../../api/types'

function notificationIcon(type: NotificationItem['notification_type']) {
  if (type === 'warning') return AlertTriangle
  if (type === 'reminder') return Clock3
  return Info
}

type NotificationBellProps = {
  unreadCount: number
  onUnreadCountChange: (count: number) => void
}

export default function NotificationBell({
  unreadCount,
  onUnreadCountChange,
}: NotificationBellProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const bellButtonRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const [panelPosition, setPanelPosition] = useState({
    top: 0,
    left: 12,
    width: 350,
  })
  const requestVersion = useRef(0)
  const mutationInProgress = useRef(false)
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [readingAll, setReadingAll] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    return () => {
      requestVersion.current += 1
    }
  }, [])

  function updatePanelPosition() {
    const rect = bellButtonRef.current?.getBoundingClientRect()
    if (!rect) return

    const width = Math.min(350, window.innerWidth - 24)
    const left = Math.max(
      12,
      Math.min(rect.right - width, window.innerWidth - width - 12),
    )

    setPanelPosition({
      top: rect.bottom + 10,
      left,
      width,
    })
  }

  useEffect(() => {
    if (!open) return

    panelRef.current?.focus()

    window.addEventListener('resize', updatePanelPosition)
    window.addEventListener('scroll', updatePanelPosition, true)

    const handlePointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !containerRef.current?.contains(event.target) &&
        !panelRef.current?.contains(event.target)
      ) {
        setOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        bellButtonRef.current?.focus()
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
      window.removeEventListener('resize', updatePanelPosition)
      window.removeEventListener('scroll', updatePanelPosition, true)
    }
  }, [open])

  async function refreshNotifications() {
    if (mutationInProgress.current) return

    const version = ++requestVersion.current

    setLoading(true)
    setError('')

    try {
      const [list, count] = await Promise.all([
        getNotifications(),
        getNotificationUnreadCount(),
      ])

      if (version !== requestVersion.current) return

      setItems(list.results)
      onUnreadCountChange(count.unread_count)
    } catch {
      if (version === requestVersion.current) {
        setError('دریافت اعلان‌ها انجام نشد. دوباره تلاش کنید.')
      }
    } finally {
      if (version === requestVersion.current) {
        setLoading(false)
      }
    }
  }

  function togglePanel() {
    if (open) {
      setOpen(false)
      return
    }

    updatePanelPosition()
    setOpen(true)
    void refreshNotifications()
  }

  async function readNotification(notification: NotificationItem) {
    if (notification.is_read || mutationInProgress.current) return

    mutationInProgress.current = true
    requestVersion.current += 1
    setLoading(false)
    setBusyId(notification.id)
    setError('')

    try {
      const updated = await markNotificationRead(notification.id)

      setItems((previous) =>
        previous.map((item) =>
          item.id === updated.id ? updated : item,
        ),
      )

      onUnreadCountChange(Math.max(0, unreadCount - 1))
    } catch {
      setError('ثبت وضعیت خوانده‌شدن انجام نشد.')
    } finally {
      mutationInProgress.current = false
      setBusyId(null)
    }
  }

  async function readAll() {
    if (mutationInProgress.current || unreadCount === 0) return

    mutationInProgress.current = true
    requestVersion.current += 1
    setLoading(false)
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

      onUnreadCountChange(0)
    } catch {
      setError('خواندن همه اعلان‌ها انجام نشد.')
    } finally {
      mutationInProgress.current = false
      setReadingAll(false)
    }
  }

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        ref={bellButtonRef}
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

      {open && createPortal(
        <section
          ref={panelRef}
          tabIndex={-1}
          role="dialog"
          aria-label="اعلان‌های سامانه"
          className="fixed z-50 flex flex-col overflow-hidden rounded-xl border border-line bg-surface text-ink shadow-xl"
          style={{
            top: panelPosition.top,
            left: panelPosition.left,
            width: panelPosition.width,
            maxHeight: `calc(100dvh - ${panelPosition.top + 12}px)`,
          }}
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
                disabled={loading || busyId !== null || readingAll}
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

          <div className="min-h-0 flex-1 overflow-y-auto">
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
        </section>,
        document.body,
      )}
    </div>
  )
}
