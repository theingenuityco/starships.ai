import { Skeleton } from '@/components/ui/skeleton'

export default function UseCases() {
  const items: Array<{
    title: string
    desc: string
  }> = [
    {
      title: 'Create agents in minutes',
      desc: 'Use the builder to define name, prompt, model, and settings. Save and iterate quickly.',
    },
    {
      title: 'Create tools or start from templates',
      desc: 'Spin up tools with parameters and blueprints, or deploy a template and customize.',
    },
    {
      title: 'Assign tools to agents',
      desc: 'Wire tools to agents with one click and keep configs organized inside your starship.',
    },
    {
      title: 'Stream tests and iterate live',
      desc: 'Chat with agents, watch executions stream in real‑time, and refine prompts and blueprints.',
    },
  ]

  const mediaSrc = ['/landing/usecases/agents.png', '/landing/usecases/tools.png', '/landing/usecases/assign.png', '/landing/usecases/streaming.png']

  return (
    <section className="py-14 px-4">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-semibold mb-8">Build agents and tools fast</h2>
        <div>
          {items.map((item, idx) => {
            const reverse = idx % 2 === 1
            return (
              <div key={item.title} className={`flex flex-col ${reverse ? 'md:flex-row-reverse' : 'md:flex-row'} md:items-center gap-8 py-10`}>
                {/* Media slot */}
                <div className="w-full md:w-[560px]">
                  <img src={mediaSrc[idx]} alt={`${item.title} demo`} className="w-full h-[320px] object-cover rounded-lg border border-white/10" />
                </div>

                {/* Text */}
                <div className="flex-1">
                  <h3 className="text-xl md:text-2xl font-medium mb-2">{item.title}</h3>
                  <p className="text-sm md:text-base text-muted-foreground max-w-prose">{item.desc}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
