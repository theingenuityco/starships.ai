'use client'

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { ComparisonContent } from '@/app/compare/comparison-content'
import { cn } from '@/lib/utils'

function BrandHeader(props: { name: string; logoSrc?: string; logoAlt: string }) {
  const { name, logoSrc, logoAlt } = props
  return (
    <span className="inline-flex items-center justify-center gap-2 px-1 py-0.5 text-[12px] font-medium text-slate-800">
      {logoSrc ? <img src={logoSrc} alt={logoAlt} className="h-3.5 w-3.5 rounded-[2px] object-contain" /> : null}
      <span className="text-[12px] leading-none">{name}</span>
    </span>
  )
}

export default function ComparisonFeatureMatrix(props: { content: ComparisonContent }) {
  const { content } = props
  const placeholderCols = content.matrixPlaceholderColumns ?? []
  const dataColCount = 2 + placeholderCols.length
  const capabilityPct = Math.max(18, Math.min(28, 100 - dataColCount * 14))
  const eachDataPct = (100 - capabilityPct) / dataColCount

  return (
    <section className="px-4 py-16 text-slate-900 sm:px-8 sm:py-24" style={{ backgroundColor: 'hsl(38 30% 97.5%)' }}>
      <div className="mx-auto max-w-6xl">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl">
          Feature <span className="text-primary">comparison</span>
        </h2>
        {content.matrixHeading.subtitle ? <p className="mt-3 max-w-3xl text-sm text-slate-600 sm:text-base">{content.matrixHeading.subtitle}</p> : null}
        <p className="mt-2 text-xs text-slate-500">{content.evidenceNote}</p>

        <div className="mt-8 overflow-hidden rounded-none bg-[#F8F8FA]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] table-fixed border-collapse text-left">
              <colgroup>
                <col style={{ width: `${capabilityPct}%` }} />
                <col style={{ width: `${eachDataPct}%` }} />
                <col style={{ width: `${eachDataPct}%` }} />
                {placeholderCols.map(col => (
                  <col key={col.id} style={{ width: `${eachDataPct}%` }} />
                ))}
              </colgroup>
              <thead>
                <tr className="bg-white">
                  <th className="px-4 py-4 text-sm font-semibold text-slate-900 sm:px-5">Capability</th>
                  <th className="px-4 py-4 text-center text-sm font-semibold text-slate-900 sm:px-5" style={{ backgroundColor: '#FFF6E8' }}>
                    <BrandHeader name="Starships" logoSrc="/starships-logo.svg" logoAlt="Starships" />
                  </th>
                  <th className="px-4 py-4 text-center text-sm font-semibold text-slate-900 sm:px-5" style={{ backgroundColor: '#FEF6FD' }}>
                    <BrandHeader name="Motion" logoSrc="https://www.usemotion.com/favicon.ico" logoAlt="Motion" />
                  </th>
                  {placeholderCols.map(col => (
                    <th key={col.id} className="px-4 py-4 text-center text-sm font-semibold text-slate-900 sm:px-5">
                      <BrandHeader name={col.name} logoSrc={col.logoSrc} logoAlt={col.logoAlt} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <TooltipProvider delayDuration={100}>
                  {content.comparisonRows.map((row, idx) => {
                    const rowKey = `${row.label}-${idx}`
                    return (
                      <tr key={rowKey} className={cn('bg-white', idx !== content.comparisonRows.length - 1 && 'border-b border-border/60')}>
                        <td className="px-4 py-3.5 text-sm text-slate-900 sm:px-5">
                          <div className="flex items-center gap-2">
                            <span>{row.label}</span>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 bg-white text-[10px] font-semibold text-slate-500"
                                  aria-label={`About ${row.label}`}
                                >
                                  i
                                </button>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs text-xs">{row.help}</TooltipContent>
                            </Tooltip>
                          </div>
                        </td>
                        {row.type === 'check' ? (
                          <>
                            <td className="px-4 py-3.5 text-center sm:px-5" style={{ backgroundColor: '#FFF6E8' }}>
                              <span
                                className={cn(
                                  'inline-flex h-5 w-5 items-center justify-center rounded-[4px] border text-[11px] font-bold',
                                  row.starships ? 'border-primary bg-primary text-primary-foreground' : 'border-slate-300 bg-white text-slate-300'
                                )}
                              >
                                {row.starships ? '✓' : ''}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-center sm:px-5" style={{ backgroundColor: '#FEF6FD' }}>
                              <span
                                className={cn(
                                  'inline-flex h-5 w-5 items-center justify-center rounded-[4px] border text-[11px] font-bold',
                                  row.competitor ? 'border-primary bg-primary text-primary-foreground' : 'border-slate-300 bg-white text-slate-300'
                                )}
                              >
                                {row.competitor ? '✓' : ''}
                              </span>
                            </td>
                            {placeholderCols.map(col => (
                              <td key={col.id} className="px-4 py-3.5 text-center sm:px-5" aria-label={`${col.name}: not yet compared`}>
                                <span className="inline-flex h-5 w-5 items-center justify-center rounded-[4px] border border-slate-200 bg-white text-slate-200" />
                              </td>
                            ))}
                          </>
                        ) : (
                          <>
                            <td className="px-4 py-3.5 text-center text-[13px] font-medium text-slate-900 sm:px-5" style={{ backgroundColor: '#FFF6E8' }}>
                              {row.starships}
                            </td>
                            <td className="px-4 py-3.5 text-center text-[13px] font-medium text-slate-900 sm:px-5" style={{ backgroundColor: '#FEF6FD' }}>
                              {row.competitor}
                            </td>
                            {placeholderCols.map(col => (
                              <td key={col.id} className="px-4 py-3.5 text-center text-[13px] text-slate-400 sm:px-5" aria-label={`${col.name}: not yet compared`}>
                                —
                              </td>
                            ))}
                          </>
                        )}
                      </tr>
                    )
                  })}
                </TooltipProvider>
              </tbody>
            </table>
          </div>
        </div>
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Sources reviewed</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {content.researchLinks.map(link => (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center rounded-none border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100"
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
