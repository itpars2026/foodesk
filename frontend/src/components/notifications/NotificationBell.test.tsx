import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { server } from '../../test/server'
import NotificationBell from './NotificationBell'

const base = '*/api/v1/notifications'

const notification = {
  id: 42,
  title: 'اعلان تستی',
  message: 'متن اعلان آزمایشی',
  notification_type: 'info' as const,
  starts_at: '2026-11-24T08:00:00Z',
  read_at: null as string | null,
  is_read: false,
}

function mockNotifications(
  items = [notification],
  unread = items.filter((item) => !item.is_read).length,
) {
  let count = unread

  server.use(
    http.get(`${base}/unread-count`, () =>
      HttpResponse.json({ unread_count: count }),
    ),

    http.get(base, () =>
      HttpResponse.json({
        count: items.length,
        next: null,
        previous: null,
        results: items,
      }),
    ),

    http.post(`${base}/42/read`, () => {
      count = Math.max(0, count - 1)

      return HttpResponse.json({
        ...notification,
        is_read: true,
        read_at: '2026-11-24T09:00:00Z',
      })
    }),

    http.post(`${base}/read-all`, () => {
      const markedRead = count
      count = 0

      return HttpResponse.json({
        marked_read: markedRead,
        unread_count: 0,
      })
    }),
  )
}

describe('NotificationBell', () => {
  it('shows unread count', async () => {
    mockNotifications([notification], 3)

    render(<NotificationBell />)

    expect(
      await screen.findByRole('button', {
        name: 'اعلان‌ها، 3 خوانده‌نشده',
      }),
    ).toBeInTheDocument()
  })

  it('opens and displays notifications', async () => {
    mockNotifications()

    const user = userEvent.setup()
    render(<NotificationBell />)

    await user.click(
      screen.getByRole('button', { name: /اعلان‌ها/ }),
    )

    const dialog = await screen.findByRole('dialog', {
      name: 'اعلان‌های سامانه',
    })

    expect(
      await within(dialog).findByText('اعلان تستی'),
    ).toBeInTheDocument()

    expect(
      within(dialog).getByText('متن اعلان آزمایشی'),
    ).toBeInTheDocument()
  })

  it('marks an individual notification as read', async () => {
    mockNotifications()

    const user = userEvent.setup()
    render(<NotificationBell />)

    await user.click(
      screen.getByRole('button', { name: /اعلان‌ها/ }),
    )

    const notificationButton = await screen.findByRole('button', {
      name: /اعلان تستی/,
    })

    await user.click(notificationButton)

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'اعلان‌ها' }),
      ).toBeInTheDocument()
    })

    expect(
      screen.queryByLabelText('خوانده‌نشده'),
    ).not.toBeInTheDocument()
  })

  it('marks all notifications as read', async () => {
    mockNotifications()

    const user = userEvent.setup()
    render(<NotificationBell />)

    await user.click(
      screen.getByRole('button', { name: /اعلان‌ها/ }),
    )

    await screen.findByText('اعلان تستی')

    await user.click(
      screen.getByRole('button', { name: 'خواندن همه' }),
    )

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'اعلان‌ها' }),
      ).toBeInTheDocument()
    })

    expect(
      screen.queryByLabelText('خوانده‌نشده'),
    ).not.toBeInTheDocument()
  })

  it('closes the panel when Escape is pressed', async () => {
    mockNotifications()

    const user = userEvent.setup()
    render(<NotificationBell />)

    await user.click(
      screen.getByRole('button', { name: /اعلان‌ها/ }),
    )

    expect(
      screen.getByRole('dialog'),
    ).toBeInTheDocument()

    await user.keyboard('{Escape}')

    expect(
      screen.queryByRole('dialog'),
    ).not.toBeInTheDocument()
  })

  it('shows API errors instead of a misleading empty state', async () => {
    server.use(
      http.get(`${base}/unread-count`, () =>
        HttpResponse.json({ unread_count: 0 }),
      ),
      http.get(base, () =>
        HttpResponse.json(
          { detail: 'Server error' },
          { status: 500 },
        ),
      ),
    )

    const user = userEvent.setup()
    render(<NotificationBell />)

    await user.click(
      screen.getByRole('button', { name: /اعلان‌ها/ }),
    )

    expect(
      await screen.findByRole('alert'),
    ).toHaveTextContent('دریافت اعلان‌ها انجام نشد')

    expect(
      screen.queryByText('اعلانی برای نمایش وجود ندارد.'),
    ).not.toBeInTheDocument()
  })
})
