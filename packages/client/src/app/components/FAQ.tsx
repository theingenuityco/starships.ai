'use client'

import { useState } from 'react'

import Icon from '@/components/primitives/Icon'
import { cn } from '@/lib/utils'

export interface FAQItem {
  q: string
  a: string
}

const QA: FAQItem[] = [
  {
    q: 'What is Starships.ai?',
    a: 'Starships is a workspace where you assemble AI staff: specialists you can brief, equip with tools, and collaborate with to get real work done.',
  },
  {
    q: 'How do I get started?',
    a: 'Create an account, launch a template from Explore, then start a conversation. You can customize teammates and add skills as you go.',
  },
  {
    q: 'Do I need to be technical?',
    a: 'Not to start. Most people begin with templates and simple prompts. If you want deeper control later, you can configure advanced settings and custom tools.',
  },
  {
    q: 'Which models and providers are supported?',
    a: 'All popular model providers are supported, including Google, OpenAI, and Anthropic.',
  },
  {
    q: 'Do I need to bring my own model keys?',
    a: "No. Starships is a managed service; you don't bring your own model keys.",
  },
  {
    q: 'Can my AI teammates use my tools and data?',
    a: "Yes. You can connect skills (tools) so teammates can take actions and fetch information, and you stay in control of what's enabled in each workspace.",
  },
  {
    q: 'How does Starships handle security and privacy?',
    a: 'Secrets are encrypted and scoped to your workspace. Runs are isolated and observable. We do not use your data to train models.',
  },
  {
    q: 'Can I self-host or run Starships locally?',
    a: 'Not currently. Starships.ai is a fully managed, hosted service.',
  },
]

interface FAQProps {
  items?: FAQItem[]
  title?: string
  /** Outer section wash — landing FAQ uses dark; pricing uses white. */
  sectionTone?: 'dark' | 'white'
}

export default function FAQ({ items = QA, title = 'FAQs', sectionTone = 'dark' }: FAQProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  const toggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index)
  }

  const isDark = sectionTone === 'dark'

  return (
    <section
      className={cn(
        'px-4',
        sectionTone === 'white' ? 'py-20 sm:py-24 md:py-28 bg-white text-slate-900' : 'py-14 text-white',
      )}
    >
      <div className="max-w-6xl mx-auto">
        <h2 className={cn('text-2xl sm:text-3xl md:text-4xl font-bold mb-6 text-center', isDark ? 'text-white' : 'text-slate-900')}>
          {title.endsWith('FAQs') ? (
            <>
              {title.slice(0, -1)}
              <span className="text-primary">s</span>
            </>
          ) : (
            title
          )}
        </h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {items.map((item, i) => {
            const isOpen = openIndex === i
            return (
              <div
                key={i}
                className={cn(
                  'overflow-hidden rounded-xl border shadow-sm',
                  isDark ? 'border-white/[0.08] bg-white/[0.04]' : 'border-slate-200 bg-[#F8F8FA]',
                )}
              >
                <button
                  onClick={() => toggle(i)}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 p-5 text-left transition-colors duration-100',
                    isDark ? 'hover:bg-white/[0.06]' : 'hover:bg-slate-100',
                  )}
                >
                  <span className={cn('flex-1 font-medium', isDark ? 'text-white/90' : 'text-slate-900')}>{item.q}</span>
                  <Icon
                    name={isOpen ? 'chevron-down' : 'chevron-right'}
                    className={cn('h-4 w-4 shrink-0 transition-transform duration-100', isDark ? 'text-white/40' : 'text-slate-500')}
                  />
                </button>
                <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}>
                  <div className="px-5 pb-5 pt-0">
                    <div className={cn('text-sm', isDark ? 'text-white/60' : 'text-slate-700')}>{item.a}</div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
