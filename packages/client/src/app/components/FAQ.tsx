import { Card } from '@/components/ui/card'

const QA = [
  {
    q: 'Can I self-host or run Starships locally?',
    a: 'No. Starships.ai is a fully managed, hosted service. Self-hosting and local deployments are not supported at this time.',
  },
  {
    q: 'How do I get access and start?',
    a: 'Create an account, add your model provider keys in Environment settings, create a starship workspace, then launch your first agent from a template and start a conversation.',
  },
  {
    q: 'Which models and providers are supported?',
    a: 'OpenRouter (recommended), OpenAI, and Anthropic. Set a default provider/model for your workspace and override per agent or workflow (e.g., “anthropic/claude-3.5-sonnet”, “gpt-4o”).',
  },
  {
    q: 'How do tools work and how do I add custom ones?',
    a: 'Tools are JSON-schema functions backed by a blueprint workflow. Define name, description, parameters, and blueprint; agents will call them automatically when appropriate. You can test tools and iterate before enabling them.',
  },
  {
    q: 'What are agents and workflows?',
    a: 'Workflows are DAGs composed of nodes (LLM, HTTP, transform, conditional, tool, workflow, code, user_prompt). Agents wrap workflows to manage conversation state, tool calls, and streaming results.',
  },
  {
    q: 'How does Starships handle security and privacy?',
    a: 'JWT-protected APIs, encrypted environment variables for secrets, and data stored in our managed PostgreSQL. Provider keys remain in your workspace and are used only at runtime. We do not use your data to train models.',
  },
]

export default function FAQ() {
  return (
    <section className="py-14 px-4">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-semibold mb-6 text-center">FAQ</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {QA.map((item, i) => (
            <Card key={i} className="p-5 bg-white/5 border-white/10">
              <div className="font-medium mb-2">{item.q}</div>
              <div className="text-sm text-muted-foreground">{item.a}</div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
