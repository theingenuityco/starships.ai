'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import Icon from '@/components/primitives/Icon'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

type PromptExample = {
  label: string
  prompt: string
}

export function UseCaseHeroPromptInput(props: { placeholder: string; examples: PromptExample[]; className?: string }) {
  const router = useRouter()
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  const placeholder = useMemo(() => String(props.placeholder || '').trim(), [props.placeholder])
  const examples = useMemo(() => props.examples ?? [], [props.examples])
  const className = props.className

  const [value, setValue] = useState<string>('')

  const go = useCallback(
    (q: string) => {
      const query = String(q || '').trim()
      if (!query) return
      router.push(`/explore/agents?q=${encodeURIComponent(query)}`)
    },
    [router]
  )

  return (
    <div className={cn('max-w-3xl', className)}>
      <form
        onSubmit={e => {
          e.preventDefault()
          go(value)
        }}
      >
        <div className="relative">
          <div className="pointer-events-none absolute -inset-[2px] rounded-2xl bg-gradient-to-r from-indigo-500/45 via-fuchsia-500/45 to-amber-500/35 opacity-15 blur-md" aria-hidden />
          <div className="relative rounded-2xl border border-border/70 bg-background/35 shadow-sm backdrop-blur-sm px-4 py-3 focus-within:border-primary/70">
            <Textarea
              ref={inputRef}
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  go(value)
                }
              }}
              placeholder={placeholder || 'Describe the lead list you want…'}
              aria-label="Describe your lead generation task"
              rows={3}
              className={cn(
                'min-h-[88px] resize-none border-0 bg-transparent shadow-none p-0 pr-14 text-[14px] sm:text-[15px] leading-relaxed',
                'focus-visible:ring-0 focus-visible:ring-offset-0'
              )}
            />
            <Button type="submit" size="icon" className="absolute bottom-3 right-3 h-10 w-10 rounded-full">
              <Icon name="arrow-up" className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </form>

      {examples.length > 0 ? (
        <div className="pt-7 sm:pt-8 text-center">
          <div className="text-xs text-muted-foreground">Not sure where to start? Try one of these:</div>
          <div className="mt-2 flex flex-wrap gap-2 justify-center">
            {examples.slice(0, 6).map((ex, idx) => {
              const label = String(ex?.label || '').trim() || `Example ${idx + 1}`
              const prompt = String(ex?.prompt || '').trim()
              return (
                <button
                  key={`${label}-${idx}`}
                  type="button"
                  onClick={() => {
                    if (!prompt) return
                    setValue(prompt)
                    inputRef.current?.focus()
                  }}
                  className={cn(
                    'inline-flex items-center rounded-full border border-border/60 bg-background/40 px-3 py-1 text-[11px] font-semibold text-foreground/90',
                    'hover:bg-background/60 hover:border-border/80 transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
                  )}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}

