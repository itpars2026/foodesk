import { canCreateEmployee as hasEmployeeCreatePermission } from '../app/permissions'
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { ChevronDown, KeyRound, Save, UserRound, UserRoundPlus } from 'lucide-react'

import {
  changePassword,
  getProfile,
  getProfileOptions,
  updateProfile,
} from '../api/endpoints'
import type { Profile, ProfileOption, ProfileOptions } from '../api/types'
import { api } from '../api/client'
import type { User } from '../api/types'
import SubsidyPreferencesPanel from '../components/SubsidyPreferencesPanel'
import { getApiMessage } from '../utils/errors'
import { isNumericOnlyPassword } from '../utils/password'

function ProfileSelect({
  id,
  label,
  value,
  currentNumber,
  options,
  disabled,
  onChange,
}: {
  id: string
  label: string
  value: string
  currentNumber: string | null
  options: ProfileOption[]
  disabled: boolean
  onChange: (value: string) => void
}) {
  const currentIsUnavailable =
    value !== '' && !options.some((option) => String(option.id) === value)

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-12 lg:min-h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
      >
        <option value="" disabled>
          انتخاب {label}
        </option>
        {currentIsUnavailable && (
          <option value={value} disabled>
            {currentNumber ?? value} (غیرفعال)
          </option>
        )}
        {options.map((option) => (
          <option key={option.id} value={String(option.id)}>
            {option.number}
          </option>
        ))}
      </select>
    </div>
  )
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [canCreateEmployee, setCanCreateEmployee] = useState(false)
  const [options, setOptions] = useState<ProfileOptions | null>(null)
  const [building, setBuilding] = useState('')
  const [department, setDepartment] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState('')

  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState('')
  const [expandedSection, setExpandedSection] = useState<'details' | 'subsidy' | 'password' | 'create-employee' | null>(null)

  const [employeeNumber, setEmployeeNumber] = useState('')
  const [employeeNationalId, setEmployeeNationalId] = useState('')
  const [employeeBuilding, setEmployeeBuilding] = useState('')
  const [employeeDepartment, setEmployeeDepartment] = useState('')
  const [employeeBusy, setEmployeeBusy] = useState(false)
  const [employeeError, setEmployeeError] = useState('')
  const [employeeSuccess, setEmployeeSuccess] = useState('')

  useEffect(() => {
    let active = true

    // Session/permission lookup must not prevent the user from editing their profile.
    void api<User>('/auth/session')
      .then((session) => {
        if (active) {
          setCanCreateEmployee(hasEmployeeCreatePermission(session))
        }
      })
      .catch(() => {
        if (active) setCanCreateEmployee(false)
      })

    Promise.all([getProfile(), getProfileOptions()])
      .then(([data, available]) => {
        if (!active) return

        setProfile(data)
        setOptions(available)
        setBuilding(data.building === null ? '' : String(data.building))
        setDepartment(data.department === null ? '' : String(data.department))
        setLoadError('')
      })
      .catch((error: unknown) => {
        if (active) setLoadError(getApiMessage(error))
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  const buildingChanged =
    profile !== null &&
    building !== '' &&
    building !== String(profile.building ?? '')

  const departmentChanged =
    profile !== null &&
    department !== '' &&
    department !== String(profile.department ?? '')

  async function savePreferences(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!profile || !options || saving) return
    if (!buildingChanged && !departmentChanged) return

    const changes: { building?: number; department?: number } = {}

    if (buildingChanged) {
      changes.building = Number(building)
    }

    if (departmentChanged) {
      changes.department = Number(department)
    }

    setSaving(true)
    setSaveError('')
    setSaveSuccess('')

    try {
      const updated = await updateProfile(changes)
      setProfile(updated)
      setBuilding(updated.building === null ? '' : String(updated.building))
      setDepartment(updated.department === null ? '' : String(updated.department))
      setSaveSuccess('اطلاعات پروفایل با موفقیت ذخیره شد.')
    } catch (error) {
      setSaveError(getApiMessage(error))
    } finally {
      setSaving(false)
    }
  }

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (passwordBusy) return

    if (isNumericOnlyPassword(newPassword)) {
      setPasswordError('رمز عبور نباید فقط شامل عدد باشد. لطفاً از ترکیب حروف و اعداد استفاده کنید.')
      setPasswordSuccess('')
      return
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('رمز جدید و تکرار آن یکسان نیستند.')
      setPasswordSuccess('')
      return
    }

    setPasswordBusy(true)
    setPasswordError('')
    setPasswordSuccess('')

    try {
      await changePassword(oldPassword, newPassword, confirmPassword)
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setPasswordSuccess('رمز عبور با موفقیت تغییر کرد.')
    } catch (error) {
      setPasswordError(getApiMessage(error))
    } finally {
      setPasswordBusy(false)
    }
  }


  async function createEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (employeeBusy || !canCreateEmployee || !options) return

    const personnelNumber = employeeNumber.trim()
    const nationalId = employeeNationalId.trim()
    const selectedBuilding = options.buildings.find(
      (option) => String(option.id) === employeeBuilding,
    )
    const selectedDepartment = options.departments.find(
      (option) => String(option.id) === employeeDepartment,
    )

    if (!personnelNumber || !selectedBuilding || !selectedDepartment) {
      setEmployeeSuccess('')
      setEmployeeError('کد پرسنلی، ساختمان و دپارتمان الزامی هستند.')
      return
    }

    if (!/^[0-9]{10}$/.test(nationalId)) {
      setEmployeeSuccess('')
      setEmployeeError('کد ملی باید دقیقاً ۱۰ رقم باشد.')
      return
    }

    setEmployeeBusy(true)
    setEmployeeError('')
    setEmployeeSuccess('')
    try {
      await api('/employees', {
        method: 'POST',
        body: JSON.stringify({
          personnel_number: personnelNumber,
          national_id: nationalId,
          building_number: selectedBuilding.number,
          department_number: selectedDepartment.number,
          is_active: true,
        }),
      })
      setEmployeeNumber('')
      setEmployeeNationalId('')
      setEmployeeBuilding('')
      setEmployeeDepartment('')
      setEmployeeSuccess('کاربر جدید با موفقیت ایجاد شد. در اولین ورود باید رمز عبور خود را تغییر دهد.')
    } catch (error) {
      setEmployeeError(getApiMessage(error))
    } finally {
      setEmployeeBusy(false)
    }
  }

  if (loading) {
    return (
      <div role="status" className="py-16 text-center text-sm text-muted">
        در حال دریافت اطلاعات پروفایل…
      </div>
    )
  }

  if (loadError || !profile || !options) {
    return (
      <section className="rounded-xl border border-line bg-surface p-6">
        <h1 className="mb-3 text-xl font-bold">پروفایل</h1>
        <p role="alert" className="text-sm text-negative">
          {loadError || 'دریافت اطلاعات پروفایل امکان‌پذیر نیست.'}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 min-h-10 cursor-pointer rounded-lg border border-line px-4 text-sm"
        >
          تلاش مجدد
        </button>
      </section>
    )
  }

  return (
    <section className="mx-auto flex w-full max-w-[800px] flex-col gap-4" aria-labelledby="profile-title">
      <header className="mb-2 flex items-center gap-3">
        <div className="flex size-12 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <UserRound aria-hidden="true" size={24} />
        </div>
        <div>
          <h1 id="profile-title" className="m-0 text-2xl font-bold text-ink">پروفایل</h1>
          <p className="mt-1 text-sm text-muted">اطلاعات و تنظیمات حساب کاربری</p>
        </div>
      </header>

      <article className="overflow-hidden rounded-xl border border-line bg-surface">
        <h2 className="m-0">
          <button
            type="button"
            id="profile-details-trigger"
            aria-expanded={expandedSection === 'details'}
            aria-controls="profile-details-panel"
            onClick={() => setExpandedSection((section) => section === 'details' ? null : 'details')}
            className="flex min-h-14 w-full cursor-pointer items-center justify-between gap-3 bg-accent-soft px-4 py-3 text-right text-accent transition-colors hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-accent dark:hover:brightness-110 sm:px-5"
          >
            <span className="flex items-center gap-2 text-sm font-bold sm:text-base">
              <ChevronDown aria-hidden="true" size={18} className={`transition-transform duration-200 motion-reduce:transition-none ${expandedSection === 'details' ? '' : '-rotate-90'}`} />
              اطلاعات پروفایل
            </span>
          </button>
        </h2>
        {expandedSection === 'details' && (
          <div id="profile-details-panel" role="region" aria-labelledby="profile-details-trigger" className="bg-raised/50 p-3 sm:p-4">
            <form onSubmit={(event) => void savePreferences(event)} className="rounded-lg border border-line bg-surface p-4 sm:p-5">
            <div className="mb-5 flex flex-col gap-2 lg:mb-3">
              <label htmlFor="personnel-number" className="text-sm font-semibold text-ink">
                کد پرسنلی
              </label>
              <input
                id="personnel-number"
                value={profile.personnel_number}
                readOnly
                className="min-h-12 lg:min-h-10 rounded-lg border border-line bg-raised px-3 text-sm text-muted"
              />
            </div>

            <div className="grid grid-cols-2 gap-4 max-[680px]:grid-cols-1 lg:gap-3">
              <ProfileSelect
                id="profile-building"
                label="شماره ساختمان"
                value={building}
                currentNumber={profile.building_number}
                options={options.buildings}
                disabled={saving}
                onChange={(value) => {
                  setBuilding(value)
                  setSaveError('')
                  setSaveSuccess('')
                }}
              />
              <ProfileSelect
                id="profile-department"
                label="شماره دپارتمان"
                value={department}
                currentNumber={profile.department_number}
                options={options.departments}
                disabled={saving}
                onChange={(value) => {
                  setDepartment(value)
                  setSaveError('')
                  setSaveSuccess('')
                }}
              />
            </div>

            {saveError && (
              <p role="alert" className="mt-4 text-sm text-negative">{saveError}</p>
            )}
            {saveSuccess && (
              <p role="status" className="mt-4 text-sm text-positive">{saveSuccess}</p>
            )}

            <div className="mt-6 flex justify-end lg:mt-3">
              <button
                type="submit"
                disabled={saving || (!buildingChanged && !departmentChanged)}
                className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg bg-accent px-5 text-sm font-semibold text-[var(--accent-contrast)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Save aria-hidden="true" size={17} />
                {saving ? 'در حال ذخیره…' : 'ذخیره تغییرات'}
              </button>
            </div>
            </form>
          </div>
        )}
      </article>

      <article className="overflow-hidden rounded-xl border border-line bg-surface">
        <h2 className="m-0">
          <button
            type="button"
            id="profile-subsidy-trigger"
            aria-expanded={expandedSection === 'subsidy'}
            aria-controls="profile-subsidy-panel"
            onClick={() => setExpandedSection((section) => section === 'subsidy' ? null : 'subsidy')}
            className="flex min-h-14 w-full cursor-pointer items-center justify-between gap-3 bg-accent-soft px-4 py-3 text-right text-accent transition-colors hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-accent dark:hover:brightness-110 sm:px-5"
          >
            <span className="flex items-center gap-2 text-sm font-bold sm:text-base">
              <ChevronDown aria-hidden="true" size={18} className={`transition-transform duration-200 motion-reduce:transition-none ${expandedSection === 'subsidy' ? '' : '-rotate-90'}`} />
              تنظیمات یارانه غذا
            </span>
          </button>
        </h2>
        {expandedSection === 'subsidy' && (
          <div id="profile-subsidy-panel" role="region" aria-labelledby="profile-subsidy-trigger" className="bg-raised/50 p-3 sm:p-4">
            <SubsidyPreferencesPanel />
          </div>
        )}
      </article>

      <article className="overflow-hidden rounded-xl border border-line bg-surface">
        <h2 className="m-0">
          <button
            type="button"
            id="profile-password-trigger"
            aria-expanded={expandedSection === 'password'}
            aria-controls="profile-password-panel"
            onClick={() => setExpandedSection((section) => section === 'password' ? null : 'password')}
            className="flex min-h-14 w-full cursor-pointer items-center justify-between gap-3 bg-accent-soft px-4 py-3 text-right text-accent transition-colors hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-accent dark:hover:brightness-110 sm:px-5"
          >
            <span className="flex items-center gap-2 text-sm font-bold sm:text-base">
              <ChevronDown aria-hidden="true" size={18} className={`transition-transform duration-200 motion-reduce:transition-none ${expandedSection === 'password' ? '' : '-rotate-90'}`} />
              <KeyRound aria-hidden="true" size={18} />
              تغییر رمز عبور
            </span>
          </button>
        </h2>
        {expandedSection === 'password' && (
          <div id="profile-password-panel" role="region" aria-labelledby="profile-password-trigger" className="bg-raised/50 p-3 sm:p-4">
            <form onSubmit={(event) => void savePassword(event)} className="rounded-lg border border-line bg-surface p-4 sm:p-5">
            <div className="flex flex-col gap-4 lg:gap-2">
              {[
                { id: 'current-password', label: 'رمز فعلی', value: oldPassword, setter: setOldPassword, complete: 'current-password' },
                { id: 'new-profile-password', label: 'رمز جدید', value: newPassword, setter: setNewPassword, complete: 'new-password' },
                { id: 'confirm-profile-password', label: 'تکرار رمز جدید', value: confirmPassword, setter: setConfirmPassword, complete: 'new-password' },
              ].map((field) => (
                <div key={field.id} className="flex flex-col gap-2">
                  <label htmlFor={field.id} className="text-sm font-semibold text-ink">
                    {field.label}
                  </label>
                  <input
                    id={field.id}
                    type="password"
                    autoComplete={field.complete}
                    required
                    value={field.value}
                    disabled={passwordBusy}
                    onChange={(event) => {
                      field.setter(event.target.value)
                      setPasswordError('')
                      setPasswordSuccess('')
                    }}
                    className="min-h-12 lg:min-h-10 rounded-lg border border-line bg-surface px-3 text-sm text-ink outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent"
                  />
                </div>
              ))}
            </div>

            <p className="mt-4 text-xs leading-7 text-muted lg:mt-2">
              رمز جدید باید شرایط امنیتی سامانه را داشته باشد و با کد پرسنلی یکسان نباشد.
            </p>

            {passwordError && (
              <p role="alert" className="mt-3 text-sm text-negative">{passwordError}</p>
            )}
            {passwordSuccess && (
              <p role="status" className="mt-3 text-sm text-positive">{passwordSuccess}</p>
            )}

            <div className="mt-5 flex justify-end lg:mt-3">
              <button
                type="submit"
                disabled={passwordBusy}
                className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg bg-accent px-5 text-sm font-semibold text-[var(--accent-contrast)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <KeyRound aria-hidden="true" size={17} />
                {passwordBusy ? 'در حال تغییر…' : 'تغییر رمز عبور'}
              </button>
            </div>
            </form>
          </div>
        )}
      </article>

      {canCreateEmployee && (
        <article className="overflow-hidden rounded-xl border border-line bg-surface">
          <h2 className="m-0">
            <button
              type="button"
              id="profile-create-employee-trigger"
              aria-expanded={expandedSection === 'create-employee'}
              aria-controls="profile-create-employee-panel"
              onClick={() => setExpandedSection((section) => section === 'create-employee' ? null : 'create-employee')}
              className="flex min-h-14 w-full cursor-pointer items-center justify-between gap-3 bg-accent-soft px-4 py-3 text-right text-accent transition-colors hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-accent dark:hover:brightness-110 sm:px-5"
            >
              <span className="flex items-center gap-2 text-sm font-bold sm:text-base">
                <ChevronDown aria-hidden="true" size={18} className={`transition-transform duration-200 motion-reduce:transition-none ${expandedSection === 'create-employee' ? '' : '-rotate-90'}`} />
                <UserRoundPlus aria-hidden="true" size={18} />
                افزودن کاربر
              </span>
            </button>
          </h2>
          {expandedSection === 'create-employee' && (
            <div id="profile-create-employee-panel" role="region" aria-labelledby="profile-create-employee-trigger" className="bg-raised/50 p-3 sm:p-4">
              <form onSubmit={(event) => void createEmployee(event)} className="rounded-lg border border-line bg-surface p-4 sm:p-5">
                <div className="mb-4 flex flex-col gap-2">
                  <label htmlFor="new-employee-number" className="text-sm font-semibold text-ink">کد پرسنلی</label>
                  <input
                    id="new-employee-number"
                    type="text"
                    required
                    maxLength={32}
                    autoComplete="off"
                    value={employeeNumber}
                    disabled={employeeBusy}
                    onChange={(event) => {
                      setEmployeeNumber(event.target.value)
                      setEmployeeError('')
                      setEmployeeSuccess('')
                    }}
                    className="min-h-12 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent lg:min-h-10"
                  />
                </div>
                <div className="mb-4 flex flex-col gap-2">
                  <label htmlFor="new-employee-national-id" className="text-sm font-semibold text-ink">
                    کد ملی
                  </label>
                  <input
                    id="new-employee-national-id"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{10}"
                    minLength={10}
                    maxLength={10}
                    required
                    autoComplete="off"
                    value={employeeNationalId}
                    disabled={employeeBusy}
                    onChange={(event) => {
                      setEmployeeNationalId(event.target.value)
                      setEmployeeError('')
                      setEmployeeSuccess('')
                    }}
                    className="min-h-12 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent lg:min-h-10"
                  />
                  <p className="text-xs text-muted">
                    رمز اولیه کاربر برابر کد ملی است.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4 max-[680px]:grid-cols-1 lg:gap-3">
                  <div className="flex flex-col gap-2">
                    <label htmlFor="new-employee-building" className="text-sm font-semibold text-ink">شماره ساختمان</label>
                    <select
                      id="new-employee-building"
                      value={employeeBuilding}
                      required
                      disabled={employeeBusy}
                      onChange={(event) => {
                        setEmployeeBuilding(event.target.value)
                        setEmployeeError('')
                        setEmployeeSuccess('')
                      }}
                      className="min-h-12 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent lg:min-h-10"
                    >
                      <option value="" disabled>انتخاب ساختمان</option>
                      {options.buildings.map((option) => (
                        <option key={option.id} value={String(option.id)}>{option.number}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label htmlFor="new-employee-department" className="text-sm font-semibold text-ink">شماره دپارتمان</label>
                    <select
                      id="new-employee-department"
                      value={employeeDepartment}
                      required
                      disabled={employeeBusy}
                      onChange={(event) => {
                        setEmployeeDepartment(event.target.value)
                        setEmployeeError('')
                        setEmployeeSuccess('')
                      }}
                      className="min-h-12 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent lg:min-h-10"
                    >
                      <option value="" disabled>انتخاب دپارتمان</option>
                      {options.departments.map((option) => (
                        <option key={option.id} value={String(option.id)}>{option.number}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <p className="mt-4 text-xs leading-7 text-muted">
                  حساب کاربر جدید فعال خواهد بود. رمز اولیه برابر کد ملی است و تغییر آن در اولین ورود اجباری است.
                </p>
                {employeeError && <p role="alert" className="mt-3 text-sm text-negative">{employeeError}</p>}
                {employeeSuccess && <p role="status" className="mt-3 text-sm text-positive">{employeeSuccess}</p>}
                <div className="mt-5 flex justify-end lg:mt-3">
                  <button
                    type="submit"
                    disabled={employeeBusy || !employeeNumber.trim() || !/^[0-9]{10}$/.test(employeeNationalId.trim()) || !employeeBuilding || !employeeDepartment}
                    className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg bg-accent px-5 text-sm font-semibold text-[var(--accent-contrast)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <UserRoundPlus aria-hidden="true" size={17} />
                    {employeeBusy ? 'در حال ایجاد…' : 'ایجاد کاربر'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </article>
      )}

    </section>
  )
}
