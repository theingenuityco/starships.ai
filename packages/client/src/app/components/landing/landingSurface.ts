/**
 * Starships landing surfaces — sharp corners, neutral slate depth (no indigo offset “borders”).
 * Amber stays on primary propulsion CTAs.
 */

/**
 * Public marketing page floor — warmer than `bg-background` (97.5% L) so it visibly reads as cream.
 * Pair with `StarTheme theme="light"` (Pricing, Explore, etc.).
 */
export const marketingPublicPageWash = 'bg-[hsl(39_42%_96%)]'

export const landingMotion = 'transition-all duration-100 ease-out'

const softLift = `${landingMotion} hover:-translate-y-px`

/** Light — white */
export const panelLight = 'rounded-none border border-slate-200 bg-white shadow-[0_6px_20px_rgba(15,23,42,0.08)]'
export const panelLightLift = `${softLift} hover:shadow-[0_8px_24px_rgba(15,23,42,0.1)]`

/** Outer shells (dense blocks on cream sections) */
export const shellMuted = 'rounded-none border border-slate-200 bg-[#F8F8FA] shadow-[0_6px_20px_rgba(15,23,42,0.08)]'
export const shellMutedLift = `${softLift} hover:shadow-[0_8px_24px_rgba(15,23,42,0.1)]`

export const socialDark =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-none border border-white/15 bg-white/[0.06] text-white ' +
  `${landingMotion} hover:border-white/25 hover:bg-white/[0.1] hover:text-white active:opacity-90`

export const footerNavLinkDark = 'inline-flex w-full max-w-full items-center gap-1.5 rounded-none py-1.5 text-sm font-semibold text-white/90 transition-colors duration-100 hover:text-white'

export const footerEyebrowDark = 'pb-1 text-[11px] font-bold uppercase tracking-[0.16em] text-violet-200'

export const footerTopDividerLandingDark = 'absolute top-0 left-0 right-0 z-[15] h-px bg-gradient-to-r from-transparent via-violet-400/70 to-transparent'

export const footerTopDividerTheme = 'absolute top-0 left-0 right-0 z-[15] h-px bg-gradient-to-r from-transparent via-border/80 to-transparent'

export const footerVioletArc = 'radial-gradient(ellipse 1200px 650px at 50% 120%, rgba(168,85,247,0.18), transparent 72%)'

/** Primary CTA — amber + vertical plate; modest radius (4px / 2px shadow). */
export const landingPrimaryCta =
  'inline-flex items-center justify-center font-semibold leading-none rounded-lg whitespace-nowrap text-slate-900 ' +
  'bg-gradient-to-b from-amber-300 via-amber-400 to-amber-500 shadow-[0_4px_0_0_rgba(180,83,9,1)] ' +
  'hover:brightness-110 active:shadow-[0_2px_0_0_rgba(180,83,9,1)] active:-translate-y-[1px] transition'

/** Hero primary — larger plate (6px extrusion lip #b45309; active compresses to 4px). */
export const landingPrimaryCtaHero =
  'relative h-11 sm:h-12 w-full sm:w-auto max-w-[18rem] sm:max-w-none px-4 sm:px-6 text-sm sm:text-base leading-none overflow-hidden rounded-lg whitespace-normal break-words text-center text-slate-900 ' +
  'bg-gradient-to-b from-amber-300 via-amber-400 to-amber-500 shadow-[0_6px_0_0_rgba(180,83,9,1)] hover:brightness-110 active:shadow-[0_4px_0_0_rgba(180,83,9,1)] active:-translate-y-[1px] transition-transform transition-shadow ' +
  'disabled:opacity-100 disabled:bg-amber-400 disabled:text-slate-900'

export const landingPrimaryCtaSection = `${landingPrimaryCta} h-11 px-6 text-sm sm:text-base`

/** White face only — same amber plate + hover state as `landingPrimaryCta`, but default fill is white. */
export const landingPrimaryWhiteFaceCtaSection =
  'inline-flex items-center justify-center font-semibold leading-none rounded-lg whitespace-nowrap text-slate-900 ' +
  // Default: white face on amber plate
  'border border-slate-200/90 bg-gradient-to-b from-white via-white to-white shadow-[0_4px_0_0_rgba(180,83,9,1)] ' +
  // Hover: adopt the same amber gradient + brightness as Frigate primary CTA
  'hover:bg-gradient-to-b hover:from-amber-300 hover:via-amber-400 hover:to-amber-500 hover:brightness-110 ' +
  // Active: same pressed plate as primary
  'active:shadow-[0_2px_0_0_rgba(180,83,9,1)] active:-translate-y-[1px] active:brightness-110 transition ' +
  'h-11 px-6 text-sm sm:text-base'

/**
 * White CTA at section size — same extruded plate as `landingWhiteOnGradientCore`: hard 6px slate “lip” (no blur),
 * so it reads on tinted surfaces (amber plan-card wash was swallowing an amber-colored lip).
 */
export const landingWhiteCtaSection =
  'relative z-10 inline-flex items-center justify-center font-semibold leading-none rounded-lg whitespace-nowrap text-slate-900 ' +
  'border border-slate-200/90 bg-gradient-to-b from-white via-white to-slate-100 ' +
  'shadow-[0_6px_0_0_rgba(15,23,42,0.22)] active:translate-y-[1px] active:shadow-[0_3px_0_0_rgba(15,23,42,0.26)] ' +
  'h-11 px-6 text-sm sm:text-base transition-transform transition-shadow'

export const landingPrimaryCtaHeader = `${landingPrimaryCta} h-10 sm:h-11 px-5 sm:px-6 text-sm sm:text-base`

/** White plate on gradient CTA bands (matches PricingTeaser). */
const landingWhiteOnGradientCore =
  'relative inline-flex items-center justify-center overflow-hidden whitespace-nowrap rounded-lg border-0 bg-gradient-to-b from-white via-white to-slate-100 font-semibold leading-none text-slate-900 shadow-[0_6px_0_0_rgba(15,23,42,0.18)] transition hover:-translate-y-[1px] hover:shadow-[0_4px_0_0_rgba(15,23,42,0.22)] active:translate-y-[2px] active:shadow-[0_0px_0_0_rgba(15,23,42,0.22)] gap-2'

export const landingWhiteCtaOnGradientLg = `${landingWhiteOnGradientCore} h-14 px-8 text-base sm:text-lg`
export const landingWhiteCtaOnGradientMd = `${landingWhiteOnGradientCore} h-11 px-6 text-sm sm:text-base`

/** Secondary — light sections */
export const landingSecondaryCta =
  'inline-flex items-center justify-center gap-2 rounded-none border-2 border-slate-800 bg-white px-6 py-3 text-base font-semibold text-slate-800 ' +
  'shadow-[3px_3px_0_0_rgb(203_213_225)] transition-all duration-100 hover:bg-slate-900 hover:text-white hover:shadow-[4px_4px_0_0_rgb(148_163_184)] ' +
  'active:translate-x-0.5 active:translate-y-0.5 active:shadow-[2px_2px_0_0_rgb(203_213_225)]'

/** Header nav hit area: works on light pages and star-theme-dark landing. */
export const landingHeaderNavItem = 'transition-colors duration-100 rounded-none px-2 py-1 hover:bg-slate-900/[0.06] dark:hover:bg-white/10'

/** Inline image / screenshot frame */
export const landingFrameInset = 'rounded-none border-2 border-slate-200/80 bg-white shadow-[3px_3px_0_0_rgb(226_232_240)]'
