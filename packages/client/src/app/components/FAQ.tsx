import { Card } from '@/components/ui/card'

const QA = [
  {
    q: 'What is Starships in one sentence?',
    a: 'Starships is a hosted platform for engineers to build and run production-ready AI agents that call your tools, APIs, and workflows using your own model keys.',
  },
  {
    q: 'Who is Starships for?',
    a: 'Starships is built for product engineers, data teams, and founders who want to ship real AI features into products without maintaining brittle glue code.',
  },
  {
    q: 'What can I build in my first day?',
    a: 'Most teams start with support triage, internal copilots for docs, analytics or reporting agents, or small back-office automations that call existing APIs and databases.',
  },
  {
    q: 'How do I get access and start?',
    a: 'Create an account, add your model provider keys in Environment settings, create a workspace, then launch your first agent from a template and start a conversation.',
  },
  {
    q: 'Which models and providers are supported?',
    a: 'OpenRouter (recommended), OpenAI, and Anthropic. Set a default provider/model for your workspace and override per agent or workflow (e.g., “anthropic/claude-3.5-sonnet”, “gpt-4o”).',
  },
  {
    q: 'How do tools work and how do I add custom ones?',
    a: 'Tools are JSON-schema functions backed by a workflow. Define name, description, parameters, and logic; agents will call them automatically when appropriate. You can test tools and iterate before enabling them. See the docs for a full breakdown of tool and workflow node types.',
  },
  {
    q: 'What are agents and workflows?',
    a: 'Agents hold conversation state and decide when to call tools. Workflows describe the steps and logic an agent or tool run goes through. For a detailed, node-by-node view, check the workflows section in the docs.',
  },
  {
    q: 'Can I self-host or run Starships locally?',
    a: 'No. Starships.ai is a fully managed, hosted service. Self-hosting and local deployments are not supported at this time.',
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
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-semibold mb-6 text-center">FAQs</h2>
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
