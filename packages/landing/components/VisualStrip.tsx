import Image from 'next/image';
import { heroStrip } from '@/lib/screenshots';

export function VisualStrip() {
  return (
    <section className="border-b border-(--color-border) bg-(--color-bg)">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {heroStrip.map((shot, i) => (
            <div
              key={shot.src}
              className="relative aspect-[16/10] rounded-(--radius-card) border border-(--color-border) bg-(--color-bg-elev) overflow-hidden group hover:border-(--color-border-strong) transition-colors"
            >
              <Image
                src={shot.src}
                alt={shot.alt}
                fill
                sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                className="object-cover object-top opacity-90 group-hover:opacity-100 transition-opacity"
                priority={i === 0}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
