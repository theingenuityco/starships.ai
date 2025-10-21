import Icon from '@/components/primitives/Icon'
import { Card } from '@/components/ui/card'

export default function ProductModel() {
  return (
    <section className="py-16 px-4">
      <div className="max-w-6xl mx-auto text-center mb-10">
        <h2 className="text-3xl md:text-4xl font-semibold mb-3">What it is</h2>
        <p className="text-muted-foreground">A platform to define agents, connect tools, and run them with isolation and event streaming.</p>
      </div>
      <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-4">
        <Card className="p-6 bg-white/5 border-white/10">
          <div className="flex items-center gap-3 mb-2">
            <Icon name="pencil" className="w-5 h-5" />
            <h3 className="font-medium">Build</h3>
          </div>
          <p className="text-sm text-muted-foreground">Define agent behavior and tool access as code.</p>
        </Card>
        <Card className="p-6 bg-white/5 border-white/10">
          <div className="flex items-center gap-3 mb-2">
            <Icon name="rocket" className="w-5 h-5" />
            <h3 className="font-medium">Run</h3>
          </div>
          <p className="text-sm text-muted-foreground">Execute on a runner with process isolation (local/child/remote).</p>
        </Card>
        <Card className="p-6 bg-white/5 border-white/10">
          <div className="flex items-center gap-3 mb-2">
            <Icon name="activity" className="w-5 h-5" />
            <h3 className="font-medium">Observe</h3>
          </div>
          <p className="text-sm text-muted-foreground">Structured events and logs surfaced to the UI and server.</p>
        </Card>
      </div>
    </section>
  )
}
