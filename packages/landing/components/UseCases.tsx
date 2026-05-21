import { FadeIn } from './FadeIn';

type Room = {
  name: string;
  tagline: string;
  agents: string[];
  description: string;
};

const rooms: Room[] = [
  {
    name: 'The engineering room',
    tagline: 'Your codebase, maintained.',
    agents: ['Docs writer', 'Test author', 'Dependency upgrader', 'Security scanner', 'PR reviewer'],
    description: 'Connected to GitHub. Ships PRs, writes tests, patches vulnerabilities. Waits for your review on anything risky.',
  },
  {
    name: 'The sales room',
    tagline: 'Pipeline, on rails.',
    agents: ['Account researcher', 'Outreach drafter', 'Follow-up coordinator', 'CRM updater'],
    description:
      'Connected to LinkedIn, email, and your CRM. Researches leads, drafts outreach, queues sends. Nothing goes out without your approval.',
  },
  {
    name: 'The ops room',
    tagline: 'The work nobody owns.',
    agents: ['Ticket triager', 'Status reporter', 'KB writer', 'Anomaly watcher'],
    description:
      'Connected to your support tooling, docs, and metrics. Triages incoming work, flags what needs you, handles the routine itself.',
  },
];

export function UseCases() {
  return (
    <FadeIn as="section" id="use-cases" className="border-b border-(--color-border)">
      <div className="mx-auto max-w-5xl px-6 py-24">
        <p className="text-sm uppercase tracking-wider text-(--color-fg-subtle) mb-4">What your virtual org looks like</p>
        <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight max-w-3xl">
          Three teams you could stand up this week.
        </h2>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-4">
          {rooms.map((r) => (
            <div key={r.name} className="rounded-(--radius-card) border border-(--color-border) bg-(--color-bg-elev) p-6 flex flex-col">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-(--color-accent)">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-(--color-accent)" />
                <span>{r.tagline}</span>
              </div>
              <h3 className="mt-3 text-xl font-semibold tracking-tight">{r.name}</h3>
              <p className="mt-3 text-(--color-fg-muted) leading-relaxed">{r.description}</p>
              <div className="mt-6 pt-6 border-t border-(--color-border)">
                <p className="text-xs uppercase tracking-wider text-(--color-fg-subtle) mb-3">Sub-agents</p>
                <ul className="space-y-1.5">
                  {r.agents.map((a) => (
                    <li key={a} className="text-sm text-(--color-fg-muted) flex items-center gap-2">
                      <span className="inline-block h-1 w-1 rounded-full bg-(--color-fg-subtle)" />
                      {a}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>
    </FadeIn>
  );
}
