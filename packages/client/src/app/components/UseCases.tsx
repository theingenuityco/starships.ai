import { Card } from '@/components/ui/card'
import Icon from '@/components/primitives/Icon'

export default function UseCases() {
  return (
    <section className="py-14 px-4">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-semibold mb-8">Top use cases</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <Card className="p-6 bg-white/5 border-white/10">
            <div className="flex items-start gap-3">
              <Icon name="rocket" className="w-5 h-5 mt-1" />
              <div>
                <h3 className="font-medium mb-1">Ship features from a prompt</h3>
                <p className="text-sm text-muted-foreground">Describe the goal. Autopilot drafts a PR with code, tests, and preview.</p>
              </div>
            </div>
          </Card>
          <Card className="p-6 bg-white/5 border-white/10">
            <div className="flex items-start gap-3">
              <Icon name="check-circle" className="w-5 h-5 mt-1" />
              <div>
                <h3 className="font-medium mb-1">Fix failing tests automatically</h3>
                <p className="text-sm text-muted-foreground">Detect flaky or failing suites and open a targeted fix PR.</p>
              </div>
            </div>
          </Card>
          <Card className="p-6 bg-white/5 border-white/10">
            <div className="flex items-start gap-3">
              <Icon name="wrench" className="w-5 h-5 mt-1" />
              <div>
                <h3 className="font-medium mb-1">Dependency upgrades & migrations</h3>
                <p className="text-sm text-muted-foreground">Plan and execute safe, incremental upgrades across services and packages.</p>
              </div>
            </div>
          </Card>
          <Card className="p-6 bg-white/5 border-white/10">
            <div className="flex items-start gap-3">
              <Icon name="message-square" className="w-5 h-5 mt-1" />
              <div>
                <h3 className="font-medium mb-1">Documentation from code</h3>
                <p className="text-sm text-muted-foreground">Generate READMEs, ADRs, and diagrams that stay current with your repo.</p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </section>
  )
}
