import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'

import DeleteGroupButton from './DeleteGroupButton'
import type { ManagedGroup } from './api'
import { server } from '../../test/server'

const customGroup: ManagedGroup = {
  id: 2,
  name: 'FoodOperator',
  permissions: [10],
  is_system: false,
}

function renderButton(group: ManagedGroup = customGroup) {
  const onDeleted = vi.fn(async () => {})

  render(
    <DeleteGroupButton group={group} onDeleted={onDeleted} />
  )

  return { onDeleted }
}

describe('DeleteGroupButton', () => {
  it('deletes a custom group only after confirmation', async () => {
    const deleteSpy = vi.fn()

    server.use(
      http.delete('*/api/v1/groups/2', () => {
        deleteSpy()
        return new HttpResponse(null, { status: 204 })
      }),
    )

    const { onDeleted } = renderButton()
    const user = userEvent.setup()

    await user.click(
      screen.getByRole('button', { name: 'حذف گروه' }),
    )

    expect(deleteSpy).not.toHaveBeenCalled()

    expect(
      screen.getByText(/FoodOperator.*حذف شود؟/),
    ).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: 'تأیید حذف' }),
    )

    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledTimes(1)
      expect(onDeleted).toHaveBeenCalledTimes(1)
    })
  })

  it('cancels deletion without calling the API', async () => {
    const deleteSpy = vi.fn()

    server.use(
      http.delete('*/api/v1/groups/2', () => {
        deleteSpy()
        return new HttpResponse(null, { status: 204 })
      }),
    )

    const { onDeleted } = renderButton()
    const user = userEvent.setup()

    await user.click(
      screen.getByRole('button', { name: 'حذف گروه' }),
    )

    await user.click(
      screen.getByRole('button', { name: 'انصراف' }),
    )

    expect(deleteSpy).not.toHaveBeenCalled()
    expect(onDeleted).not.toHaveBeenCalled()

    expect(
      screen.getByRole('button', { name: 'حذف گروه' }),
    ).toBeInTheDocument()
  })

  it('does not render a delete action for system groups', () => {
    const { onDeleted } = renderButton({
      ...customGroup,
      name: 'Employee',
      is_system: true,
    })

    expect(
      screen.queryByRole('button', { name: 'حذف گروه' }),
    ).not.toBeInTheDocument()

    expect(onDeleted).not.toHaveBeenCalled()
  })

  it('shows an API error and preserves the confirmation', async () => {
    server.use(
      http.delete('*/api/v1/groups/2', () =>
        HttpResponse.json(
          { detail: 'Deleting this group is not allowed.' },
          { status: 403 },
        ),
      ),
    )

    const { onDeleted } = renderButton()
    const user = userEvent.setup()

    await user.click(
      screen.getByRole('button', { name: 'حذف گروه' }),
    )

    await user.click(
      screen.getByRole('button', { name: 'تأیید حذف' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Deleting this group is not allowed.',
    )

    expect(onDeleted).not.toHaveBeenCalled()

    expect(
      screen.getByRole('button', { name: 'تأیید حذف' }),
    ).toBeEnabled()
  })
})
