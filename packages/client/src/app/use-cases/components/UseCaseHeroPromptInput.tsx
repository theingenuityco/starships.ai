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

export function UseCaseHeroPromptInput(props: { typewriterPrompts?: string[]; placeholder?: string; examples: PromptExample[]; className?: string }) {
  const router = useRouter()
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  const typewriterPrompts = useMemo(() => (props.typewriterPrompts ?? []).filter((s): s is string => typeof s === 'string' && s.trim().length > 0), [props.typewriterPrompts])
  const examples = useMemo(() => props.examples ?? [], [props.examples])
  const className = props.className
  const fallbackPlaceholder = props.placeholder?.trim() || ''

  const [value, setValue] = useState<string>('')
  const [typewriterText, setTypewriterText] = useState('')
  const [typewriterIndex, setTypewriterIndex] = useState(0)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isPaused, setIsPaused] = useState(false)

  const go = useCallback(
    (q: string) => {
      const query = String(q || '').trim()
      if (!query) return
      router.push(`/explore/agents?q=${encodeURIComponent(query)}`)
    },
    [router]
  )

  useEffect(() => {
    if (typewriterPrompts.length === 0 || value.length > 0) return
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
  }, [typewriterPrompts, typewriterIndex, typewriterText, isDeleting, isPaused, value])

  const showTypewriter = typewriterPrompts.length > 0 && value.length === 0

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
          <div className="relative rounded-2xl bg-card shadow-sm border border-border/40 px-4 py-3 transition-colors focus-within:border-primary/70">
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
                  'min-h-[120px] resize-none border-0 bg-transparent shadow-none p-0 pr-14 text-base sm:text-lg leading-relaxed',
                  'focus-visible:ring-0 focus-visible:ring-offset-0',
                  showTypewriter && 'caret-transparent'
                )}
              />
            </div>
            <Button type="submit" size="icon" className="absolute bottom-3 right-3 h-10 w-10 rounded-full text-white [&_svg]:text-white">
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
                    'inline-flex items-center rounded-full border border-border/40 bg-card shadow-sm px-4 py-2 text-sm font-semibold text-foreground/90',
                    'hover:bg-amber-500 hover:text-white hover:border-amber-500 transition-colors',
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
