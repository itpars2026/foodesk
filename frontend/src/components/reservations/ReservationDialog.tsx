import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'

import { api } from '../../api/client'
import { getProfile, getProfileOptions } from '../../api/endpoints'
import type {
  CatalogItem,
  ProfileOption,
  Reservation,
  WeeklyMenu,
} from '../../api/types'
import CatalogMultiSelect from '../ui/CatalogMultiSelect'
import type { CatalogQuantities } from '../ui/CatalogMultiSelect'
import { buttonClass, iconButtonClass } from '../ui/buttonStyles'
import { formatDate } from '../../utils/date'
import { getApiMessage } from '../../utils/errors'
import { formatMoney } from '../../utils/format'

function initialQuantities(
  entries: { id: number; quantity: number }[] | undefined,
  legacyId: number | null | undefined,
  legacyQuantity: number | undefined,
): CatalogQuantities {
  if (entries !== undefined) {
    return Object.fromEntries(
      entries.map((entry) => [entry.id, entry.quantity]),
    )
  }

  if (legacyId != null && (legacyQuantity ?? 0) > 0) {
    return { [legacyId]: legacyQuantity ?? 1 }
  }

  return {}
}

function selectionTotal(
  items: CatalogItem[],
  quantities: CatalogQuantities,
): number {
  return items.reduce(
    (total, item) => total + item.price * (quantities[item.id] ?? 0),
    0,
  )
}

export default function ReservationDialog({
  menu,
  dayMenus,
  sides,
  drinks,
  onClose,
  onSaved,
}: {
  menu: WeeklyMenu
  dayMenus: WeeklyMenu[]
  sides: CatalogItem[]
  drinks: CatalogItem[]
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const current = menu.reservation?.current_item
  const [building, setBuilding] = useState(current?.building?.toString() ?? '')
  const [buildingOptions, setBuildingOptions] = useState<ProfileOption[]>([])
  const [buildingLoading, setBuildingLoading] = useState(true)
  const [buildingLoadError, setBuildingLoadError] = useState('')
  const [sideQuantities, setSideQuantities] = useState<CatalogQuantities>(() =>
    initialQuantities(
      current?.side_items?.map((entry) => ({
        id: entry.side,
        quantity: entry.quantity,
      })),
      current?.side,
      current?.side_quantity,
    ),
  )
  const [drinkQuantities, setDrinkQuantities] = useState<CatalogQuantities>(() =>
    initialQuantities(
      current?.drink_items?.map((entry) => ({
        id: entry.drink,
        quantity: entry.quantity,
      })),
      current?.drink,
      current?.drink_quantity,
    ),
  )
  const [foodQuantity, setFoodQuantity] = useState(current?.food_quantity ?? 1)

  const [selectedMenuIds, setSelectedMenuIds] = useState<number[]>(
    () => menu.reservation ? [] : [menu.id],
  )

  const selectedMenus = dayMenus.filter(
    (option) =>
      selectedMenuIds.includes(option.id) &&
      option.can_reserve &&
      !option.reservation,
  )

  const hasNewSelections = selectedMenus.length > 0
  const [saving, setSaving] = useState(false)
  const [canceling, setCanceling] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [cancelled, setCancelled] = useState(false)
  const dialogRef = useRef<HTMLElement>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    let active = true

    Promise.all([getProfile(), getProfileOptions()])
      .then(([profile, options]) => {
        if (!active) return

        setBuildingOptions(options.buildings)

        if (!menu.reservation) {
          const profileBuilding = profile.building
          const isAvailable = options.buildings.some(
            (option) => option.id === profileBuilding,
          )
          setBuilding(
            profileBuilding !== null && isAvailable
              ? String(profileBuilding)
              : '',
          )
        }
      })
      .catch((loadError: unknown) => {
        if (active) setBuildingLoadError(getApiMessage(loadError))
      })
      .finally(() => {
        if (active) setBuildingLoading(false)
      })

    return () => {
      active = false
    }
  }, [menu.reservation])

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow

    document.body.style.overflow = 'hidden'

    const focusableSelector = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled]):not([type="hidden"])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(', ')

    function getFocusableElements(): HTMLElement[] {
      if (!dialog) return []

      return Array.from(
        dialog.querySelectorAll<HTMLElement>(focusableSelector),
      ).filter((element) => element.getClientRects().length > 0)
    }

    // Focus the explicit close control on initial opening.
    const closeButton = dialog.querySelector<HTMLButtonElement>(
      'button[aria-label="بستن"]',
    )

    ;(closeButton ?? dialog).focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (!dialog) return

      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onCloseRef.current()
        return
      }

      if (event.key !== 'Tab') return

      const elements = getFocusableElements()
      const first = elements[0]
      const last = elements[elements.length - 1]

      if (!first || !last) {
        event.preventDefault()
        dialog.focus()
        return
      }

      if (!dialog.contains(document.activeElement)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
        return
      }

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (
        !event.shiftKey &&
        document.activeElement === last
      ) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow

      if (
        previousFocus instanceof HTMLElement &&
        previousFocus.isConnected
      ) {
        previousFocus.focus()
      }
    }
  }, [])

  const foodSubtotal = (
    hasNewSelections
      ? selectedMenus.reduce(
          (sum, option) => sum + option.food_price,
          0,
        )
      : menu.reservation
        ? menu.food_price
        : 0
  ) * foodQuantity

  const selectedCount = hasNewSelections
    ? selectedMenus.length
    : menu.reservation ? 1 : 0

  const total = foodSubtotal
    + selectedCount * selectionTotal(sides, sideQuantities)
    + selectedCount * selectionTotal(drinks, drinkQuantities)

  async function save(event: FormEvent) {
    event.preventDefault()
    setError('')

    if (!hasNewSelections && !menu.reservation) {
      setError('حداقل یک غذا انتخاب کنید.')
      return
    }

    if (!building || !Number.isInteger(Number(building))) {
      setError('انتخاب ساختمان محل تحویل الزامی است.')
      return
    }

    if (buildingLoading || buildingLoadError) {
      setError('اطلاعات ساختمان‌ها هنوز آماده نیست.')
      return
    }

    setSaving(true)
    const item = {
      ...(
        menu.reservation
          ? building !== (current?.building?.toString() ?? '')
            ? { building: Number(building) }
            : {}
          : { building: Number(building) }
      ),
      food_quantity: foodQuantity,
      sides: Object.entries(sideQuantities)
        .filter(([, quantity]) => quantity > 0)
        .map(([side, quantity]) => ({
          side: Number(side),
          quantity,
        })),
      drinks: Object.entries(drinkQuantities)
        .filter(([, quantity]) => quantity > 0)
        .map(([drink, quantity]) => ({
          drink: Number(drink),
          quantity,
        })),
    }
    try {
      if (hasNewSelections) {
        await api<Reservation[]>('/reservations', {
          method: 'POST',
          body: JSON.stringify({
            reservations: selectedMenus.map((option) => ({
              ...item,
              menu: option.id,
              building: Number(building),
            })),
          }),
        })
      } else if (menu.reservation) {
        await api<Reservation>(
          `/reservations/${menu.reservation.id}`,
          {
            method: 'PATCH',
            body: JSON.stringify(item),
          },
        )
      }
      await onSaved()
      setSaved(true)
    } catch (saveError) {
      setError(getApiMessage(saveError))
    } finally {
      setSaving(false)
    }
  }

  const [activeCatalogTab, setActiveCatalogTab] =
    useState<'food' | 'side' | 'drink'>('food')

  async function cancelReservation() {
    if (!menu.reservation) return
    setCanceling(true)
    setError('')
    try {
      await api<Reservation>(`/reservations/${menu.reservation.id}/cancel`, { method: 'POST', body: '{}' })
      await onSaved()
      setCancelled(true)
    } catch (cancelError) {
      setError(getApiMessage(cancelError))
    } finally {
      setCanceling(false)
    }
  }

  return (
    <div className="fixed inset-0 z-10 grid place-items-center overflow-hidden bg-[#10232b80] p-3 sm:p-5">
      <button
        type="button"
        aria-label="بستن پنجره رزرو با کلیک روی پس‌زمینه"
        className="absolute inset-0 h-full w-full cursor-default border-0 bg-transparent"
        onClick={onClose}
        tabIndex={-1}
      />
      <section aria-labelledby="reservation-dialog-title" aria-modal="true" className="relative z-10 flex w-full max-w-[480px] max-h-[calc(100dvh-16px)] sm:max-h-[min(90dvh,760px)] flex-col overflow-hidden rounded-2xl border border-line bg-surface text-ink p-[22px] shadow-[0_20px_70px_#09252d33] max-[680px]:max-h-[calc(100dvh-16px)] max-[680px]:self-center max-[680px]:rounded-t-2xl max-[680px]:rounded-b-[10px] max-[680px]:p-3 min-h-0" ref={dialogRef} tabIndex={-1} role="dialog">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line pb-[17px]">
          <div><p className="mt-0 mb-[3px] text-xs font-bold text-accent">{formatDate(menu.date)}</p><h2 className="m-0 text-xl" id="reservation-dialog-title">{saved ? 'رزرو ثبت شد' : cancelled ? 'رزرو لغو شد' : menu.food_name}</h2></div>
          <button aria-label="بستن" className={iconButtonClass} onClick={onClose} type="button"><X size={19} /></button>
        </div>
        {saved || cancelled ? <div className="rounded-[9px] border border-[#c9e5d7] bg-[#f0faf4] p-[14px] leading-[1.8] text-[#176441] dark:border-positive/40 dark:bg-raised dark:text-positive" role="status">{saved ? 'انتخابت برای این روز ثبت شد.' : 'رزرو این روز لغو شد و در سوابق باقی ماند.'}</div> : <form className="flex min-h-0 flex-1 flex-col overflow-hidden" onSubmit={save}>
  <div className="min-h-0 flex-1 space-y-[11px] overflow-y-auto overscroll-y-contain pt-4 pe-1">
          <div className="min-w-0 overflow-hidden rounded-xl border border-line bg-surface p-3">
            <div
              role="tablist"
              aria-label="انتخاب غذا و پیش‌غذا و نوشیدنی"
              className="mb-3 grid grid-cols-3 gap-1 rounded-lg bg-raised p-1"
            >
              <button
                type="button"
                role="tab"
                id="reservation-food-tab"
                aria-controls="reservation-catalog-panel"
                aria-selected={activeCatalogTab === 'food'}
                onClick={() => setActiveCatalogTab('food')}
                className={`min-h-10 rounded-md px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-accent ${activeCatalogTab === 'food' ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
              >غذا</button>
              <button
                type="button"
                role="tab"
                id="reservation-side-tab"
                aria-controls="reservation-catalog-panel"
                aria-selected={activeCatalogTab === 'side'}
                onClick={() => setActiveCatalogTab('side')}
                className={`min-h-10 rounded-md px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                  activeCatalogTab === 'side'
                    ? 'bg-surface text-ink shadow-sm'
                    : 'text-muted hover:text-ink'
                }`}
              >
                پیش‌غذا
                <span className="ms-1 text-xs">
                  ({Object.values(sideQuantities).filter((quantity) => quantity > 0).length})
                </span>
              </button>

              <button
                type="button"
                role="tab"
                id="reservation-drink-tab"
                aria-controls="reservation-catalog-panel"
                aria-selected={activeCatalogTab === 'drink'}
                onClick={() => setActiveCatalogTab('drink')}
                className={`min-h-10 rounded-md px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                  activeCatalogTab === 'drink'
                    ? 'bg-surface text-ink shadow-sm'
                    : 'text-muted hover:text-ink'
                }`}
              >
                نوشیدنی
                <span className="ms-1 text-xs">
                  ({Object.values(drinkQuantities).filter((quantity) => quantity > 0).length})
                </span>
              </button>
            </div>

            <div
              id="reservation-catalog-panel"
              role="tabpanel"
              aria-labelledby={
                activeCatalogTab === 'food' ? 'reservation-food-tab' : activeCatalogTab === 'side' ? 'reservation-side-tab' : 'reservation-drink-tab'
              }
              className="min-w-0"
            >
              {activeCatalogTab === 'food' ? (
                <div className="space-y-3">

                  {/* Dynamic multi-food selection */}
                  <div
                    className="grid gap-2"
                    role="group"
                    aria-label="انتخاب غذاهای روز"
                  >
                    {dayMenus.map((option) => {
                      const existing = Boolean(option.reservation)
                      const selected = existing
                        ? option.reservation?.status === 'res'
                        : selectedMenuIds.includes(option.id)

                      const disabled =
                        saving ||
                        canceling ||
                        existing ||
                        !option.can_reserve

                      return (
                        <label
                          key={option.id}
                          className={`flex items-start gap-3 rounded-xl border p-3 ${
                            selected
                              ? 'border-[#EF816E] bg-[#FCE8E3] dark:bg-[#EF816E]/20'
                              : 'border-line bg-surface'
                          } ${
                            disabled
                              ? 'cursor-not-allowed'
                              : 'cursor-pointer hover:border-[#EF816E]'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            disabled={disabled}
                            onChange={(event) => {
                              setSelectedMenuIds((previous) =>
                                event.target.checked
                                  ? previous.includes(option.id)
                                    ? previous
                                    : [...previous, option.id]
                                  : previous.filter((id) => id !== option.id),
                              )
                            }}
                            aria-label={`انتخاب ${option.category?.name ?? 'غذا'}: ${option.food_name}`}
                            className="mt-1 h-4 w-4 shrink-0 accent-[#C95443]"
                          />

                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-muted">
                                {option.category?.name ?? 'غذا'}
                              </span>

                              {option.reservation?.status === 'res' && (
                                <span className="text-xs text-positive">
                                  قبلاً رزرو شده
                                </span>
                              )}

                              {option.reservation?.status === 'can' && (
                                <span className="text-xs text-muted">
                                  رزرو لغوشده
                                </span>
                              )}

                              {!existing && !option.can_reserve && (
                                <span className="text-xs text-muted">
                                  غیرقابل رزرو
                                </span>
                              )}
                            </span>

                            <span className="mt-2 flex flex-wrap items-center justify-between gap-2">
                              <span className="text-sm font-semibold text-ink">
                                {option.food_name}
                              </span>

                              <span className="text-xs font-semibold text-ink">
                                {formatMoney(option.food_price)}
                              </span>
                            </span>
                          </span>
                        </label>
                      )
                    })}

                    <p className="m-0 text-xs text-muted">
                      {hasNewSelections
                        ? `${selectedMenus.length} غذای جدید انتخاب شده است.`
                        : menu.reservation
                          ? 'رزرو فعلی قابل ویرایش است.'
                          : 'حداقل یک غذا انتخاب کنید.'}
                    </p>

                    {menu.reservation && hasNewSelections && (
                      <p className="m-0 text-xs text-muted">
                        فقط غذاهای جدید ثبت می‌شوند.
                        رزرو قبلی تغییری نمی‌کند.
                      </p>
                    )}
                  </div>

                  <div className="grid min-w-0 grid-cols-2 items-center gap-3">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold text-ink">
                تعداد غذا
              </span>

              <div
                role="group"
                aria-label="تعداد غذا"
                className="flex shrink-0 items-center gap-1"
              >
                <button
                  type="button"
                  aria-label="کاهش تعداد غذا"
                  disabled={saving || canceling || foodQuantity <= 1}
                  onClick={() => setFoodQuantity(Math.max(1, foodQuantity - 1))}
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-line bg-surface text-ink disabled:opacity-40"
                >
                  −
                </button>

                <output
                  aria-label="تعداد غذای انتخاب‌شده"
                  className="min-w-5 text-center text-sm font-semibold tabular-nums text-ink"
                >
                  {foodQuantity}
                </output>

                <button
                  type="button"
                  aria-label="افزایش تعداد غذا"
                  disabled={saving || canceling || foodQuantity >= 99}
                  onClick={() => setFoodQuantity(Math.min(99, foodQuantity + 1))}
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-line bg-surface text-ink disabled:opacity-40"
                >
                  +
                </button>
              </div>
            </div>

            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold text-ink">
                قیمت غذا
              </span>

              <strong className="text-sm font-semibold text-ink">
                {formatMoney(menu.food_price)}
              </strong>
            </div>
          </div>
<p className="m-0 text-sm text-muted">{hasNewSelections
  ? selectedMenus.map((option) => option.food_name).join('، ')
  : menu.food_name}
  — {formatMoney(foodSubtotal)}</p></div>
              ) : activeCatalogTab === 'side' ? (
                <CatalogMultiSelect
                  label="پیش‌غذا (اختیاری)"
                  items={sides}
                  quantities={sideQuantities}
                  onChange={setSideQuantities}
                  disabled={saving || canceling}
                />
              ) : (
                <CatalogMultiSelect
                  label="نوشیدنی (اختیاری)"
                  items={drinks}
                  quantities={drinkQuantities}
                  onChange={setDrinkQuantities}
                  disabled={saving || canceling}
                />
              )}
            </div>
          </div>
          <label className="m-0 grid min-w-0 grid-cols-2 items-center gap-3 text-sm font-semibold text-ink">
            <span className="min-w-0 text-center leading-6">ساختمان محل تحویل</span>
            <select
              className="min-h-[46px] min-w-0 w-full rounded-[9px] border border-line bg-surface px-[13px] py-[10px] text-ink"
              disabled={buildingLoading || Boolean(buildingLoadError)}
              onChange={(event) => setBuilding(event.target.value)}
              required
              value={building}
            >
              <option value="">انتخاب ساختمان</option>
              {current?.building != null &&
                !buildingOptions.some((option) => option.id === current.building) && (
                  <option value={current.building}>
                    ساختمان {current.building_number_snapshot ?? 'قبلی'} (ثبت‌شده)
                  </option>
                )}
              {buildingOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  ساختمان {option.number}
                </option>
              ))}
            </select>
          </label>
          {buildingLoading && (
            <p className="m-0 text-xs text-muted" role="status">
              در حال دریافت اطلاعات ساختمان‌ها…
            </p>
          )}
          {buildingLoadError && (
            <p className="m-0 text-xs text-red-700" role="alert">
              دریافت ساختمان‌ها ناموفق بود: {buildingLoadError}
            </p>
          )}
  </div>
  <div className="z-10 shrink-0 space-y-2 border-t border-line bg-surface pt-2">
<div className="mt-1 flex justify-between gap-[10px] border-t border-line py-[11px] text-sm text-muted"><span>جمع این انتخاب</span><strong className="text-ink">{formatMoney(total)}</strong></div>
          {error && <p className="mb-[15px] rounded-[9px] border border-[#f0c9cb] bg-[#fff4f4] px-[14px] py-3 text-sm leading-[1.7] text-[#8b242a] dark:border-negative/40 dark:bg-raised dark:text-negative" role="alert">{error}</p>}
          <button className={buttonClass('primary', 'w-full')} disabled={saving || canceling || buildingLoading || Boolean(buildingLoadError)} type="submit">{saving
  ? 'در حال ثبت…'
  : hasNewSelections
    ? selectedMenus.length === 1 ? 'ثبت رزرو' : `ثبت ${selectedMenus.length} غذا`
    : menu.reservation?.status === 'can'
      ? 'ثبت رزرو مجدد'
      : menu.reservation
        ? 'ذخیره'
        : 'ثبت رزرو'}</button>
          {menu.reservation?.status === 'res' && <button className={buttonClass('dangerQuiet', 'mx-auto block')} disabled={saving || canceling} onClick={() => void cancelReservation()} type="button">{canceling ? 'در حال لغو…' : 'لغو غذای این روز'}</button>}
          <p className="mt-px mb-0 text-center text-[11px] text-muted">مهلت رزرو و ویرایش تا ساعت ۱۰ صبح روز قبل است.</p>
  </div>
</form>}
      </section>
    </div>
  )
}
