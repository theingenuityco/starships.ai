import { Card } from '@/components/ui/card'
import Icon from '@/components/primitives/Icon'
import { Badge } from '@/components/ui/badge'

export default function UseCases() {
  return (
    <section className="py-14 px-4">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-semibold mb-8">Build agents and tools fast</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <Card className="p-6 bg-white/5 border-white/10">
            <div className="flex items-start gap-3">
              <Icon name="bot" className="w-5 h-5 mt-1" />
              <div>
                <h3 className="font-medium mb-1">Create agents in minutes</h3>
                <p className="text-sm text-muted-foreground">Use the builder to define name, prompt, model, and settings. Save and iterate quickly.</p>
                <div className="flex flex-wrap gap-2 mt-3">
                  <Badge variant="outline" className="bg-transparent border-white/10">
                    Preview prompts
                  </Badge>
                  <Badge variant="outline" className="bg-transparent border-white/10">
                    Type‑safe models
                  </Badge>
                </div>
              </div>
            </div>
          </Card>
          <Card className="p-6 bg-white/5 border-white/10">
            <div className="flex items-start gap-3">
              <Icon name="wrench" className="w-5 h-5 mt-1" />
              <div>
                <h3 className="font-medium mb-1">Create tools or start from templates</h3>
                <p className="text-sm text-muted-foreground">Spin up tools with parameters and blueprints, or deploy a template and customize.</p>
                <div className="flex flex-wrap gap-2 mt-3">
                  <Badge variant="outline" className="bg-transparent border-white/10">
                    Blueprints
                  </Badge>
                  <Badge variant="outline" className="bg-transparent border-white/10">
                    Schema aware
                  </Badge>
                </div>
              </div>
            </div>
          </Card>
          <Card className="p-6 bg-white/5 border-white/10">
            <div className="flex items-start gap-3">
              <Icon name="sparkles" className="w-5 h-5 mt-1" />
              <div>
                <h3 className="font-medium mb-1">Assign tools to agents</h3>
                <p className="text-sm text-muted-foreground">Wire tools to agents with one click and keep configs organized inside your starship.</p>
                <div className="flex flex-wrap gap-2 mt-3">
                  <Badge variant="outline" className="bg-transparent border-white/10">
                    One‑click assign
                  </Badge>
                  <Badge variant="outline" className="bg-transparent border-white/10">
                    Access‑controlled
                  </Badge>
                </div>
              </div>
            </div>
          </Card>
          <Card className="p-6 bg-white/5 border-white/10">
            <div className="flex items-start gap-3">
              <Icon name="message-square" className="w-5 h-5 mt-1" />
              <div>
                <h3 className="font-medium mb-1">Stream tests and iterate live</h3>
                <p className="text-sm text-muted-foreground">Chat with agents, watch executions stream in real‑time, and refine prompts and blueprints.</p>
                <div className="flex flex-wrap gap-2 mt-3">
                  <Badge variant="outline" className="bg-transparent border-white/10">
                    SSE streaming
                  </Badge>
                  <Badge variant="outline" className="bg-transparent border-white/10">
                    Low latency
                  </Badge>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </section>
  )
}
