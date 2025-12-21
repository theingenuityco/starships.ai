import DelegationDemo from '@/app/components/DelegationDemo'

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
              <p className="mt-3 text-sm md:text-base font-normal text-muted-foreground/90 leading-relaxed max-w-2xl text-pretty">
                Tell it what it owns, how it should communicate, and what “done” looks like. You can start simple and refine as you go.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5">
              <div className="text-xs font-medium text-muted-foreground mb-3">Example</div>
              <div className="grid gap-3">
                <div className="rounded-lg border border-white/10 bg-black/20 p-4 text-sm leading-relaxed">
                  <span className="font-semibold text-foreground">You:</span>{' '}
                  <span className="text-foreground/90">“Aria, create an agent that summarizes customer emails and drafts friendly replies for my approval.”</span>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 p-4 text-sm leading-relaxed">
                  <span className="font-semibold text-foreground">Aria:</span>{' '}
                  <span className="text-foreground/80">“Done. I created a ‘Customer Inbox Assistant’ with rules for tone, what to escalate, and an approval step before sending.”</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Upgrade your agents by adding tools */}
        <div className="mt-14 md:mt-16">
          <div className="w-full max-w-6xl mx-auto">
            <div className="text-left mb-6 md:mb-8">
              <h3 className="text-lg sm:text-xl md:text-2xl font-semibold tracking-tight text-foreground">Upgrade your agents by adding tools</h3>
              <p className="mt-3 text-sm md:text-base font-normal text-muted-foreground/90 leading-relaxed max-w-2xl text-pretty">
                Tools let agents do real work, like fetching info and taking actions in your apps, not just writing text.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="text-sm font-medium text-foreground">Connect your apps</div>
                <p className="mt-2 text-sm text-muted-foreground">Slack, Drive, GitHub, email, calendars, and more, with scoped access.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="text-sm font-medium text-foreground">Add capabilities</div>
                <p className="mt-2 text-sm text-muted-foreground">Search, summarize, create tickets, post updates, and automate repeatable steps.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="text-sm font-medium text-foreground">Stay in control</div>
                <p className="mt-2 text-sm text-muted-foreground">Keep approvals on for sensitive actions, and review drafts before anything is sent.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Delegate like never before */}
        <div className="mt-14 md:mt-16">
          <div className="w-full max-w-6xl mx-auto">
            <div className="text-left mb-6 md:mb-8">
              <h3 className="text-lg sm:text-xl md:text-2xl font-semibold tracking-tight text-foreground">Delegate like never before</h3>
              <p className="mt-3 text-sm md:text-base font-normal text-muted-foreground/90 leading-relaxed max-w-2xl text-pretty">
                Give one instruction, and Aria can spin up specialist chats to set up agents and tools for you, then return with a ready-to-use result.
              </p>
            </div>
            <div className="w-full">
              <DelegationDemo />
            </div>
          </div>
        </div>

        {/* Schedule repetitive tasks */}
        <div className="mt-14 md:mt-16">
          <div className="w-full max-w-6xl mx-auto">
            <div className="text-left mb-6 md:mb-8">
              <h3 className="text-lg sm:text-xl md:text-2xl font-semibold tracking-tight text-foreground">Schedule repetitive tasks</h3>
              <p className="mt-3 text-sm md:text-base font-normal text-muted-foreground/90 leading-relaxed max-w-2xl text-pretty">
                Turn one-off work into a repeatable routine. Run on a schedule, get a draft, and approve before anything goes out.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5">
              <div className="text-xs font-medium text-muted-foreground mb-3">Example schedule</div>
              <div className="rounded-lg border border-white/10 bg-black/20 p-4 text-sm leading-relaxed text-foreground/85">
                Every Friday at 9:00 AM, compile this week’s GitHub changes and draft a short update for Slack. Ask me to approve before posting.
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
