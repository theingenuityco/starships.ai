import DelegationDemo from '@/app/components/DelegationDemo'
import BuildCustomAgentDemo from '@/app/components/BuildCustomAgentDemo'
import ToolsBlueprintDemo from '@/app/components/ToolsBlueprintDemo'
import ScheduleRepetitiveTasksDemo from '@/app/components/ScheduleRepetitiveTasksDemo'
import { Avatar } from '@/components/ui/avatar'
import AgentAvatar from '@/components/animated/AgentAvatar'
import { useAgentTemplates } from '@/hooks/useTemplates'
import { useMemo } from 'react'

export default function UseCases() {
  const { data: agentTemplates = [] } = useAgentTemplates()

  const starterTeam = useMemo(() => {
    const findTemplateAvatarUrl = (agentName: string): string | null => {
      const needle = agentName.trim().toLowerCase()
      if (!needle) return null

      const match =
        agentTemplates.find(t => (t.name || '').trim().toLowerCase() === needle) ??
        agentTemplates.find(t => ((t as any).slug || '').trim().toLowerCase() === needle) ??
        agentTemplates.find(t => (t.name || '').trim().toLowerCase().startsWith(needle))

      return ((match as any)?.avatarUrl as string | undefined) ?? null
    }

    return [
      {
        name: 'Gaia',
        desc: 'Ask Gaia to help design and create a new agent.',
        imageUrl: findTemplateAvatarUrl('Gaia'),
      },
      {
        name: 'Daedalus',
        desc: 'Ask Daedalus to help craft tools for an agent.',
        imageUrl: findTemplateAvatarUrl('Daedalus'),
      },
      {
        name: 'Aria',
        desc: 'Ask Aria to help delegate tasks and summarize results.',
        imageUrl: findTemplateAvatarUrl('Aria'),
      },
    ] as const
  }, [agentTemplates])

  return (
    <section className="py-14 px-4">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-semibold mb-2 text-center">How it works?</h2>
        <p className="text-sm md:text-base text-muted-foreground text-center max-w-2xl mx-auto mb-10 md:mb-14">Create agents, add tools, and collaborate in one workspace.</p>

        {/* Meet your starter team */}
        <div className="mt-2 md:mt-4">
          <div className="w-full max-w-6xl mx-auto">
            <div className="text-left mb-6 md:mb-8">
              <h3 className="text-lg sm:text-xl md:text-2xl font-semibold tracking-tight text-foreground">Meet your starter team</h3>
              <p className="mt-2 text-sm md:text-base font-normal text-muted-foreground/90 leading-relaxed max-w-2xl text-pretty">
                Three built‑in agents to help you design, build, and delegate from day one.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {starterTeam.map(agent => (
                <div key={agent.name} className="w-full rounded-xl border border-white/12 bg-white/[0.05] px-4 py-4 shadow-[0_0_18px_rgba(168,85,247,0.10),0_0_34px_rgba(59,130,246,0.06)]">
                  <div className="flex flex-col">
                    <div className="flex justify-center">
                      <Avatar className="h-16 w-16 sm:h-20 sm:w-20 rounded-full ring-2 ring-border/40 bg-black/30 overflow-hidden">
                        <AgentAvatar seed={agent.name} imageUrl={agent.imageUrl} size={80} rounded />
                      </Avatar>
                    </div>
                    <div className="mt-4 min-w-0 text-center">
                      <div className="text-lg sm:text-xl md:text-2xl font-semibold tracking-tight text-foreground leading-tight">{agent.name}</div>
                      <div className="mt-2 text-sm md:text-base font-normal text-muted-foreground/90 leading-relaxed text-pretty">{agent.desc}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Build your custom agent */}
        <div className="mt-14 md:mt-16">
          <div className="w-full max-w-6xl mx-auto">
            <div className="text-left mb-6 md:mb-8">
              <h3 className="text-lg sm:text-xl md:text-2xl font-semibold tracking-tight text-foreground">Build your custom agent</h3>
              <p className="mt-2 text-sm md:text-base font-normal text-muted-foreground/90 leading-relaxed max-w-2xl text-pretty">
                Gaia helps you define an agent’s responsibilities, inputs/outputs, and success criteria.
              </p>
            </div>

            <div className="py-8 sm:py-10">
              <BuildCustomAgentDemo />
            </div>
          </div>
        </div>

        {/* Upgrade your agents by adding tools */}
        <div className="mt-14 md:mt-16">
          <div className="w-full max-w-6xl mx-auto">
            <div className="text-left mb-6 md:mb-8">
              <h3 className="text-lg sm:text-xl md:text-2xl font-semibold tracking-tight text-foreground">Upgrade your agents by adding tools</h3>
              <p className="mt-2 text-sm md:text-base font-normal text-muted-foreground/90 leading-relaxed max-w-2xl text-pretty">Daedalus turns steps into workflows your agents can run.</p>
            </div>

            <div className="py-8 sm:py-10">
              <ToolsBlueprintDemo />
            </div>
          </div>
        </div>

        {/* Delegate like never before */}
        <div className="mt-14 md:mt-16">
          <div className="w-full max-w-6xl mx-auto">
            <div className="text-left mb-6 md:mb-8">
              <h3 className="text-lg sm:text-xl md:text-2xl font-semibold tracking-tight text-foreground">Delegate like never before</h3>
              <p className="mt-2 text-sm md:text-base font-normal text-muted-foreground/90 leading-relaxed max-w-2xl text-pretty">Aria spins up specialist chats and brings back the result.</p>
            </div>
            <div className="w-full">
              <div className="py-8 sm:py-10">
                <DelegationDemo />
              </div>
            </div>
          </div>
        </div>

        {/* Schedule repetitive tasks */}
        <div className="mt-14 md:mt-16">
          <div className="w-full max-w-6xl mx-auto">
            <div className="text-left mb-6 md:mb-8">
              <h3 className="text-lg sm:text-xl md:text-2xl font-semibold tracking-tight text-foreground">Schedule repetitive tasks</h3>
              <p className="mt-2 text-sm md:text-base font-normal text-muted-foreground/90 leading-relaxed max-w-2xl text-pretty">
                Turn one-off work into a repeatable routine. Run on a schedule, get a draft, and approve before anything goes out.
              </p>
            </div>

            <div className="py-8 sm:py-10">
              <ScheduleRepetitiveTasksDemo />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
