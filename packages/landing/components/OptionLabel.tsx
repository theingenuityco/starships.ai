type Props = {
  number: number;
  name: string;
  blurb: string;
};

export function OptionLabel({ number, name, blurb }: Props) {
  return (
    <div className="bg-(--color-bg) border-y border-(--color-accent)/30">
      <div className="mx-auto max-w-6xl px-6 py-6 flex items-center gap-4">
        <span className="inline-flex items-center justify-center rounded-full border border-(--color-accent) px-3 py-1 text-xs font-mono uppercase tracking-wider text-(--color-accent)">
          Option {number}
        </span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-(--color-fg)">{name}</p>
          <p className="text-xs text-(--color-fg-subtle)">{blurb}</p>
        </div>
      </div>
    </div>
  );
}
