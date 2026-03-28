/**
 * Starships landing surfaces — shared “space brutal” vocabulary (footer + marketing):
 * hard offset shadows (no blur on chrome), sharp corners, fast motion, indigo/violet depth.
 * Amber stays on primary propulsion CTAs.
 */

export const landingMotion = 'transition-all duration-100 ease-out'

/** Dark panel (footer, dark deck callouts) */
export const panelDark = 'rounded-none bg-[#060b22]/90 shadow-[4px_4px_0_0_rgb(99_102_241)]'
export const panelDarkLift = `${landingMotion} hover:-translate-y-px hover:shadow-[5px_5px_0_0_rgb(167_139_250)]`

/** Light — white */
export const panelLight = 'rounded-none bg-white shadow-[4px_4px_0_0_rgb(99_102_241)]'
export const panelLightLift = `${landingMotion} hover:-translate-y-px hover:shadow-[5px_5px_0_0_rgb(167_139_250)]`

/** Light — #F8F8FA canvas */
export const panelMuted = 'rounded-none bg-[#F8F8FA] shadow-[4px_4px_0_0_rgb(99_102_241)]'
export const panelMutedLift = `${landingMotion} hover:-translate-y-px hover:shadow-[5px_5px_0_0_rgb(167_139_250)]`

/** Outer shells (dense blocks) */
export const shellMuted = 'rounded-none bg-[#F8F8FA] shadow-[5px_5px_0_0_rgb(99_102_241)]'
export const shellMutedLift = `${landingMotion} hover:-translate-y-px hover:shadow-[6px_6px_0_0_rgb(167_139_250)]`

export const socialDark =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-none bg-white/[0.07] text-white shadow-[3px_3px_0_0_rgb(139_92_246)] ' +
  `${landingMotion} hover:-translate-y-px hover:bg-white/[0.12] hover:shadow-[4px_4px_0_0_rgb(250_204_21)] hover:text-white ` +
  'active:translate-x-0.5 active:translate-y-0 active:shadow-[2px_2px_0_0_rgb(99_102_241)]'

export const footerNavLinkDark =
  'inline-flex w-full max-w-full items-center gap-1.5 rounded-none py-1.5 text-sm font-semibold text-white/90 transition-colors duration-100 hover:bg-white/[0.06] hover:text-white'

export const footerEyebrowDark = 'pb-1 text-[11px] font-bold uppercase tracking-[0.16em] text-violet-200'

export const footerTopDividerLandingDark =
  'absolute top-0 left-0 right-0 z-[15] h-px bg-gradient-to-r from-transparent via-violet-400/70 to-transparent'

export const footerTopDividerTheme = 'absolute top-0 left-0 right-0 z-[15] h-px bg-gradient-to-r from-transparent via-border/80 to-transparent'

export const footerVioletArc =
  'radial-gradient(ellipse 1200px 650px at 50% 120%, rgba(168,85,247,0.18), transparent 72%)'

/** Primary CTA — amber, square + classic vertical 3D “plate” (shadow below, no blur) */
export const landingPrimaryCta =
  'inline-flex items-center justify-center font-semibold leading-none rounded-none whitespace-nowrap text-slate-900 ' +
  'bg-gradient-to-b from-amber-300 via-amber-400 to-amber-500 shadow-[0_6px_0_0_rgba(180,83,9,1)] ' +
  'hover:brightness-110 active:shadow-[0_4px_0_0_rgba(180,83,9,1)] active:-translate-y-px transition-all duration-100'

export const landingPrimaryCtaHero = `${landingPrimaryCta} relative h-14 sm:h-16 w-full sm:w-auto max-w-[22rem] sm:max-w-none px-6 sm:px-10 text-lg sm:text-xl ` +
  'whitespace-normal break-words text-center [&_svg]:!w-12 [&_svg]:!h-12 disabled:opacity-100 disabled:bg-amber-400 disabled:text-slate-900 overflow-hidden'

export const landingPrimaryCtaSection = `${landingPrimaryCta} h-11 px-6 text-sm sm:text-base`

export const landingPrimaryCtaHeader = `${landingPrimaryCta} h-10 sm:h-11 px-5 sm:px-6 text-sm sm:text-base`

/** Secondary — light sections */
export const landingSecondaryCta =
  'inline-flex items-center justify-center gap-2 rounded-none border-2 border-slate-800 bg-white px-6 py-3 text-base font-semibold text-slate-800 ' +
  'shadow-[3px_3px_0_0_rgb(99_102_241)] transition-all duration-100 hover:bg-slate-900 hover:text-white hover:shadow-[4px_4px_0_0_rgb(250_204_21)] ' +
  'active:translate-x-0.5 active:translate-y-0.5 active:shadow-[2px_2px_0_0_rgb(99_102_241)]'

/** Header nav hit area: works on light pages and star-theme-dark landing. */
export const landingHeaderNavItem =
  'transition-colors duration-100 rounded-none px-2 py-1 hover:bg-slate-900/[0.06] dark:hover:bg-white/10'

/** Inline image / screenshot frame */
export const landingFrameInset = 'rounded-none bg-white shadow-[6px_6px_0_0_rgb(99_102_241)]'

/** Hero “spectacular” band — hard stack under gradient */
export const landingSpectacularShadow = 'shadow-[8px_8px_0_0_rgb(30_27_75)]'
