'use client';

interface ExpeditionDetailsHeaderProps {
  name: string;
  description?: string;
}

export function ExpeditionDetailsHeader({ name, description }: ExpeditionDetailsHeaderProps) {
  return (
    <header className="relative overflow-hidden">
      {/* Background gradient effect */}
      <div className="absolute inset-0 bg-gradient-to-r from-blue-600/10 via-purple-600/10 to-pink-600/10 blur-3xl" />
      
      <div className="relative bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-800/50 p-8">
        <h1 className="text-4xl lg:text-5xl font-bold text-white mb-3 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
          {name}
        </h1>
        {description && (
          <p className="text-lg text-slate-400 max-w-3xl">
            {description}
          </p>
        )}
      </div>
    </header>
  );
}