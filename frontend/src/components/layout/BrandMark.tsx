import { Utensils } from 'lucide-react'
import { useBranding } from '../../app/branding'

type BrandVariant = 'default' | 'login' | 'sidebar' | 'mobile'

export default function BrandMark({
  variant = 'default',
}: {
  variant?: BrandVariant
}) {
  const branding = useBranding()
  const isLogin = variant === 'login'
  const isMobile = variant === 'mobile'

  const containerClass = [
    'flex items-center gap-[10px] font-bold tracking-[-0.3px]',
    isMobile ? 'min-w-0 text-[15px]' : 'text-[17px]',
    isLogin
      ? 'relative z-[1] w-fit max-w-full justify-center text-[#172b4d] dark:text-white'
      : '',
    variant === 'sidebar' ? 'px-[7px] pb-7' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const symbolClass = [
    'grid shrink-0 place-items-center rounded-[11px]',
    isMobile ? 'h-8 w-8' : 'h-9 w-9',
    isLogin
      ? 'bg-gradient-to-br from-[#338cff] to-[#215af1] text-white shadow-[0_6px_16px_rgba(37,99,235,0.25)]'
      : 'bg-accent-soft text-accent',
  ].join(' ')

  return (
    <div className={containerClass} dir="rtl">
      <span className={symbolClass} aria-hidden="true">
        {branding.logo_url ? (
          <img
            src={branding.logo_url}
            alt=""
            className="h-full w-full rounded-[11px] object-contain"
          />
        ) : (
          <Utensils size={21} strokeWidth={1.8} />
        )}
      </span>

      <span className={isMobile ? 'min-w-0 truncate' : ''}>
        {branding.site_name}
      </span>
    </div>
  )
}
