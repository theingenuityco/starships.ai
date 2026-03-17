'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

import Icon from '@/components/primitives/Icon'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

type PromptExample = {
  label: string
  prompt: string
}

const TYPEWRITER_TYPING_MS = 60
const TYPEWRITER_PAUSE_MS = 2500
const TYPEWRITER_DELETE_MS = 35

export function UseCaseHeroPromptInput(props: {
  typewriterPrompts?: string[]
  placeholder?: string
  examples: PromptExample[]
  className?: string
  /** When 'login', submit redirects to /login instead of explore. Used on lead-gen hero. */
  submitRedirect?: 'login' | 'explore'
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  const typewriterPrompts = useMemo(() => (props.typewriterPrompts ?? []).filter((s): s is string => typeof s === 'string' && s.trim().length > 0), [props.typewriterPrompts])
  const examples = useMemo(() => props.examples ?? [], [props.examples])
  const className = props.className
  const fallbackPlaceholder = props.placeholder?.trim() || ''
  const submitRedirect = props.submitRedirect ?? 'explore'

  const [value, setValue] = useState<string>('')
  const [typewriterText, setTypewriterText] = useState('')
  const [typewriterIndex, setTypewriterIndex] = useState(0)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [isFocused, setIsFocused] = useState(false)

  const go = useCallback(
    (q: string) => {
      const query = String(q || '').trim()
      if (!query) return

      if (submitRedirect === 'login') {
        try {
          if (typeof window !== 'undefined') {
            window.sessionStorage.setItem(
              'lead_gen_pending_prompt',
              JSON.stringify({
                prompt: query,
                createdAt: Date.now(),
              })
            )
          }
        } catch {
          // Ignore storage errors and still proceed with redirect.
        }

        // Signal the login page that this flow originated from the lead-generation use case,
        // and default to the sign-in tab rather than sign-up.
        router.push('/login?tab=login&fromLeadGen=1')
        return
      }

      router.push(`/explore/agents?q=${encodeURIComponent(query)}`)
    },
    [router, submitRedirect]
  )

  useEffect(() => {
    if (typewriterPrompts.length === 0 || value.length > 0 || isFocused) return
    const current = typewriterPrompts[typewriterIndex] ?? ''
    if (!current) return

    if (isPaused) {
      const t = setTimeout(() => {
        setIsPaused(false)
        setIsDeleting(true)
      }, TYPEWRITER_PAUSE_MS)
      return () => clearTimeout(t)
    }

    if (isDeleting) {
      if (typewriterText.length === 0) {
        setIsDeleting(false)
        setTypewriterIndex(i => (i + 1) % typewriterPrompts.length)
        return
      }
      const t = setTimeout(() => setTypewriterText(prev => prev.slice(0, -1)), TYPEWRITER_DELETE_MS)
      return () => clearTimeout(t)
    }

    if (typewriterText.length >= current.length) {
      setIsPaused(true)
      return
    }

    const t = setTimeout(() => setTypewriterText(prev => current.slice(0, prev.length + 1)), TYPEWRITER_TYPING_MS)
    return () => clearTimeout(t)
  }, [typewriterPrompts, typewriterIndex, typewriterText, isDeleting, isPaused, value, isFocused])

  const showTypewriter = typewriterPrompts.length > 0 && value.length === 0 && !isFocused

  return (
    <div className={cn('max-w-3xl', className)}>
      <form
        onSubmit={e => {
          e.preventDefault()
          go(value)
        }}
      >
        <div className="relative">
          <div className="pointer-events-none absolute -inset-[2px] rounded-2xl bg-gradient-to-r from-white/40 via-white/60 to-white/40 opacity-80 blur-md" aria-hidden />
          <div className="relative rounded-2xl bg-white shadow-sm border border-slate-200 px-4 py-3 transition-colors focus-within:border-amber-400/80">
            <div className="relative text-left">
              {showTypewriter && (
                <div className="pointer-events-none absolute inset-0 p-0 pr-14 text-left text-base sm:text-lg leading-relaxed text-muted-foreground whitespace-pre-wrap break-words" aria-hidden>
                  {typewriterText}
                  <span className="inline-block w-0.5 h-4 bg-primary/70 animate-pulse ml-0.5 align-middle" />
                </div>
              )}
              <Textarea
                ref={inputRef}
                value={value}
                onChange={e => setValue(e.target.value)}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    go(value)
                  }
                }}
                placeholder={!showTypewriter ? fallbackPlaceholder || 'Describe the lead list you want…' : ''}
                aria-label="Describe your lead generation task"
                rows={4}
                className={cn(
                  'min-h-[120px] resize-none border-0 bg-transparent shadow-none p-0 pr-14 text-base sm:text-lg leading-relaxed text-slate-900 placeholder:text-slate-500',
                  'focus-visible:ring-0 focus-visible:ring-offset-0',
                  showTypewriter && 'caret-transparent'
                )}
              />
            </div>
            <Button
              type="submit"
              size="icon"
              className="absolute bottom-3 right-3 h-10 w-10 rounded-full text-white bg-gradient-to-b from-amber-300 to-amber-500 shadow-md hover:shadow-lg transition-colors transition-shadow [&_svg]:text-white"
            >
              <Icon name="arrow-up" className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </form>

      {examples.length > 0 ? (
        <div className="pt-8 sm:pt-10 text-center">
          <div className="text-sm text-muted-foreground">Try one of these:</div>
          <div className="mt-5 flex flex-wrap gap-2.5 justify-center">
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
                    'inline-flex items-center rounded-full px-5 py-2 text-sm font-semibold whitespace-nowrap',
                    // Default: white pill with subtle border/shadow
                    'text-slate-900 bg-white border border-slate-200 shadow-sm',
                    // Hover/active: switch to 3D amber CTA style
                    'hover:text-white hover:bg-gradient-to-b hover:from-amber-300 hover:via-amber-400 hover:to-amber-500 hover:border-transparent hover:shadow-[0_4px_0_0_rgba(180,83,9,1)]',
                    'active:shadow-[0_2px_0_0_rgba(180,83,9,1)] active:-translate-y-[1px]',
                    'transition-colors transition-transform transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
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
