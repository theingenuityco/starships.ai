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
    <section className="py-16 px-4 md:py-20">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-3 text-center">Build agents and tools fast</h2>
        <p className="text-base md:text-lg text-muted-foreground text-center max-w-2xl mx-auto mb-12 md:mb-20">Design, connect, and iterate on agents and tools in minutes.</p>
        <div className="space-y-12 md:space-y-20">
          {items.map((item, idx) => {
            const reverse = idx % 2 === 1
            return (
              <div
                key={item.title}
                className={`flex flex-col ${reverse ? 'md:flex-row-reverse' : 'md:flex-row'} md:items-center gap-8 md:gap-12 lg:gap-16 py-8 md:py-10 lg:py-12 frosted-glass-card rounded-3xl shadow-frosted-lg border border-border/50 p-6 md:p-8 lg:p-10 hover:border-border/70 transition-all duration-300 hover:shadow-2xl`}
              >
                {/* Media slot */}
                <div className="w-full md:w-[55%] lg:w-[60%] flex-shrink-0">
                  <div className="relative group">
                    <img
                      src={mediaSrc[idx]}
                      alt={`${item.title} demo`}
                      loading="lazy"
                      decoding="async"
                      sizes="(min-width: 1024px) 740px, (min-width: 768px) 700px, 100vw"
                      className="w-full h-[240px] sm:h-[320px] md:h-[400px] lg:h-[460px] object-cover rounded-2xl border border-white/10 shadow-xl transition-transform duration-300 group-hover:scale-[1.02]"
                    />
                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-t from-black/20 to-transparent pointer-events-none"></div>
                  </div>
                </div>

                {/* Text */}
                <div className="flex-1 flex flex-col justify-center space-y-4 md:space-y-6">
                  <h3 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-semibold leading-tight">{item.title}</h3>
                  <p className="text-base md:text-lg lg:text-xl text-muted-foreground leading-relaxed max-w-prose">{item.desc}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
