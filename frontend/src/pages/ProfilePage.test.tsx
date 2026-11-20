import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it } from 'vitest'

import { server } from '../test/server'
import ProfilePage from './ProfilePage'

const profile = {
  personnel_number: '1001',
  building: 1,
  building_number: '01',
  department: 2,
  department_number: '02',
}

const options = {
  buildings: [{ id: 1, number: '01' }, { id: 3, number: '03' }],
  departments: [{ id: 2, number: '02' }, { id: 4, number: '04' }],
}

function mockProfile(roles: string[] = [], is_superuser = false) {
  server.use(
    http.get('*/api/v1/auth/profile', () => HttpResponse.json(profile)),
    http.get('*/api/v1/auth/profile-options', () => HttpResponse.json(options)),
    http.get('*/api/v1/auth/session', () =>
      HttpResponse.json({
        id: 1,
        username: '1001',
        first_name: 'کاربر',
        last_name: 'آزمایشی',
        is_active: true,
        is_superuser,
        must_change_password: false,
        roles,
      }),
    ),
  )
}

async function openCreationForm() {
  const user = userEvent.setup()
  const trigger = await screen.findByRole('button', { name: 'افزودن کاربر' })
  await user.click(trigger)
  const form = screen.getByRole('region', { name: 'افزودن کاربر' })
  return { user, form, trigger }
}

async function fillCreationForm() {
  const { user, form } = await openCreationForm()
  await user.type(within(form).getByRole('textbox', { name: 'کد پرسنلی' }), '10245')
  await user.type(within(form).getByRole('textbox', { name: 'کد ملی' }), '0012345678')
  await user.selectOptions(within(form).getByRole('combobox', { name: 'شماره ساختمان' }), '3')
  await user.selectOptions(within(form).getByRole('combobox', { name: 'شماره دپارتمان' }), '4')
  return { user, form }
}

describe('Profile employee creation', () => {
  it('shows the create-employee accordion to hrFood', async () => {
    mockProfile(['hrFood'])
    render(<ProfilePage />)
    const trigger = await screen.findByRole('button', { name: 'افزودن کاربر' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    const user = userEvent.setup()
    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: 'ایجاد کاربر' })).toBeDisabled()
  })

  it('shows the create-employee accordion to superusers', async () => {
    mockProfile([], true)
    render(<ProfilePage />)
    expect(await screen.findByRole('button', { name: 'افزودن کاربر' })).toBeInTheDocument()
  })

  it('does not show employee creation to ordinary employees', async () => {
    mockProfile(['Employee'])
    render(<ProfilePage />)
    expect(await screen.findByRole('heading', { name: 'پروفایل' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'اطلاعات پروفایل' })).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'افزودن کاربر' })).not.toBeInTheDocument()
  })

  it('submits the exact employee payload and resets the form after success', async () => {
    mockProfile(['hrFood'])
    const bodies: unknown[] = []
    server.use(http.post('*/api/v1/employees', async ({ request }) => {
      bodies.push(await request.json())
      return HttpResponse.json({ id: 42, personnel_number: '10245' }, { status: 201 })
    }))
    render(<ProfilePage />)
    const { user, form } = await fillCreationForm()
    await user.click(within(form).getByRole('button', { name: 'ایجاد کاربر' }))
    expect(await within(form).findByRole('status')).toHaveTextContent('با موفقیت ایجاد شد')
    expect(bodies).toEqual([{
      personnel_number: '10245', national_id: '0012345678', building_number: '03', department_number: '04', is_active: true,
    }])
    expect(within(form).getByRole('textbox', { name: 'کد پرسنلی' })).toHaveValue('')
    expect(within(form).getByRole('textbox', { name: 'کد ملی' })).toHaveValue('')
    expect(within(form).getByRole('combobox', { name: 'شماره ساختمان' })).toHaveValue('')
    expect(within(form).getByRole('combobox', { name: 'شماره دپارتمان' })).toHaveValue('')
  })

  it('displays a duplicate personnel-number API error without clearing fields', async () => {
    mockProfile(['hrFood'])
    server.use(http.post('*/api/v1/employees', () =>
      HttpResponse.json({ personnel_number: ['این کد پرسنلی قبلاً ثبت شده است.'] }, { status: 400 }),
    ))
    render(<ProfilePage />)
    const { user, form } = await fillCreationForm()
    await user.click(within(form).getByRole('button', { name: 'ایجاد کاربر' }))
    expect(await within(form).findByRole('alert')).toBeInTheDocument()
    expect(within(form).getByRole('textbox', { name: 'کد پرسنلی' })).toHaveValue('10245')
  })

  it('keeps profile settings accessible when session lookup fails', async () => {
    mockProfile(['hrFood'])
    server.use(http.get('*/api/v1/auth/session', () =>
      HttpResponse.json({ detail: 'temporarily unavailable' }, { status: 503 }),
    ))
    render(<ProfilePage />)
    const details = await screen.findByRole('button', { name: 'اطلاعات پروفایل' })
    await userEvent.setup().click(details)
    expect(screen.getByDisplayValue('1001')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'افزودن کاربر' })).not.toBeInTheDocument()
  })
})
