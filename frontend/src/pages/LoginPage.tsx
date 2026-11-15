import { ChevronLeft, Eye, EyeOff, LockKeyhole, UserRound } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import BrandMark from '../components/layout/BrandMark'
import { useBranding } from '../app/branding'
import { getApiMessage } from '../utils/errors'

type LoginScreenProps = {
  initialError: string
  onSubmit: (username: string, password: string) => Promise<void>
}

export default function LoginScreen({
  initialError,
  onSubmit,
}: LoginScreenProps) {
  const branding = useBranding()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (busy) return

    setBusy(true)
    setError('')

    try {
      await onSubmit(username.trim(), password)
    } catch (submitError) {
      setError(getApiMessage(submitError))
    } finally {
      setBusy(false)
    }
  }

  const displayedError = error || initialError

  return (
    <main
      dir="rtl"
      className="
        relative isolate flex min-h-svh min-h-dvh
        w-full items-center justify-center
        overflow-x-hidden
        bg-[#f1f7fb] px-4 py-8
        text-[#172b4d]
        dark:bg-[#091720] dark:text-slate-100
        sm:px-6 sm:py-12
      "
    >
      {/* Background */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div
          className="
            absolute -top-[22%] -right-[20%]
            h-[65rem] w-[65rem] rounded-full
            bg-[radial-gradient(circle,rgba(96,165,250,0.25),transparent_65%)]
            dark:bg-[radial-gradient(circle,rgba(37,99,235,0.18),transparent_65%)]
          "
        />

        <div
          className="
            absolute -bottom-[35%] -left-[25%]
            h-[65rem] w-[65rem] rounded-full
            bg-[radial-gradient(circle,rgba(45,212,191,0.22),transparent_65%)]
            dark:bg-[radial-gradient(circle,rgba(20,184,166,0.13),transparent_65%)]
          "
        />

        <div
          className="
            absolute inset-0
            bg-[linear-gradient(135deg,rgba(255,255,255,0.6),transparent_55%)]
            dark:bg-[linear-gradient(135deg,rgba(15,23,42,0.3),transparent_55%)]
          "
        />
      </div>

      {/* Login Card */}
      <section
        aria-labelledby="login-title"
        className="
          relative w-full max-w-[460px]
          rounded-[28px]
          border border-white/80
          bg-white/80
          px-6 py-8
          shadow-[0_24px_80px_-30px_rgba(36,84,132,0.22)]
          backdrop-blur-xl
          dark:border-white/10
          dark:bg-[#142632]/90
          dark:shadow-[0_24px_80px_-30px_rgba(0,0,0,0.65)]
          sm:px-10 sm:py-10
        "
      >
        {/* Header */}


        <header className="mb-8 flex w-full flex-col items-center text-center">
          <div className="mb-7 flex w-full justify-center">
            <BrandMark variant="login" />
          </div>

          <h1
            id="login-title"
            className="m-0 w-full text-center text-[30px] font-bold leading-[1.5] text-[#172b4d] dark:text-white"
          >
            ورود به حساب
          </h1>

          <p className="mx-auto mt-2 w-full max-w-[340px] text-center text-sm leading-7 text-[#64748b] dark:text-slate-400">
            برای ادامه، کد پرسنلی و رمز عبور خود را وارد کنید.
          </p>
        </header>



        {/* Login Form */}
        <form
          className="space-y-5"
          onSubmit={submit}
          aria-busy={busy}
        >
          {/* Personnel Number */}
          <div>
            <label
              htmlFor="personnel-number"
              className="
                mb-2 block text-sm font-semibold
                text-[#253858]
                dark:text-slate-200
              "
            >
              کد پرسنلی
            </label>

            <div className="relative">
              <UserRound
                aria-hidden="true"
                size={19}
                strokeWidth={1.8}
                className="
                  pointer-events-none absolute
                  right-4 top-1/2 -translate-y-1/2
                  text-[#94a3b8]
                "
              />

              <input
                id="personnel-number"
                name="username"
                type="text"
                inputMode="numeric"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={32}
                required
                disabled={busy}
                value={username}
                onChange={(event) => {
                  setUsername(event.target.value)
                  if (error) setError('')
                }}
                placeholder="مثلاً 10245"
                className="
                  h-[52px] w-full
                  rounded-xl
                  border border-[#d8e3ef]
                  bg-white/85
                  pr-12 pl-4
                  text-[15px] text-[#172b4d]
                  outline-none
                  transition-[border-color,box-shadow,background-color]
                  duration-200
                  placeholder:text-[#94a3b8]
                  hover:border-[#b8cadf]
                  focus:border-[#397cf6]
                  focus:ring-4 focus:ring-blue-500/10
                  disabled:cursor-not-allowed
                  disabled:opacity-60
                  dark:border-white/15
                  dark:bg-white/5
                  dark:text-white
                  dark:placeholder:text-slate-500
                  dark:hover:border-white/25
                  dark:focus:border-blue-400
                  dark:focus:ring-blue-400/15
                "
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label
              htmlFor="password"
              className="
                mb-2 block text-sm font-semibold
                text-[#253858]
                dark:text-slate-200
              "
            >
              رمز عبور
            </label>

            <div className="relative">
              <LockKeyhole
                aria-hidden="true"
                size={19}
                strokeWidth={1.8}
                className="
                  pointer-events-none absolute
                  right-4 top-1/2 -translate-y-1/2
                  text-[#94a3b8]
                "
              />

              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                disabled={busy}
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value)
                  if (error) setError('')
                }}
                placeholder="رمز عبور خود را وارد کنید"
                className="
                  h-[52px] w-full
                  rounded-xl
                  border border-[#d8e3ef]
                  bg-white/85
                  pr-12 pl-12
                  text-[15px] text-[#172b4d]
                  outline-none
                  transition-[border-color,box-shadow,background-color]
                  duration-200
                  placeholder:text-[#94a3b8]
                  hover:border-[#b8cadf]
                  focus:border-[#397cf6]
                  focus:ring-4 focus:ring-blue-500/10
                  disabled:cursor-not-allowed
                  disabled:opacity-60
                  dark:border-white/15
                  dark:bg-white/5
                  dark:text-white
                  dark:placeholder:text-slate-500
                  dark:hover:border-white/25
                  dark:focus:border-blue-400
                  dark:focus:ring-blue-400/15
                "
              />

              <button
                type="button"
                disabled={busy}
                onClick={() => setShowPassword((value) => !value)}
                aria-label={
                  showPassword
                    ? 'مخفی کردن رمز عبور'
                    : 'نمایش رمز عبور'
                }
                aria-pressed={showPassword}
                className="
                  absolute left-1.5 top-1/2
                  flex h-10 w-10 -translate-y-1/2
                  cursor-pointer
                  items-center justify-center
                  rounded-lg
                  text-[#94a3b8]
                  transition-colors duration-200
                  hover:bg-blue-50
                  hover:text-[#2563eb]
                  focus-visible:outline-2
                  focus-visible:outline-offset-2
                  focus-visible:outline-blue-500
                  disabled:cursor-not-allowed
                  dark:hover:bg-white/10
                  dark:hover:text-blue-300
                "
              >
                {showPassword ? (
                  <EyeOff aria-hidden="true" size={19} />
                ) : (
                  <Eye aria-hidden="true" size={19} />
                )}
              </button>
            </div>
          </div>

          {/* Error */}
          {displayedError && (
            <div
              role="alert"
              className="
                rounded-xl
                border border-red-200
                bg-red-50
                px-4 py-3
                text-sm leading-7
                text-red-700
                dark:border-red-500/20
                dark:bg-red-500/10
                dark:text-red-300
              "
            >
              {displayedError}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={busy}
            className="
              group relative
              flex h-[52px] w-full
              cursor-pointer
              items-center justify-center
              gap-2 overflow-hidden
              rounded-xl
              bg-gradient-to-l
              from-[#338cff] to-[#215af1]
              px-5
              text-[15px] font-bold
              text-white!
              shadow-[0_12px_26px_-10px_rgba(37,99,235,0.55)]
              transition-[filter,box-shadow]
              duration-200
              hover:not-disabled:brightness-105
              hover:not-disabled:shadow-[0_15px_30px_-10px_rgba(37,99,235,0.65)]
              focus-visible:outline-2
              focus-visible:outline-offset-4
              focus-visible:outline-blue-500
              active:not-disabled:brightness-95
              disabled:cursor-not-allowed
              disabled:opacity-60
              dark:text-white!
            "
          >
            {busy ? (
              <>
                <span
                  aria-hidden="true"
                  className="
                    h-4 w-4 animate-spin
                    rounded-full
                    border-2 border-white/30
                    border-t-white
                    motion-reduce:animate-none
                  "
                />
                در حال ورود…
              </>
            ) : (
              <>
                ورود به حساب
                <ChevronLeft
                  aria-hidden="true"
                  size={19}
                  className="
                    transition-transform
                    duration-200
                    group-hover:-translate-x-0.5
                    motion-reduce:transform-none
                  "
                />
              </>
            )}
          </button>
        </form>

        {/* Footer */}
        <footer className="mt-7 text-center">
          <p
            className="
              text-[10px] leading-5
              sm:text-xs sm:leading-7
              text-[#7890a8]
              dark:text-slate-400
            "
          >
            جهت حفظ امنیت حساب کاربری، رمز عبور خود را در اولین ورود تغییر دهید.
          </p>
        </footer>
      </section>

      {/* Brand accessibility */}
      <span className="sr-only">
        {branding.site_name} - {branding.site_description}
      </span>
    </main>
  )
}
