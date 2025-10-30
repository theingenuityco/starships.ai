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
      <div className="max-w-7xl mx-auto">
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-semibold mb-2 text-center">Build agents and tools fast</h2>
        <p className="text-sm md:text-base text-muted-foreground text-center max-w-2xl mx-auto mb-10 md:mb-14">Design, connect, and iterate on agents and tools in minutes.</p>
        <div className="space-y-12 md:space-y-16">
          {items.map((item, idx) => {
            const isRightAligned = idx % 2 === 1
            const isWide = idx % 2 === 1
            const swapLayout = idx === 1 || idx === 3 // Cards 2 and 4
            return (
              <div
                key={item.title}
                className={`flex flex-col ${swapLayout ? 'md:flex-row-reverse' : 'md:flex-row'} md:items-center gap-6 md:gap-8 py-6 md:py-8 frosted-glass-card rounded-2xl border border-border/40 p-4 md:p-6 shadow-[0_0_20px_rgba(168,85,247,0.25),0_0_40px_rgba(236,72,153,0.18),0_0_60px_rgba(251,146,60,0.12)] ${
                  isRightAligned ? 'ml-auto' : 'mr-auto'
                } ${isWide ? 'w-full md:w-[85%]' : 'w-full md:w-[70%]'}`}
              >
                {/* Media slot */}
                <div className="w-full md:w-[58%] flex-shrink-0">
                  <img
                    src={mediaSrc[idx]}
                    alt={`${item.title} demo`}
                    loading="lazy"
                    decoding="async"
                    sizes="(min-width: 768px) 58vw, 100vw"
                    className="w-full h-[220px] sm:h-[280px] md:h-[340px] object-cover rounded-xl border border-white/10"
                  />
                </div>

                {/* Text */}
                <div className="flex-1 flex flex-col justify-center space-y-3">
                  <h3 className="text-lg sm:text-xl md:text-2xl font-semibold leading-tight">{item.title}</h3>
                  <p className="text-sm md:text-base text-muted-foreground leading-relaxed">{item.desc}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
