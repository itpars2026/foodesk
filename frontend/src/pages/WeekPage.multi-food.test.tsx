import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'

import type { WeeklyMenu } from '../api/types'
import { server } from '../test/server'
import { dateToIso, getWeekStart } from '../utils/date'
import WeekPage from './WeekPage'

const date = dateToIso(getWeekStart(new Date()))

const categories = [
  { id: 1, name: 'غذای اول', slug: 'type-1', sort_order: 1, is_active: true },
  { id: 2, name: 'غذای دوم', slug: 'type-2', sort_order: 2, is_active: true },
  { id: 3, name: 'غذای سوم', slug: 'type-3', sort_order: 3, is_active: true },
]

function makeMenu(index: number): WeeklyMenu {
  const category = categories[index]

  return {
    id: 101 + index,
    category,
    date,
    food_name: `غذای آزمایشی ${index + 1}`,
    food_price: 100_000 + index * 50_000,
    food_image: null,
    food_image_data: {
      url: '/static/images/defaults/default-food.webp',
      alt: `غذای آزمایشی ${index + 1}`,
    },
    reservation: null,
    can_reserve: true,
  }
}

function setup(weeklyMenus: WeeklyMenu[], onPost: (body: unknown) => void) {
  server.use(
    http.get('*/api/v1/reservations/weekly', () =>
      HttpResponse.json(weeklyMenus),
    ),
    http.get('*/api/v1/menu-categories', () =>
      HttpResponse.json(categories),
    ),
    http.get('*/api/v1/sides', () => HttpResponse.json([])),
    http.get('*/api/v1/drinks', () => HttpResponse.json([])),
    http.get('*/api/v1/auth/profile', () =>
      HttpResponse.json({
        personnel_number: '1001',
        building: 7,
        building_number: '07',
        department: null,
        department_number: null,
      }),
    ),
    http.get('*/api/v1/auth/profile-options', () =>
      HttpResponse.json({
        buildings: [{ id: 7, number: '07' }],
        departments: [],
      }),
    ),
    http.post('*/api/v1/reservations', async ({ request }) => {
      onPost(await request.json())
      return HttpResponse.json([], { status: 201 })
    }),
  )
}

describe('WeekPage multiple main food reservations', () => {
  it.each([2, 3])(
    'submits %i selected foods in one batch request',
    async (count) => {
      const user = userEvent.setup()
      let submittedBody: unknown = null
      let postCount = 0

      setup(
        Array.from({ length: count }, (_, index) => makeMenu(index)),
        (body) => {
          submittedBody = body
          postCount += 1
        },
      )

      render(<WeekPage />)

      await user.click(
        await screen.findByRole('button', { name: 'انتخاب غذا' }),
      )

      await waitFor(() => {
        expect(
          screen.getByRole('combobox', {
            name: 'ساختمان محل تحویل',
          }),
        ).toHaveValue('7')
      })

      for (let index = 0; index < count; index++) {
        const checkbox = screen.getByRole('checkbox', {
          name: `انتخاب غذای ${[
            'اول',
            'دوم',
            'سوم',
          ][index]}: غذای آزمایشی ${index + 1}`,
        })

        expect(checkbox).toBeEnabled()

        if (index > 0) {
          await user.click(checkbox)
        }

        expect(checkbox).toBeChecked()
      }

      await user.click(
        screen.getByRole('button', {
          name: `ثبت ${count} غذا`,
        }),
      )

      await waitFor(() => {
        expect(postCount).toBe(1)
      })

      expect(submittedBody).toEqual({
        reservations: Array.from(
          { length: count },
          (_, index) => ({
            menu: 101 + index,
            building: 7,
            food_quantity: 1,
            sides: [],
            drinks: [],
          }),
        ),
      })
    },
  )

  it('does not submit an already reserved food again', async () => {
    const user = userEvent.setup()
    let submittedBody: unknown = null
    let postCount = 0

    const alreadyReserved: WeeklyMenu = {
      ...makeMenu(2),
      reservation: {
        id: 900,
        status: 'res',
        current_item: null,
      } as WeeklyMenu['reservation'],
    }

    setup(
      [makeMenu(0), makeMenu(1), alreadyReserved],
      (body) => {
        submittedBody = body
        postCount += 1
      },
    )

    render(<WeekPage />)

    await user.click(
      await screen.findByRole('button', { name: 'انتخاب غذا' }),
    )

    await waitFor(() => {
      expect(
        screen.getByRole('combobox', {
          name: 'ساختمان محل تحویل',
        }),
      ).toHaveValue('7')
    })

    const reservedCheckbox = screen.getByRole('checkbox', {
      name: 'انتخاب غذای سوم: غذای آزمایشی 3',
    })

    expect(reservedCheckbox).toBeChecked()
    expect(reservedCheckbox).toBeDisabled()

    await user.click(
      screen.getByRole('checkbox', {
        name: 'انتخاب غذای دوم: غذای آزمایشی 2',
      }),
    )

    await user.click(
      screen.getByRole('button', { name: 'ثبت 2 غذا' }),
    )

    await waitFor(() => {
      expect(postCount).toBe(1)
    })

    expect(submittedBody).toEqual({
      reservations: [
        {
          menu: 101,
          building: 7,
          food_quantity: 1,
          sides: [],
          drinks: [],
        },
        {
          menu: 102,
          building: 7,
          food_quantity: 1,
          sides: [],
          drinks: [],
        },
      ],
    })
  })
})
