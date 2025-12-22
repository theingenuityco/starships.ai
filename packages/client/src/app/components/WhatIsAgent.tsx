import { Card } from '@/components/ui/card'
import Icon from '@/components/primitives/Icon'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

export default function WhatIsAgent() {
  const items = [
    {
      icon: 'user',
      title: 'A role with a mission',
      desc: 'An agent is a dedicated teammate, like “Support”, “Research”, or “Ops”, with clear goals and instructions.',
    },
    {
      icon: 'wrench',
      title: 'Skills it can use',
      desc: 'Give agents the right tools so they can do more than chat: pull data, take actions, and produce results.',
    },
    {
      icon: 'rocket',
      title: 'Reusable, deployable work',
      desc: 'Once it’s working, you can deploy it and reuse it anytime to handle repeatable busy work.',
    },
  ]

  return (
    <section className="py-14 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8 md:mb-10">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-semibold mb-2">What is an Agent?</h2>
          <p className="text-sm md:text-base text-muted-foreground max-w-2xl mx-auto">
            Think of an agent as an AI teammate you can build, manage, and deploy to get work done.
          </p>
        </div>

        <div className="grid gap-4 md:gap-6 md:grid-cols-3">
          {items.map((item, idx) => (
            <Card key={idx} className="p-6 bg-white/5 border-white/10">
              <div className="flex items-center gap-3 mb-2">
                <Icon name={item.icon} className="w-5 h-5" />
                <h3 className="font-medium">{item.title}</h3>
              </div>
              <p className="text-sm text-muted-foreground">{item.desc}</p>
            </Card>
          ))}
        </div>

        <div className="mt-6 md:mt-8 grid gap-4 md:grid-cols-[1.2fr_0.8fr] items-stretch">
          <Card className="p-6 bg-white/5 border-white/10">
            <div className="flex items-center gap-3 mb-3">
              <Icon name="message-square" className="w-5 h-5" />
              <h3 className="font-medium">A quick example</h3>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/20 p-4 text-sm leading-relaxed">
              <div className="text-white/90">
                <span className="font-semibold">You:</span> “Triage today’s inbound, draft replies, and flag anything urgent.”
              </div>
              <div className="mt-3 text-white/80">
                <span className="font-semibold">Agent:</span> “Done. Here are the urgent items, draft responses, and a summary you can approve.”
              </div>
            </div>
            <div className="mt-3 text-xs text-muted-foreground">You stay in control. Agents only use the tools you enable.</div>
          </Card>

          <Card className="p-6 bg-white/5 border-white/10 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Icon name="sparkles" className="w-5 h-5" />
                <h3 className="font-medium">Start from a template</h3>
              </div>
              <p className="text-sm text-muted-foreground">Browse ready‑made agents and deploy one in a click.</p>
            </div>
            <div className="mt-4">
              <Button size="lg" variant="outline" className="w-full border-primary/60 text-primary hover:bg-primary/10" asChild>
                <Link href="/marketplace?from=public">Explore marketplace</Link>
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </section>
  )
}


