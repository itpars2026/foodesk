import {
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { api } from '../api/client'
import type { CatalogItem, MenuCategory, WeeklyMenu } from '../api/types'
import EmptyState from '../components/ui/EmptyState'
import ErrorMessage from '../components/ui/ErrorMessage'
import WeekSkeleton from '../components/ui/WeekSkeleton'
import ReservationDialog from '../components/reservations/ReservationDialog'
import { buttonClass, iconButtonClass } from '../components/ui/buttonStyles'
import { addDays, dateToIso, formatDate, formatWeekday, getWeekStart } from '../utils/date'
import { getApiMessage } from '../utils/errors'
import { formatMoney, formatNumber } from '../utils/format'

export default function WeekPage() {
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()))
  const [menus, setMenus] = useState<WeeklyMenu[]>([])
  const [categories, setCategories] = useState<MenuCategory[]>([])
  const [activeCategory, setActiveCategory] = useState('')
  const [sides, setSides] = useState<CatalogItem[]>([])
  const [drinks, setDrinks] = useState<CatalogItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editor, setEditor] = useState<WeeklyMenu | null>(null)
  const [filter, setFilter] = useState<'all' | 'reserved' | 'open'>('all')

  const startIso = dateToIso(weekStart)
  const requestId = useRef(0)

  const fetchWeek = useCallback(async (id: number, week: string) => {
    try {
      const [weekMenus, sideItems, drinkItems, availableCategories] = await Promise.all([
        api<WeeklyMenu[]>(`/reservations/weekly?start=${week}`),
        api<CatalogItem[]>('/sides'),
        api<CatalogItem[]>('/drinks'),
        api<MenuCategory[]>('/menu-categories'),
      ])

      if (id !== requestId.current) return

      setMenus(weekMenus)
      setCategories(availableCategories)
      setActiveCategory((current) =>
        availableCategories.some((category) => category.slug === current)
          ? current
          : (availableCategories[0]?.slug ?? ''),
      )
      setSides(sideItems)
      setDrinks(drinkItems)
    } catch (loadError) {
      if (id !== requestId.current) return
      setError(getApiMessage(loadError))
    } finally {
      if (id === requestId.current) {
        setLoading(false)
      }
    }
  }, [])

  const load = useCallback(async () => {
    const id = ++requestId.current
    setLoading(true)
    setError('')
    await fetchWeek(id, startIso)
  }, [fetchWeek, startIso])

  useEffect(() => {
    const id = ++requestId.current

    void fetchWeek(id, startIso)

    return () => {
      // Invalidate responses from the week that is being left.
      if (requestId.current === id) {
        requestId.current += 1
      }
    }
  }, [fetchWeek, startIso])

  const days = useMemo(() => Array.from({ length: 6 }, (_, index) => {
    const date = dateToIso(addDays(weekStart, index))
    return { date, menu: menus.find((menu) => menu.date === date && menu.category?.slug === activeCategory) ?? null }
  }), [menus, weekStart, activeCategory])
  const reservationCount = menus.filter((menu) => menu.reservation?.status === 'res').length
  const visibleDays = days.filter(({ menu }) => {
    if (filter === 'reserved') return menu?.reservation?.status === 'res'
    if (filter === 'open') return menu && menu.can_reserve && menu.reservation?.status !== 'res'
    return true
  })

  return (
    <section className="min-w-0" aria-labelledby="week-title">
      <div className="mb-[25px] flex items-end justify-between gap-[18px] max-[680px]:mb-[18px] max-[680px]:items-start [&_h1]:m-0 [&_h1]:text-[clamp(26px,3vw,34px)] [&_h1]:leading-[1.35] [&_h1]:tracking-[-0.8px] max-[680px]:[&_h1]:text-[27px]">
        <div>
          <p className="mt-0 mb-2 text-xs font-bold text-accent">برنامهٔ هفتگی</p>
          <h1 id="week-title">غذای هفته</h1>
          <p className="mt-[7px] mb-0 text-sm leading-[1.7] text-muted max-[680px]:max-w-[440px] max-[680px]:text-xs">منوهای هر دسته به‌صورت مستقل قابل رزرو هستند؛ پیش‌غذا و نوشیدنی اختیاری است.</p>
        </div>
        <button
          aria-label="تازه‌سازی برنامه هفتگی"
          className={buttonClass('secondary', 'shrink-0 max-[680px]:h-[39px] max-[680px]:min-h-[39px] max-[680px]:w-[39px] max-[680px]:min-w-[39px] max-[680px]:gap-0 max-[680px]:p-0')}
          onClick={() => void load()}
          type="button"
        >
          <RefreshCw aria-hidden="true" className="shrink-0" size={16} />
          <span className="max-[680px]:hidden">تازه‌سازی</span>
        </button>
      </div>

      {!categories.length && !loading && <EmptyState title="هنوز دسته منویی تعریف نشده است" detail="مدیر سامانه باید دسته‌ها را از پنل مدیریت ایجاد کند." />}


      <div className="flex min-h-[58px] items-center justify-between gap-[14px] border-y border-line py-2 max-[680px]:flex-col-reverse max-[680px]:items-start max-[680px]:gap-[5px] max-[680px]:py-[10px]">
        <div className="flex items-center gap-[9px] max-[680px]:w-full max-[680px]:justify-between max-[680px]:gap-[3px]">
          <button aria-label="هفتهٔ قبل" className={`${iconButtonClass} max-[680px]:h-[34px] max-[680px]:w-[34px]`} onClick={() => {
            setLoading(true)
            setError('')
            requestId.current += 1
            setWeekStart((value) => addDays(value, -7))
          }} type="button"><ChevronRight size={18} /></button>
          <strong className="whitespace-nowrap text-sm max-[680px]:text-xs">{formatDate(startIso, { weekday: undefined })} <span className="mx-1 font-normal text-muted">تا</span> {formatDate(dateToIso(addDays(weekStart, 5)), { weekday: undefined })}</strong>
          <button aria-label="هفتهٔ بعد" className={`${iconButtonClass} max-[680px]:h-[34px] max-[680px]:w-[34px]`} onClick={() => {
            setLoading(true)
            setError('')
            requestId.current += 1
            setWeekStart((value) => addDays(value, 7))
          }} type="button"><ChevronLeft size={18} /></button>
          <button className={buttonClass('primary', 'min-h-[36px] px-3 py-1.5 text-xs whitespace-nowrap max-[680px]:min-h-[34px] max-[680px]:px-2')} onClick={() => {
            const currentWeek = getWeekStart(new Date())
            if (dateToIso(currentWeek) === startIso) return
            setLoading(true)
            setError('')
            requestId.current += 1
            setWeekStart(currentWeek)
          }} type="button">هفته جاری</button>
        </div>
        <div className="flex items-baseline gap-[7px] text-xs text-muted max-[680px]:self-start"><strong className="text-xl text-accent">{formatNumber(reservationCount)}</strong><span>رزرو فعال</span></div>
      </div>

      <div className="my-3 mt-[18px] flex flex-wrap gap-[7px] max-[680px]:my-2 max-[680px]:mt-[13px] max-[680px]:flex-nowrap max-[680px]:overflow-x-auto max-[680px]:pb-[3px]" role="group" aria-label="فیلتر روزها">
        {([
          ['all', 'همهٔ روزها'], ['reserved', 'رزروهای من'], ['open', 'رزرو نشده'],
        ] as const).map(([key, label]) => <button aria-pressed={filter === key} className={`inline-flex min-h-9 shrink-0 cursor-pointer items-center justify-center rounded-full border px-3 py-[7px] text-xs transition-colors duration-150 focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#63a5b4] ${filter === key ? 'border-accent/40 bg-accent-soft font-semibold text-accent' : 'border-line bg-surface font-normal text-muted hover:bg-raised hover:text-ink'}`} key={key} onClick={() => setFilter(key)} type="button">{label}</button>)}
      </div>

      {error && <ErrorMessage message={error} onRetry={() => void load()} />}
      {/* Dynamic menu categories */}
      {categories.length > 0 && (
        <div
          role="tablist"
          aria-label="دسته‌بندی منوی غذا"
          className="flex flex-wrap items-center justify-start gap-2 border-b border-line py-3"
        >
          {categories.map((category) => {
            const isActive = activeCategory === category.slug

            return (
              <button
                key={category.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveCategory(category.slug)}
                className={`inline-flex min-h-10 items-center justify-center rounded-full border px-5 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#EF816E] ${
                  isActive
                    ? 'border-[#EF816E] bg-[#FCE8E3] text-[#C95443] dark:border-[#EF816E] dark:bg-[#EF816E]/20 dark:text-[#FFAA98]'
                    : 'border-[#EF816E]/60 bg-transparent text-[#C95443] hover:bg-[#FCE8E3] dark:text-[#FFAA98] dark:hover:bg-[#EF816E]/10'
                }`}
              >
                {category.name}
              </button>
            )
          })}
        </div>
      )}

      {loading ? <WeekSkeleton /> : visibleDays.length === 0 ? <EmptyState title="روزی با این فیلتر پیدا نشد" detail="فیلتر دیگری را انتخاب کن." /> : (
        <div className="border-t border-line">
      {visibleDays.map(({ date, menu }, index) => (
            <DayRow
              date={date}
              index={index}
              key={date}
              menu={menu}
              onEdit={() => menu && setEditor(menu)}
            />
          ))}
        </div>
      )}

      {editor && (
        <ReservationDialog
          key={editor.id}
          menu={editor}
          dayMenus={menus.filter((item) => item.date === editor.date)}
          sides={sides}
          drinks={drinks}
          onClose={() => setEditor(null)}
          onSaved={load}
        />
      )}
    </section>
  )
}

function DayRow({ date, index, menu, onEdit }: { date: string; index: number; menu: WeeklyMenu | null; onEdit: () => void }) {
  const today = dateToIso(new Date()) === date
  const reservation = menu?.reservation ?? null
  const activeReservation = reservation?.status === 'res'

  return (
    <article className={`grid min-h-[84px] grid-cols-[minmax(120px,0.8fr)_minmax(190px,1.55fr)_minmax(100px,0.7fr)_minmax(120px,auto)] items-center gap-[18px] border-b border-line px-1 py-[13px] max-[900px]:grid-cols-[minmax(105px,0.7fr)_minmax(160px,1.3fr)_minmax(85px,0.6fr)_auto] max-[900px]:gap-[10px] max-[680px]:grid-cols-[minmax(0,1fr)_auto] max-[680px]:gap-x-3 max-[680px]:gap-y-2 max-[680px]:px-[2px] max-[680px]:py-[14px] ${today ? "relative before:absolute before:inset-y-[15px] before:start-[-10px] before:w-[3px] before:rounded-[3px] before:bg-coral before:content-['']" : ""}${index > 4 ? " weekend" : ""}`}>
      <div className="flex min-w-0 flex-col gap-1 max-[680px]:col-start-1 max-[680px]:row-start-1 max-[680px]:flex-row max-[680px]:flex-wrap max-[680px]:items-baseline max-[680px]:gap-x-2">
        <strong className="text-sm max-[680px]:text-sm">{formatWeekday(date)}</strong>
        <span className="text-xs text-muted max-[680px]:text-xs">{formatDate(date, { weekday: undefined, month: 'short' })}</span>
        {today && <span className="mt-[2px] self-start text-[11px] font-semibold text-accent max-[680px]:mt-0">امروز</span>}
      </div>
      <div className="flex min-w-0 flex-col gap-1 max-[680px]:col-start-1 max-[680px]:row-start-2">
        {menu ? (
          <div className="flex min-w-0 items-center gap-3">
            {menu.food_image_data?.url && (
              <img
                src={menu.food_image_data.url}
                alt={menu.food_image_data.alt}
                loading="lazy"
                className="h-14 w-14 shrink-0 rounded-lg object-cover"
              />
            )}
            <div className="flex min-w-0 flex-col gap-1">
              <strong className="truncate text-sm max-[680px]:text-sm">
                {menu.food_name}
              </strong>
              <span className="text-xs text-muted">
                {formatMoney(menu.food_price)}
              </span>
            </div>
          </div>
        ) : <><strong className="truncate text-sm text-muted max-[680px]:text-sm">منویی ثبت نشده</strong><span className="text-xs text-muted">برای این روز هنوز غذایی در برنامه نیست.</span></>}
      </div>
      <div className="flex items-center gap-2 whitespace-nowrap text-xs text-muted max-[680px]:col-start-2 max-[680px]:row-start-1 max-[680px]:justify-self-end max-[680px]:text-xs">
        {activeReservation ? <>
          <span className="h-2 w-2 rounded-full bg-positive" />
          <span>رزرو شده</span>
        </> : reservation?.status === 'can' ? <>
          <span className="h-2 w-2 rounded-full bg-[#92999d]" />
          <span>لغو شده</span>
        </> : menu ? <>
          <span className={`h-2 w-2 rounded-full ${menu.can_reserve ? 'bg-coral' : 'bg-muted'}`} />
          <span>{menu.can_reserve ? 'رزرو نشده' : 'مهلت گذشته'}</span>
        </> : <span className="text-muted">—</span>}
      </div>
      <div className="day-action flex justify-start max-[680px]:col-start-2 max-[680px]:row-start-2 max-[680px]:self-center">
        {menu && (activeReservation
          ? menu.can_reserve
            ? <button className={buttonClass('secondary', '', 'day')} onClick={onEdit} type="button">ویرایش / لغو</button>
            : <button className={buttonClass('disabled', '', 'day')} disabled type="button">مهلت تمام شده</button>
          : menu.can_reserve
            ? <button className={buttonClass('primary', '', 'day')} onClick={onEdit} type="button"><Plus size={16} /> {reservation?.status === 'can' ? 'رزرو مجدد' : 'انتخاب غذا'}</button>
            : <button className={buttonClass('disabled', '', 'day')} disabled type="button">مهلت تمام شده</button>)}
      </div>
    </article>
  )
}
