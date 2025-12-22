import DelegationDemo from '@/app/components/DelegationDemo'
import BuildCustomAgentDemo from '@/app/components/BuildCustomAgentDemo'
import ToolsBlueprintDemo from '@/app/components/ToolsBlueprintDemo'
import ScheduleRepetitiveTasksDemo from '@/app/components/ScheduleRepetitiveTasksDemo'

export default function UseCases() {
  return (
    <section className="py-14 px-4">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-semibold mb-2 text-center">How it works?</h2>
        <p className="text-sm md:text-base text-muted-foreground text-center max-w-2xl mx-auto mb-10 md:mb-14">Create agents, add tools, and collaborate in one workspace.</p>

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
