import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'

import GroupsPage from './GroupsPage'
import type { ManagedGroup } from '../features/groups/api'
import { server } from '../test/server'

describe('GroupsPage', () => {
  it('creates a custom group with selected permissions and refreshes the list', async () => {
    let groups: ManagedGroup[] = [
      {
        id: 1,
        name: 'Employee',
        permissions: [],
        is_system: true,
      },
    ]

    const requests: unknown[] = []
    const listSpy = vi.fn()

    server.use(
      http.get('*/api/v1/groups', () => {
        listSpy()
        return HttpResponse.json(groups)
      }),

      http.get('*/api/v1/permissions', () =>
        HttpResponse.json([
          {
            id: 10,
            app_label: 'food',
            codename: 'add_food',
            name: 'Can add food',
          },
        ])
      ),

      http.post('*/api/v1/groups', async ({ request }) => {
        const payload = await request.json()
        requests.push(payload)

        const created = {
          id: 2,
          name: 'FoodOperator',
          permissions: [10],
          is_system: false,
        }

        groups = [...groups, created]

        return HttpResponse.json(created, { status: 201 })
      }),
    )

    render(<GroupsPage />)

    expect(
      await screen.findByText('Employee')
    ).toBeInTheDocument()

    const user = userEvent.setup()

    await user.type(
      screen.getByRole('textbox', { name: 'نام گروه جدید' }),
      'FoodOperator',
    )

    await user.click(
      screen.getByRole('checkbox', {
        name: /Can add food/,
      }),
    )

    await user.click(
      screen.getByRole('button', { name: 'ایجاد گروه' }),
    )

    await waitFor(() => {
      expect(requests).toEqual([
        {
          name: 'FoodOperator',
          permissions: [10],
        },
      ])
    })

    expect(
      await screen.findByText('FoodOperator')
    ).toBeInTheDocument()

    expect(listSpy.mock.calls.length).toBeGreaterThanOrEqual(2)
  })
})


describe('GroupsPage editing', () => {
  it('edits a custom group and its permissions, but not a system group', async () => {
    let groups: ManagedGroup[] = [
      {
        id: 1,
        name: 'Employee',
        permissions: [],
        is_system: true,
      },
      {
        id: 2,
        name: 'FoodOperator',
        permissions: [10],
        is_system: false,
      },
    ]

    const patches: unknown[] = []

    server.use(
      http.get('*/api/v1/groups', () =>
        HttpResponse.json(groups)
      ),
      http.get('*/api/v1/permissions', () =>
        HttpResponse.json([
          {
            id: 10,
            app_label: 'food',
            codename: 'add_food',
            name: 'Can add food',
          },
          {
            id: 11,
            app_label: 'food',
            codename: 'change_food',
            name: 'Can change food',
          },
        ])
      ),
      http.patch('*/api/v1/groups/2', async ({ request }) => {
        const payload = await request.json()
        patches.push(payload)

        groups = groups.map((group) =>
          group.id === 2
            ? {
                ...group,
                name: 'FoodEditor',
                permissions: [11],
              }
            : group
        )

        return HttpResponse.json(groups[1])
      }),
    )

    render(<GroupsPage />)

    const employee = await screen.findByText('Employee')
    const employeeRow = employee.closest('article')

    expect(employeeRow).not.toBeNull()
    expect(
      within(employeeRow as HTMLElement).queryByRole('button', {
        name: 'ویرایش',
      })
    ).not.toBeInTheDocument()

    const customGroup = screen.getByText('FoodOperator')
    const customRow = customGroup.closest('article')

    expect(customRow).not.toBeNull()

    const user = userEvent.setup()

    await user.click(
      within(customRow as HTMLElement).getByRole('button', {
        name: 'ویرایش',
      })
    )

    const editForm = screen.getByRole('heading', {
      name: 'ویرایش گروه FoodOperator',
    }).closest('form')

    expect(editForm).not.toBeNull()

    const form = within(editForm as HTMLFormElement)

    const addFood = form.getByRole('checkbox', {
      name: /Can add food/,
    })
    const changeFood = form.getByRole('checkbox', {
      name: /Can change food/,
    })

    expect(addFood).toBeChecked()
    expect(changeFood).not.toBeChecked()

    await user.click(addFood)
    await user.click(changeFood)

    const nameInput = form.getByRole('textbox', {
      name: 'نام گروه',
    })

    await user.clear(nameInput)
    await user.type(nameInput, 'FoodEditor')

    await user.click(
      form.getByRole('button', { name: 'ذخیره تغییرات' })
    )

    await waitFor(() => {
      expect(patches).toEqual([
        {
          name: 'FoodEditor',
          permissions: [11],
        },
      ])
    })

    expect(
      await screen.findByText('FoodEditor')
    ).toBeInTheDocument()

    expect(
      screen.queryByText('FoodOperator')
    ).not.toBeInTheDocument()
  })
})
