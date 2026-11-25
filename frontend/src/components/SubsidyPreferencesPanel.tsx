import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'

import { getSubsidyPreferences, updateSubsidyPreference } from '../api/endpoints'
import type { SubsidyPreferenceMonth } from '../api/types'
import { getApiMessage } from '../utils/errors'

const monthNames = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
]

function monthKey(month: SubsidyPreferenceMonth): string {
  return `${month.jalali_year}-${month.jalali_month}`
}

function readableDeadline(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date)
}

export default function SubsidyPreferencesPanel() {
  const [months, setMonths] = useState<SubsidyPreferenceMonth[]>([])
  const [choices, setChoices] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [successKey, setSuccessKey] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void getSubsidyPreferences()
      .then((response) => {
        if (!active) return
        setMonths(response.months)
        setChoices(Object.fromEntries(response.months.map((month) => [monthKey(month), month.receive_subsidy])))
        setLoadError('')
      })
      .catch((reason: unknown) => {
        if (active) setLoadError(getApiMessage(reason))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [])

  async function saveMonth(month: SubsidyPreferenceMonth) {
    const key = monthKey(month)
    if (savingKey !== null || !month.can_change || choices[key] === month.receive_subsidy) return

    setSavingKey(key)
    setError('')
    setSuccessKey(null)
    try {
      const updated = await updateSubsidyPreference({
        jalali_year: month.jalali_year,
        jalali_month: month.jalali_month,
        receive_subsidy: choices[key],
      })
      setMonths((current) => current.map((item) => monthKey(item) === key ? updated : item))
      setChoices((current) => ({ ...current, [key]: updated.receive_subsidy }))
      setSuccessKey(key)
    } catch (reason) {
      setError(getApiMessage(reason))
      // Backend is authoritative after the deadline; reload on next accordion opening.
    } finally {
      setSavingKey(null)
    }
  }

  if (loading) {
    return <p role="status" className="rounded-lg border border-line bg-surface p-4 text-sm text-muted">در حال دریافت تنظیمات یارانه…</p>
  }

  if (loadError) {
    return <p role="alert" className="rounded-lg border border-line bg-surface p-4 text-sm text-negative">{loadError}</p>
  }

  return (
    <div className="rounded-lg border border-line bg-surface p-4 sm:p-5">
      <p className="mb-4 text-sm leading-7 text-muted">
        دریافت یارانه به‌صورت پیش‌فرض فعال است. می‌توانید برای هر ماه به‌صورت مستقل دریافت یارانه را غیرفعال کنید و هزینه غذا را آزاد بپردازید.
      </p>
      <div className="flex flex-col gap-4">
        {months.map((month, index) => {
          const key = monthKey(month)
          const checked = choices[key] ?? month.receive_subsidy
          const changed = checked !== month.receive_subsidy
          const busy = savingKey !== null
          return (
            <div key={key} className="rounded-lg border border-line bg-raised/50 p-4">
              <p className="mb-3 text-sm font-bold text-ink">
                {index === 0 ? 'ماه جاری' : 'ماه آینده'} — {monthNames[month.jalali_month - 1]} {month.jalali_year.toLocaleString('fa-IR', { useGrouping: false })}
              </p>
              <label className="flex cursor-pointer items-center gap-3 text-sm text-ink has-[:disabled]:cursor-not-allowed">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={!month.can_change || busy}
                  onChange={(event) => {
                    setChoices((current) => ({ ...current, [key]: event.target.checked }))
                    setError('')
                    setSuccessKey(null)
                  }}
                  className="size-5 shrink-0 accent-[var(--accent)] disabled:opacity-60"
                />
                دریافت یارانه غذا
              </label>
              <p className="mt-2 text-xs leading-6 text-muted">
                {checked ? 'وضعیت انتخابی: دریافت یارانه' : 'وضعیت انتخابی: پرداخت آزاد'}
              </p>
              <p className="mt-2 text-xs leading-6 text-muted">
                {month.can_change ? `مهلت تغییر: ${readableDeadline(month.deadline)}` : 'مهلت تغییر این ماه به پایان رسیده است.'}
              </p>
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  disabled={!month.can_change || !changed || busy}
                  onClick={() => void saveMonth(month)}
                  className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-[var(--accent-contrast)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Save aria-hidden="true" size={16} />
                  {savingKey === key ? 'در حال ذخیره…' : 'ذخیره تغییرات'}
                </button>
              </div>
              {successKey === key && <p role="status" className="mt-2 text-sm text-positive">انتخاب این ماه ذخیره شد.</p>}
            </div>
          )
        })}
      </div>
      {error && <p role="alert" className="mt-4 text-sm text-negative">{error}</p>}
    </div>
  )
}
