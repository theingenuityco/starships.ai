import DelegationDemo from '@/app/components/DelegationDemo'

export default function UseCases() {
  return (
    <section className="py-14 px-4">
      <div className="max-w-7xl mx-auto">
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-semibold mb-2 text-center">How it works?</h2>
        <p className="text-sm md:text-base text-muted-foreground text-center max-w-2xl mx-auto mb-10 md:mb-14">Create agents, add tools, and collaborate in one workspace.</p>

        {/* Delegation subsection */}
        <div className="mt-14 md:mt-16">
          <div className="w-full max-w-6xl mx-auto">
            <div className="text-left mb-6 md:mb-8">
              <h3 className="text-lg sm:text-xl md:text-2xl font-semibold tracking-tight text-foreground">Delegation</h3>
              <p className="mt-3 text-sm md:text-base font-normal text-muted-foreground/90 leading-relaxed max-w-2xl text-pretty">
                Give one instruction, and your lead agent can spin up specialist chats to build agents, tools, and automations—then return with a deployable result.
              </p>
            </div>
            <div className="w-full">
              <DelegationDemo />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
