import { describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'

import CatalogPage from './CatalogPage'
import type { User } from '../api/types'
import { server } from '../test/server'

const baseUser: User = {
  id: 1,
  username: '1001',
  first_name: 'Test',
  last_name: 'User',
  is_active: true,
  is_superuser: false,
  must_change_password: false,
  roles: [],
  permissions: [],
}

const food = {
  id: 1,
  name: 'غذای آزمایشی',
  price: 100000,
  container_price: 10000,
  total_price: 110000,
  image: null,
  image_data: {
    url: '/static/images/defaults/default-food.webp',
    alt: 'تصویر غذا',
  },
}

async function renderCatalog(overrides: Partial<User>) {
  server.use(
    http.get('*/api/v1/foods', () =>
      HttpResponse.json([food])
    ),
    http.get('*/api/v1/sides', () =>
      HttpResponse.json([])
    ),
    http.get('*/api/v1/drinks', () =>
      HttpResponse.json([])
    ),
    http.get('*/api/v1/menu-categories', () =>
      HttpResponse.json([
        {
          id: 1,
          name: 'ایرانی',
          slug: 'iranian',
          sort_order: 1,
          is_active: true,
        },
      ])
    ),
  )

  render(
    <CatalogPage user={{ ...baseUser, ...overrides }} />
  )

  await screen.findByText('کاتالوگ موجود')
}

describe('CatalogPage permission visibility', () => {
  it('shows only food creation for add_food permission', async () => {
    await renderCatalog({
      permissions: ['food.add_food'],
    })

    expect(screen.queryAllByText('افزودن غذا').length)
      .toBeGreaterThan(0)

    expect(screen.queryAllByText('ثبت منوی روز'))
      .toHaveLength(0)

    expect(screen.queryAllByText('افزودن گزینهٔ جانبی'))
      .toHaveLength(0)

    expect(screen.queryAllByText('مدیریت اعلان‌ها'))
      .toHaveLength(0)
  })

  it('offers only drinks when add_drink is granted', async () => {
    await renderCatalog({
      permissions: ['food.add_drink'],
    })

    expect(screen.queryAllByText('افزودن گزینهٔ جانبی').length)
      .toBeGreaterThan(0)

    const user = userEvent.setup()

    await user.click(
      screen.getByText('افزودن گزینهٔ جانبی', {
        selector: 'summary',
      })
    )

    expect(
      screen.getByRole('option', { name: 'نوشیدنی' })
    ).toBeInTheDocument()

    expect(
      screen.queryByRole('option', { name: 'پیش‌غذا' })
    ).not.toBeInTheDocument()
  })

  it('allows editing food without displaying creation forms', async () => {
    await renderCatalog({
      permissions: ['food.change_food'],
    })

    expect(screen.queryAllByText('افزودن غذا'))
      .toHaveLength(0)

    expect(screen.queryAllByText('ثبت منوی روز'))
      .toHaveLength(0)

    expect(screen.queryAllByText('افزودن گزینهٔ جانبی'))
      .toHaveLength(0)

    const user = userEvent.setup()

    await user.click(
      screen.getByText('فهرست کاتالوگ', {
        selector: 'summary',
      })
    )

    await user.click(screen.getByText('غذاها (1)'))

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'ویرایش' })
      ).toBeInTheDocument()
    })
  })

  it('hides notification management from custom food operators', async () => {
    await renderCatalog({
      roles: ['FoodOperator'],
      permissions: ['food.add_food', 'food.change_food'],
    })

    expect(screen.queryAllByText('مدیریت اعلان‌ها'))
      .toHaveLength(0)
  })

  it('shows notification management for hrFood without catalog permissions', async () => {
    await renderCatalog({
      roles: ['hrFood'],
      permissions: [],
    })

    expect(screen.queryAllByText('مدیریت اعلان‌ها').length)
      .toBeGreaterThan(0)

    expect(screen.queryAllByText('افزودن غذا'))
      .toHaveLength(0)

    expect(screen.queryAllByText('ثبت منوی روز'))
      .toHaveLength(0)
  })
})
