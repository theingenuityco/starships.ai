import { Card } from '@/components/ui/card'

const QA = [
  {
    q: 'What is Starships.ai?',
    a: 'Starships is a workspace where you assemble AI staff: specialists you can brief, equip with tools, and collaborate with to get real work done.',
  },
  {
    q: 'How do I get started?',
    a: 'Create an account, launch a template from the marketplace, then start a conversation. You can customize teammates and add skills as you go.',
  },
  {
    q: 'Do I need to be technical?',
    a: 'Not to start. Most people begin with templates and simple prompts. If you want deeper control later, you can configure advanced settings and custom tools.',
  },
  {
    q: 'Which models and providers are supported?',
    a: 'All popular model providers are supported, including Google, OpenAI, Anthropic, xAI, and DeepSeek.',
  },
  {
    q: 'Do I need to bring my own model keys?',
    a: 'No. Starships is a managed service; you don’t bring your own model keys.',
  },
  {
    q: 'Can my AI teammates use my tools and data?',
    a: 'Yes. You can connect skills (tools) so teammates can take actions and fetch information, and you stay in control of what’s enabled in each workspace.',
  },
  {
    q: 'How does Starships handle security and privacy?',
    a: 'Secrets are encrypted and scoped to your workspace. Runs are isolated and observable. We do not use your data to train models.',
  },
  {
    q: 'Can I self-host or run Starships locally?',
    a: 'Not currently. Starships.ai is a fully managed, hosted service.',
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
