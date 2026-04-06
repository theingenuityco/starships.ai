'use client'

import type { IcpProfile } from '@starships/protocol'

export function IcpProfileCard({
  profile,
  onClick,
}: {
  profile: IcpProfile
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full text-left rounded-none border border-white/10 bg-white/5 p-6 transition-all duration-200 hover:border-primary/60 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-[#050b24]"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-white leading-snug">{profile.name}</h3>
        <span className="mt-0.5 shrink-0 text-primary opacity-0 transition-opacity group-hover:opacity-100">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </div>

      <p className="mt-2 text-sm text-white/60 leading-relaxed">{profile.description}</p>

      <div className="mt-4 flex flex-wrap gap-1.5">
        <Trait label={profile.traits.industry} />
        {profile.traits.roles.slice(0, 2).map(role => (
          <Trait key={role} label={role} />
        ))}
        <Trait label={profile.traits.companySize} />
        <Trait label={profile.traits.geography} />
      </div>

      <div className="mt-5 flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-primary/70" aria-hidden />
        <span className="text-xs font-medium text-white/50">
          ~{profile.estimatedAccountCount.toLocaleString()} accounts
        </span>
      </div>
    </button>
  )
}

function Trait({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-none border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-white/60">
      {label}
    </span>
  )
}
