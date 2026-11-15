import { ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { api, apiClient } from '../api/client'
import EmptyState from '../components/ui/EmptyState'
import ErrorMessage from '../components/ui/ErrorMessage'
import JalaliDatePicker, { jalaliMonthStartISO } from '../components/ui/JalaliDatePicker'
import { buttonClass } from '../components/ui/buttonStyles'
import { dateToIso, formatDate } from '../utils/date'
import { getApiMessage } from '../utils/errors'

type BuildingReportDay = {
  date: string
  food: string
  reserved_count: number
  food_quantity: number
}

type BuildingReport = {
  building_number: string
  reserved_count: number
  days: BuildingReportDay[]
}

type BuildingReportResponse = {
  buildings: BuildingReport[]
}

const numberFormatter = new Intl.NumberFormat('fa-IR')

function number(value: number): string {
  return numberFormatter.format(value)
}

export default function ReportPage() {
  const today = dateToIso(new Date())
  const firstDay = jalaliMonthStartISO(today)

  const [fromDate, setFromDate] = useState(firstDay)
  const [toDate, setToDate] = useState(today)
  const [buildings, setBuildings] = useState<BuildingReport[]>([])
  const [selectedNumber, setSelectedNumber] = useState<string | null>(null)
  const [expandedDay, setExpandedDay] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [downloading, setDownloading] = useState(false)
  const requestIdRef = useRef(0)

  const totalReservations = buildings.reduce(
    (sum, building) => sum + building.reserved_count,
    0,
  )

  async function loadReport(event?: FormEvent) {
    event?.preventDefault()
    const requestId = ++requestIdRef.current
    setLoading(true)
    setError('')

    try {
      const query = new URLSearchParams({
        from: fromDate,
        to: toDate,
      })

      const response = await api<BuildingReportResponse>(
        `/reports/daily/buildings?${query.toString()}`,
      )

      if (requestId !== requestIdRef.current) return
      setBuildings(response.buildings)
      setSelectedNumber(null)
      setExpandedDay(null)
      setLoaded(true)
    } catch (loadError) {
      if (requestId === requestIdRef.current) {
        setError(getApiMessage(loadError))
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    let active = true
    const requestId = ++requestIdRef.current

    const query = new URLSearchParams({
      from: firstDay,
      to: today,
    })

    api<BuildingReportResponse>(
      `/reports/daily/buildings?${query.toString()}`,
    )
      .then((response) => {
        if (!active || requestId !== requestIdRef.current) return
        setBuildings(response.buildings)
        setSelectedNumber(null)
        setExpandedDay(null)
        setLoaded(true)
      })
      .catch((loadError: unknown) => {
        if (active && requestId === requestIdRef.current) {
          setError(getApiMessage(loadError))
        }
      })
      .finally(() => {
        if (active && requestId === requestIdRef.current) {
          setLoading(false)
        }
      })

    return () => {
      active = false
      if (requestIdRef.current === requestId) {
        requestIdRef.current += 1
      }
    }
  }, [firstDay, today])

  async function downloadReport() {
    setError('')
    setDownloading(true)

    try {
      const response = await apiClient.get<Blob>(
        '/reports/daily/export',
        {
          params: { from: fromDate, to: toDate },
          responseType: 'blob',
        },
      )

      const url = URL.createObjectURL(response.data)
      const link = document.createElement('a')
      link.href = url
      const parts = new Intl.DateTimeFormat('en-US-u-ca-persian', {
        timeZone: 'Asia/Tehran',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(new Date())

      const datePart = (type: string) =>
        parts.find((part) => part.type === type)?.value

      const exportDate = `${datePart('year')}-${datePart('month')}-${datePart('day')}`
      link.download = `food-daily-report-${exportDate}.xlsx`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (downloadError) {
      setError(getApiMessage(downloadError))
    } finally {
      setDownloading(false)
    }
  }

  return (
    <section className="min-w-0" aria-labelledby="report-title">
      <header className="mb-6">
        <p className="mb-2 text-xs font-bold text-accent">
          گزارش مدیریتی
        </p>
        <h1
          id="report-title"
          className="m-0 text-[clamp(26px,3vw,34px)] font-bold text-ink"
        >
          گزارش رزرو ساختمان‌ها
        </h1>
        <p className="mt-2 text-sm leading-7 text-muted">
          آمار رزرو هر ساختمان را در بازه دلخواه بررسی کن.
        </p>
      </header>

      <form
        className="flex flex-wrap items-end gap-3 rounded-[var(--radius)] border border-line bg-surface p-4 max-[680px]:flex-col max-[680px]:items-stretch"
        onSubmit={(event) => void loadReport(event)}
      >
        <fieldset className="min-w-[180px] border-0 p-0 max-[680px]:min-w-0">
          <legend className="mb-2 text-sm font-semibold text-ink">
            از تاریخ
          </legend>
          <JalaliDatePicker
            onChange={setFromDate}
            required
            value={fromDate}
          />
        </fieldset>

        <fieldset className="min-w-[180px] border-0 p-0 max-[680px]:min-w-0">
          <legend className="mb-2 text-sm font-semibold text-ink">
            تا تاریخ
          </legend>
          <JalaliDatePicker
            onChange={setToDate}
            required
            value={toDate}
          />
        </fieldset>

        <button
          className={buttonClass('primary', '')}
          disabled={loading}
          type="submit"
        >
          {loading ? 'در حال دریافت…' : 'نمایش گزارش'}
        </button>

        <button
          className={buttonClass('neutral', '')}
          disabled={downloading}
          onClick={() => void downloadReport()}
          type="button"
        >
          {downloading ? 'در حال دریافت Excel…' : 'خروجی Excel'}
        </button>
      </form>

      {error && (
        <div className="mt-4">
          <ErrorMessage
            message={error}
            onRetry={() => void loadReport()}
          />
        </div>
      )}

      {loading && !loaded && (
        <p className="mt-5 text-sm text-muted" role="status">
          در حال بارگذاری گزارش ساختمان‌ها…
        </p>
      )}

      {loaded && !error && (
        <div className="mt-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="m-0 text-xl font-bold text-ink">ساختمان‌ها</h2>
              <p className="mt-2 text-sm text-muted">
                برای مشاهده جزئیات روزانه، روی ردیف هر ساختمان کلیک کن.
              </p>
            </div>

            <div className="rounded-lg border border-line bg-surface px-4 py-3 text-sm text-muted">
              مجموع رزروها:{' '}
              <strong className="text-ink">{number(totalReservations)}</strong>
            </div>
          </div>

          {buildings.length === 0 ? (
            <EmptyState
              title="رزروی برای ساختمان‌ها ثبت نشده"
              detail="در بازه انتخابی، رزرو فعال دارای شماره ساختمان وجود ندارد."
            />
          ) : (
            <div className="space-y-3">
              {buildings.map((building) => {
                const isExpanded = selectedNumber === building.building_number
                const detailsId = `building-details-${encodeURIComponent(building.building_number)}`

                return (
                  <article
                    key={building.building_number}
                    className="overflow-hidden rounded-xl border border-line bg-surface"
                  >
                    <h3 className="m-0">
                      <button
                        type="button"
                        aria-expanded={isExpanded}
                        aria-controls={detailsId}
                        onClick={() => {
                          setSelectedNumber(isExpanded ? null : building.building_number)
                          setExpandedDay(null)
                        }}
                        className="flex min-h-14 w-full cursor-pointer items-center justify-between gap-3 bg-accent-soft px-4 py-3 text-right text-accent transition-colors hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-accent dark:hover:brightness-110 sm:px-5"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <ChevronDown
                            aria-hidden="true"
                            size={17}
                            className={`shrink-0 transition-transform duration-200 motion-reduce:transition-none ${isExpanded ? '' : '-rotate-90'}`}
                          />
                          <span className="font-bold">ساختمان {building.building_number}</span>
                        </span>
                        <span className="shrink-0 text-xs font-medium sm:text-sm">
                          {number(building.reserved_count)} رزرو فعال
                        </span>
                      </button>
                    </h3>

                    {isExpanded && (
                      <div id={detailsId} className="space-y-3 bg-raised/50 p-3 sm:p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-sm">
                          <span className="text-muted">مجموع رزروهای فعال</span>
                          <strong className="font-bold text-ink">
                            {number(building.reserved_count)}
                          </strong>
                        </div>
                        {building.days.length === 0 ? (
                          <p className="px-2 py-3 text-sm text-muted">
                            برای این ساختمان جزئیات روزانه‌ای وجود ندارد.
                          </p>
                        ) : (
                          building.days.map((day, index) => {
                            const dayKey = `${building.building_number}:${day.date}:${day.food}:${index}`
                            const open = expandedDay === dayKey
                            const dayDetailsId = `day-${encodeURIComponent(dayKey)}`

                            return (
                              <section key={dayKey} className="overflow-hidden rounded-lg border border-line bg-surface">
                                <h4 className="m-0">
                                  <button
                                    type="button"
                                    aria-expanded={open}
                                    aria-controls={dayDetailsId}
                                    onClick={() => setExpandedDay(open ? null : dayKey)}
                                    className="flex min-h-12 w-full cursor-pointer items-center justify-between gap-3 px-4 py-3 text-right transition-colors hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-accent"
                                  >
                                    <span className="flex min-w-0 items-center gap-2">
                                      <ChevronDown
                                        aria-hidden="true"
                                        size={15}
                                        className={`shrink-0 text-accent transition-transform duration-200 motion-reduce:transition-none ${open ? '' : '-rotate-90'}`}
                                      />
                                      <span className="text-sm font-semibold text-ink">{formatDate(day.date)}</span>
                                    </span>
                                    <span className="min-w-0 truncate text-xs text-muted sm:text-sm">{day.food}</span>
                                  </button>
                                </h4>
                                {open && (
                                  <div id={dayDetailsId} className="grid gap-3 border-t border-line px-4 py-4 text-sm sm:grid-cols-2">
                                    <div className="flex items-center justify-between gap-2 rounded-lg bg-raised px-3 py-2">
                                      <span className="text-muted">رزرو فعال</span>
                                      <strong className="text-ink">{number(day.reserved_count)}</strong>
                                    </div>
                                    <div className="flex items-center justify-between gap-2 rounded-lg bg-raised px-3 py-2">
                                      <span className="text-muted">تعداد پرس غذا</span>
                                      <strong className="text-ink">{number(day.food_quantity)}</strong>
                                    </div>
                                  </div>
                                )}
                              </section>
                            )
                          })
                        )}
                      </div>
                    )}
                  </article>
                )
              })}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
