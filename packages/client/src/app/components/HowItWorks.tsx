import Icon from '@/components/primitives/Icon'

export default function HowItWorks() {
  const steps: Array<{
    title: string
    desc: string
    icon: string
  }> = [
    {
      title: 'Connect your model keys',
      desc: 'Sign up and add your OpenRouter, OpenAI, or Anthropic keys to a Starships workspace.',
      icon: 'key',
    },
    {
      title: 'Create an agent from a template',
      desc: 'Pick a template, describe what the agent should do, and tweak models and settings.',
      icon: 'bot',
    },
    {
      title: 'Add tools and ship it',
      desc: 'Hook up APIs and workflows as tools, test in the console, then use the agent in your product.',
      icon: 'wrench',
    },
  ]

  return (
    <section className="py-10 md:py-14 px-4">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-xl sm:text-2xl md:text-3xl font-semibold mb-2 text-center">How Starships works</h2>
        <p className="text-sm md:text-base text-muted-foreground text-center max-w-2xl mx-auto mb-8 md:mb-10">Go from zero to a useful agent in three steps.</p>
        <div className="grid gap-4 sm:grid-cols-3">
          {steps.map(step => (
            <div key={step.title} className="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-5 text-left">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                  <Icon name={step.icon} className="w-5 h-5" />
                </div>
                <h3 className="text-sm md:text-base font-semibold text-white">{step.title}</h3>
              </div>
              <p className="text-xs md:text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
