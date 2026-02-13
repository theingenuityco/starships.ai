'use client'

import React from 'react'

import Icon from '@/components/primitives/Icon'
import { cn } from '@/lib/utils'

export type WizardStepMeta = { id: number; label: string; subtitle: string }

export function WizardStepper({ currentStep, steps }: { currentStep: number; steps: WizardStepMeta[] }) {
  const n = steps.length
  const lastIndex = Math.max(0, n - 1)
  const progressValue = n <= 1 ? 0 : ((currentStep - 1) / (n - 1)) * 100

  return (
    <div className="relative pt-1">
      {/* Track line */}
      <div className="absolute left-[16px] right-[16px] top-[16px] h-px bg-border/60 z-0" aria-hidden />
      {/* Progress line */}
      <div className="absolute left-[16px] right-[16px] top-[16px] h-px z-0" aria-hidden>
        <div
          className="h-full bg-primary/50 origin-left"
          style={{ transform: `scaleX(${Math.max(0, Math.min(1, progressValue / 100))})` }}
        />
      </div>

      {/* Absolute-position the nodes so dot centers are truly equidistant. */}
      <ol className="relative min-h-[62px] z-10">
        {steps.map((s, index) => {
          const isCompleted = currentStep > s.id
          const isActive = currentStep === s.id
          const pct = lastIndex === 0 ? 0 : (index / lastIndex) * 100
          const isFirst = index === 0
          const isLast = index === lastIndex
          const transform = isFirst ? 'translateX(0)' : isLast ? 'translateX(-100%)' : 'translateX(-50%)'
          const alignment = isFirst ? 'items-start text-left' : isLast ? 'items-end text-right' : 'items-center text-center'
          return (
            <li
              key={String(s.id)}
              className={cn('absolute top-0 flex flex-col', alignment)}
              style={{ left: `${pct}%`, transform }}
              aria-current={isActive ? 'step' : undefined}
            >
              {/* Halo masks the line behind the node (prevents visual overlap). */}
              <div className="relative z-10 rounded-full bg-card p-[2px]" aria-hidden>
                <div
                  className={cn(
                    'h-7 w-7 rounded-full border flex items-center justify-center shadow-sm',
                    isCompleted
                      ? 'border-emerald-500/40 bg-emerald-500 text-white'
                      : isActive
                        ? 'border-primary/50 bg-primary/10 text-primary'
                        : 'border-border/60 bg-background text-muted-foreground'
                  )}
                >
                  {isCompleted ? (
                    <Icon name="check" className="h-4 w-4" />
                  ) : (
                    <span className="text-xs font-semibold tabular-nums">{s.id}</span>
                  )}
                </div>
              </div>

              <div className="mt-2 min-w-0 w-36 sm:w-44">
                <div
                  className={cn(
                    'text-xs font-semibold leading-tight truncate',
                    isActive || isCompleted ? 'text-foreground' : 'text-muted-foreground'
                  )}
                >
                  {s.label}
                </div>
                <div className="mt-0.5 text-[11px] text-muted-foreground truncate">{s.subtitle}</div>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

