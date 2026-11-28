import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'

import GroupMembersPanel from './GroupMembersPanel'
import type { ManagedGroup } from './api'
import { server } from '../../test/server'

const customGroup: ManagedGroup = {
  id: 2,
  name: 'FoodOperator',
  permissions: [],
  is_system: false,
}

const employee = {
  id: 42,
  personnel_number: '001234',
  first_name: 'Ali',
  last_name: 'Ahmadi',
  is_active: true,
}

const member = {
  id: 42,
  username: '001234',
  first_name: 'Ali',
  last_name: 'Ahmadi',
  is_active: true,
}

describe('GroupMembersPanel', () => {
  it('shows existing members', async () => {
    server.use(
      http.get('*/api/v1/groups/2/members', () =>
        HttpResponse.json([member])
      ),
      http.get('*/api/v1/employees', () =>
        HttpResponse.json([employee])
      ),
    )

    render(<GroupMembersPanel group={customGroup} />)

    expect(
      await screen.findByText('Ali Ahmadi')
    ).toBeInTheDocument()

    expect(screen.getByText('001234')).toBeInTheDocument()

    expect(
      screen.getByRole('button', { name: 'حذف عضویت' })
    ).toBeInTheDocument()
  })

  it('searches by personnel number and adds the numeric user id', async () => {
    let members: typeof member[] = []
    const addSpy = vi.fn()

    server.use(
      http.get('*/api/v1/groups/2/members', () =>
        HttpResponse.json(members)
      ),
      http.get('*/api/v1/employees', () =>
        HttpResponse.json([employee])
      ),
      http.post('*/api/v1/groups/2/members', async ({ request }) => {
        const payload = await request.json()
        addSpy(payload)
        members = [member]

        return HttpResponse.json({
          group_id: 2,
          user_id: 42,
          added: true,
        })
      }),
    )

    render(<GroupMembersPanel group={customGroup} />)

    const user = userEvent.setup()

    const search = await screen.findByRole('searchbox', {
      name: /جست‌وجوی کاربر/,
    })

    await user.type(search, '001234')

    await user.click(
      screen.getByRole('button', {
        name: /001234.*Ali Ahmadi/,
      })
    )

    await user.click(
      screen.getByRole('button', { name: 'افزودن به گروه' })
    )

    await waitFor(() => {
      expect(addSpy).toHaveBeenCalledWith({ user_id: 42 })
    })

    expect(
      await screen.findByText('Ali Ahmadi')
    ).toBeInTheDocument()
  })

  it('removes membership without deleting the employee', async () => {
    let members: typeof member[] = [member]
    const removeSpy = vi.fn()

    server.use(
      http.get('*/api/v1/groups/2/members', () =>
        HttpResponse.json(members)
      ),
      http.get('*/api/v1/employees', () =>
        HttpResponse.json([employee])
      ),
      http.delete('*/api/v1/groups/2/members/42', () => {
        removeSpy()
        members = []
        return new HttpResponse(null, { status: 204 })
      }),
    )

    render(<GroupMembersPanel group={customGroup} />)

    const user = userEvent.setup()

    await screen.findByText('Ali Ahmadi')

    await user.click(
      screen.getByRole('button', { name: 'حذف عضویت' })
    )

    await waitFor(() => {
      expect(removeSpy).toHaveBeenCalledTimes(1)
    })

    expect(
      await screen.findByText('این گروه عضوی ندارد.')
    ).toBeInTheDocument()
  })

  it('keeps system groups read-only', async () => {
    const employeeRequest = vi.fn()

    server.use(
      http.get('*/api/v1/groups/1/members', () =>
        HttpResponse.json([member])
      ),
      http.get('*/api/v1/employees', () => {
        employeeRequest()
        return HttpResponse.json([employee])
      }),
    )

    render(
      <GroupMembersPanel
        group={{
          id: 1,
          name: 'Employee',
          permissions: [],
          is_system: true,
        }}
      />
    )

    expect(
      await screen.findByText('Ali Ahmadi')
    ).toBeInTheDocument()

    expect(
      screen.queryByRole('button', { name: 'حذف عضویت' })
    ).not.toBeInTheDocument()

    expect(
      screen.queryByRole('button', { name: 'افزودن به گروه' })
    ).not.toBeInTheDocument()

    expect(employeeRequest).not.toHaveBeenCalled()
  })

  it('shows an error when adding a member fails', async () => {
    server.use(
      http.get('*/api/v1/groups/2/members', () =>
        HttpResponse.json([])
      ),
      http.get('*/api/v1/employees', () =>
        HttpResponse.json([employee])
      ),
      http.post('*/api/v1/groups/2/members', () =>
        HttpResponse.json(
          { detail: 'Membership update denied.' },
          { status: 400 },
        )
      ),
    )

    render(<GroupMembersPanel group={customGroup} />)

    const user = userEvent.setup()

    await user.type(
      await screen.findByRole('searchbox', {
        name: /جست‌وجوی کاربر/,
      }),
      '001234'
    )

    await user.click(
      screen.getByRole('button', {
        name: /001234.*Ali Ahmadi/,
      })
    )

    await user.click(
      screen.getByRole('button', { name: 'افزودن به گروه' })
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Membership update denied.'
    )
  })
})


describe('GroupMembersPanel partial loading failure', () => {
  it('shows existing members when the employee list fails', async () => {
    server.use(
      http.get('*/api/v1/groups/2/members', () =>
        HttpResponse.json([member])
      ),
      http.get('*/api/v1/employees', () =>
        HttpResponse.json(
          { detail: 'Employee service unavailable.' },
          { status: 503 },
        )
      ),
    )

    render(<GroupMembersPanel group={customGroup} />)

    expect(
      await screen.findByText('Ali Ahmadi')
    ).toBeInTheDocument()

    expect(
      screen.getByText('001234')
    ).toBeInTheDocument()

    expect(
      await screen.findByRole('alert')
    ).toHaveTextContent(
      'اعضای گروه دریافت شدند، اما فهرست کارکنان بارگذاری نشد.'
    )
  })
})


describe('GroupMembersPanel membership safety', () => {
  it('blocks membership changes when loading members fails', async () => {
    const addSpy = vi.fn()
    const removeSpy = vi.fn()

    server.use(
      http.get('*/api/v1/groups/2/members', () =>
        HttpResponse.json(
          { detail: 'Member service unavailable.' },
          { status: 503 },
        )
      ),
      http.get('*/api/v1/employees', () =>
        HttpResponse.json([employee])
      ),
      http.post('*/api/v1/groups/2/members', () => {
        addSpy()
        return HttpResponse.json({ added: true })
      }),
      http.delete('*/api/v1/groups/2/members/42', () => {
        removeSpy()
        return new HttpResponse(null, { status: 204 })
      }),
    )

    render(<GroupMembersPanel group={customGroup} />)

    expect(
      await screen.findByText(
        'دریافت اعضای گروه ناموفق بود. تغییر عضویت امکان‌پذیر نیست.'
      )
    ).toBeInTheDocument()

    expect(
      screen.getByRole('alert')
    ).toHaveTextContent('Member service unavailable.')

    expect(
      screen.queryByRole('button', { name: 'افزودن به گروه' })
    ).not.toBeInTheDocument()

    expect(
      screen.queryByRole('button', { name: 'حذف عضویت' })
    ).not.toBeInTheDocument()

    expect(
      screen.queryByRole('searchbox')
    ).not.toBeInTheDocument()

    expect(addSpy).not.toHaveBeenCalled()
    expect(removeSpy).not.toHaveBeenCalled()
  })
})
