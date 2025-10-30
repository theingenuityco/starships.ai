import { Skeleton } from '@/components/ui/skeleton'
import Icon from '@/components/primitives/Icon'

export default function UseCases() {
  const items: Array<{
    title: string
    desc: string
    icon: string
  }> = [
    {
      title: 'Create agents in minutes',
      desc: 'Use the builder to define name, prompt, model, and settings. Save and iterate quickly.',
      icon: 'bot',
    },
    {
      title: 'Create tools that fit your needs',
      desc: 'Spin up tools with parameters and blueprints, or deploy a template and customize.',
      icon: 'wrench',
    },
    {
      title: 'Assign tools to agents',
      desc: 'Wire tools to agents with one click and keep configs organized inside your starship.',
      icon: 'plug',
    },
    {
      title: 'Stream tests and iterate live',
      desc: 'Chat with agents, watch executions stream in real‑time, and refine prompts and blueprints.',
      icon: 'activity',
    },
  ]

  const mediaSrc = ['/landing/usecases/agents.png', '/landing/usecases/tools.png', '/landing/usecases/assign.png', '/landing/usecases/streaming.png']

  return (
    <section className="py-14 px-4">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-semibold mb-2 text-center">Build agents and tools fast</h2>
        <p className="text-sm md:text-base text-muted-foreground text-center max-w-2xl mx-auto mb-10 md:mb-14">Design, connect, and iterate on agents and tools in minutes.</p>
        <div className="space-y-10 md:space-y-12">
          {items.map((item, idx) => {
            const isRightAligned = idx % 2 === 1
            const isWide = idx % 2 === 1
            const swapLayout = idx === 1 || idx === 3 // Cards 2 and 4
            return (
              <div
                key={item.title}
                className={`flex flex-col ${swapLayout ? 'md:flex-row-reverse' : 'md:flex-row'} md:items-center gap-5 md:gap-6 py-4 md:py-6 rounded-xl border border-white/20 p-3 md:p-5 shadow-[0_0_15px_rgba(168,85,247,0.15),0_0_30px_rgba(236,72,153,0.10),0_0_45px_rgba(251,146,60,0.06)] backdrop-blur-md bg-gradient-to-br from-white/[0.08] via-purple-500/[0.03] to-white/[0.05] ${
                  isRightAligned ? 'ml-auto' : 'mr-auto'
                } ${isWide ? 'w-full md:w-[80%]' : 'w-full md:w-[65%]'}`}
              >
                {/* Media slot */}
                <div className="w-full md:w-[58%] flex-shrink-0">
                  <img
                    src={mediaSrc[idx]}
                    alt={`${item.title} demo`}
                    loading="lazy"
                    decoding="async"
                    sizes="(min-width: 768px) 58vw, 100vw"
                    className="w-full h-[180px] sm:h-[220px] md:h-[280px] object-cover rounded-lg border border-white/10"
                  />
                </div>

                {/* Text */}
                <div className="flex-1 flex flex-col justify-center space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary/30 to-purple-500/20 border border-primary/30 flex items-center justify-center flex-shrink-0 shadow-sm">
                      <Icon name={item.icon} className="w-5 h-5 text-primary" />
                    </div>
                    <h3 className="text-base sm:text-lg md:text-xl font-semibold leading-tight text-white">{item.title}</h3>
                  </div>
                  <p className="text-xs md:text-sm text-gray-300 leading-relaxed">{item.desc}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
