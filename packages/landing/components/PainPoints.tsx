import { FadeIn } from './FadeIn';

const pains = [
  {
    title: 'Every decision goes through you.',
    body: 'Product, sales, ops, support — context-switching kills your week. You finish the day having moved everything an inch.',
  },
  {
    title: "AI tools chat. They don’t do.",
    body: "A good answer doesn’t ship the feature, send the email, or update the CRM. Suggestions aren’t leverage.",
  },
  {
    title: 'A real team is months and millions away.',
    body: "You’d hire if you could afford to, or if you knew the role was right. You need leverage now, not a recruiter.",
  },
];

export function PainPoints() {
  return (
    <FadeIn as="section" className="border-b border-(--color-border)">
      <div className="mx-auto max-w-5xl px-6 py-24">
        <p className="text-sm uppercase tracking-wider text-(--color-fg-subtle) mb-4">Where founders get stuck</p>
        <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight max-w-3xl leading-tight">
          You&rsquo;re the bottleneck. You know it. You can&rsquo;t hire your way out yet.
        </h2>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-4">
          {pains.map((p) => (
            <div key={p.title} className="rounded-(--radius-card) border border-(--color-border) bg-(--color-bg-elev) p-6">
              <h3 className="text-lg font-semibold tracking-tight">{p.title}</h3>
              <p className="mt-2 text-(--color-fg-muted) leading-relaxed">{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </FadeIn>
  );
}
