import DelegationDemo from '@/app/components/DelegationDemo'
import BuildCustomAgentDemo from '@/app/components/BuildCustomAgentDemo'
import ToolsBlueprintDemo from '@/app/components/ToolsBlueprintDemo'
import DeployAgentDemo from '@/app/components/DeployAgentDemo'
import ConnectYourAppsDemo from '@/app/components/ConnectYourAppsDemo'
import ScheduleRepetitiveTasksDemo from '@/app/components/ScheduleRepetitiveTasksDemo'
import { ErrorBoundary } from '@/components/error/ErrorBoundary'

export default function UseCases() {
  return (
    <section className="py-14 px-4">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-semibold mb-2 text-center">How it works?</h2>
        <p className="text-sm md:text-base text-muted-foreground text-center max-w-2xl mx-auto mb-10 md:mb-14">Create agents, add tools, and collaborate in one workspace.</p>

        {/* Deploy your agent */}
        <div className="mt-14 md:mt-16">
          <div className="w-full max-w-6xl mx-auto">
            <div className="text-left mb-6 md:mb-8">
              <h3 className="text-lg sm:text-xl md:text-2xl font-semibold tracking-tight text-foreground">Deploy agents</h3>
              <p className="mt-2 text-sm md:text-base font-normal text-muted-foreground/90 leading-relaxed max-w-2xl text-pretty">
                Deploy agentic teams of specialists to get the job done.
              </p>
            </div>

            <div className="py-8 sm:py-10">
              <ErrorBoundary name="DeployAgentDemo">
                <DeployAgentDemo />
              </ErrorBoundary>
            </div>
          </div>
        </div>

        {/* Connect your apps */}
        <div className="mt-14 md:mt-16">
          <div className="w-full max-w-6xl mx-auto">
            <div className="text-left mb-6 md:mb-8">
              <h3 className="text-lg sm:text-xl md:text-2xl font-semibold tracking-tight text-foreground">Connect your apps</h3>
              <p className="mt-2 text-sm md:text-base font-normal text-muted-foreground/90 leading-relaxed max-w-2xl text-pretty">
                Integrate with apps you already use.
              </p>
            </div>

            <div className="py-8 sm:py-10">
              <ErrorBoundary name="ConnectYourAppsDemo">
                <ConnectYourAppsDemo />
              </ErrorBoundary>
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
                <ErrorBoundary name="DelegationDemo">
                  <DelegationDemo />
                </ErrorBoundary>
              </div>
            </div>
          </div>
        </div>

        {/* Build agents for your custom workflows */}
        <div className="mt-14 md:mt-16">
          <div className="w-full max-w-6xl mx-auto">
            <div className="text-left mb-6 md:mb-8">
              <h3 className="text-lg sm:text-xl md:text-2xl font-semibold tracking-tight text-foreground">Build agents for your custom workflows</h3>
              <p className="mt-2 text-sm md:text-base font-normal text-muted-foreground/90 leading-relaxed max-w-2xl text-pretty">
                Gaia helps you define an agent’s responsibilities, inputs/outputs, and success criteria.
              </p>
            </div>

            <div className="py-8 sm:py-10">
              <ErrorBoundary name="BuildCustomAgentDemo">
                <BuildCustomAgentDemo />
              </ErrorBoundary>
            </div>

            <p className="mt-8 text-sm md:text-base font-normal text-muted-foreground/90 leading-relaxed max-w-2xl text-pretty">
              Daedalus turns steps into workflows your agents can run.
            </p>

            <div className="py-8 sm:py-10">
              <ErrorBoundary name="ToolsBlueprintDemo">
                <ToolsBlueprintDemo />
              </ErrorBoundary>
            </div>
          </div>
        </div>

        {/* Schedule repetitive tasks */}
        <div className="mt-14 md:mt-16">
          <div className="w-full max-w-6xl mx-auto">
            <div className="text-left mb-6 md:mb-8">
              <h3 className="text-lg sm:text-xl md:text-2xl font-semibold tracking-tight text-foreground">Schedule repetitive tasks</h3>
              <p className="mt-2 text-sm md:text-base font-normal text-muted-foreground/90 leading-relaxed max-w-2xl text-pretty">
                Run on a schedule, review a draft, then approve.
              </p>
            </div>

            <div className="py-8 sm:py-10">
              <ErrorBoundary name="ScheduleRepetitiveTasksDemo">
                <ScheduleRepetitiveTasksDemo />
              </ErrorBoundary>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
