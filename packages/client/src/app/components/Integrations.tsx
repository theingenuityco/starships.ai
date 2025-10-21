import { Card } from '@/components/ui/card'

export default function Integrations() {
  const items = ['HTTP APIs', 'Webhooks', 'Postgres', 'Adapters']
  return (
    <section className="py-14 px-4">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-semibold mb-6">Integrations</h2>
        <Card className="p-6 bg-white/5 border-white/10">
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4 text-sm text-white/80">
            {items.map((n, i) => (
              <div key={i} className="px-3 py-2 rounded bg-black/20 text-center">
                {n}
              </div>
            ))}
          </div>
          <div className="text-xs text-muted-foreground mt-3">Bring your own tools via tool blueprints and adapters.</div>
        </Card>
      </div>
    </section>
  )
}
