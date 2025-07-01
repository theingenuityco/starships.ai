import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Command Deck',
  description: 'Starships – Command Deck overview'
};

export default function CommandDeckPage() {
  return (
    <div className="h-full flex flex-col items-center justify-center p-8 space-y-4">
      <h1 className="text-3xl font-bold">Command Deck</h1>
      <p className="text-muted-foreground max-w-md text-center">
        This section will host the full Command&nbsp;Deck dashboard. Stay tuned!
      </p>
    </div>
  );
} 