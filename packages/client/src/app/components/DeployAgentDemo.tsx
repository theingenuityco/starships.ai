'use client'

import { useAgentTemplates } from '@/hooks/useTemplates'
import { Skeleton } from '@/components/ui/skeleton'
import type { AgentTemplateModel } from '@starships/protocol'
import AgentAvatar from '@/components/animated/AgentAvatar'
import { withAvatarCacheBuster } from '@/lib/avatar'
import { useMemo } from 'react'
import { useRouter } from 'next/navigation'

export default function DeployAgentDemo() {
  // Real data + real UI: use marketplace templates, rendered with the same mini-card UI as the hero.
  const router = useRouter()
  const { data: agentTemplates = [], isLoading } = useAgentTemplates()

  const goToMarketplace = () => router.push('/marketplace?from=public')

  const normalize = (s: unknown) => String(s ?? '').trim().toLowerCase()

  const templatesSorted = useMemo(() => {
    const list = Array.isArray(agentTemplates) ? agentTemplates.slice() : []
    list.sort((a: AgentTemplateModel, b: AgentTemplateModel) => (Number((b as any)?.usageCount ?? 0) || 0) - (Number((a as any)?.usageCount ?? 0) || 0))
    return list
  }, [agentTemplates])

  type TeamDef = { key: string; title: string; wantedNames: string[]; size: number }
  const teamDefs: TeamDef[] = useMemo(
    () => [
      // Production Marketplace (as of now) includes: Aria, Gaia, Daedalus, Thoth, Lin, Athena, Atlas, Iris, Janus, Felix, Talos, Saga.
      { key: 'core', title: 'Core team', wantedNames: ['Aria', 'Gaia', 'Daedalus'], size: 3 },
      { key: 'dev', title: 'Dev team', wantedNames: ['Janus', 'Talos', 'Thoth'], size: 3 },
      { key: 'ops', title: 'Ops team', wantedNames: ['Atlas', 'Felix', 'Athena'], size: 3 },
    ],
    []
  )

  const teams = useMemo(() => {
    const used = new Set<string>()

    const takeUnique = (arr: AgentTemplateModel[], n: number) => {
      const picked: AgentTemplateModel[] = []
      for (const t of arr) {
        if (picked.length >= n) break
        if (!t?.id) continue
        if (used.has(t.id)) continue
        used.add(t.id)
        picked.push(t)
      }
      return picked
    }

    const computed = teamDefs.map(def => {
      const wanted = def.wantedNames
        .map(name => {
          const n = normalize(name)
          return (
            templatesSorted.find(t => normalize((t as any)?.name) === n) ??
            // Allow small variations or suffixes.
            templatesSorted.find(t => normalize((t as any)?.name).includes(n))
          )
        })
        .filter(Boolean) as AgentTemplateModel[]

      const primary = takeUnique(wanted, def.size)
      const remaining = def.size - primary.length
      // IMPORTANT: No "random" fallback agents. If missing, show placeholders instead.
      return { ...def, agents: primary, missingSlots: Math.max(0, remaining) }
    })
    // If none of a team's agents exist, don't show that team at all.
    return computed.filter(t => (t.agents || []).length > 0)
  }, [teamDefs, templatesSorted])

  return (
    <div className="w-full">
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
          {[0, 1, 2].map(i => (
            <div key={i} className="rounded-2xl overflow-hidden border border-white/20 bg-background/60 shadow-md shadow-black/30 p-4">
              <Skeleton className="h-4 w-28" />
              <div className="mt-3 flex items-start gap-2">
                {[0, 1, 2].map(j => (
                  <div
                    key={j}
                    className="flex-1 basis-0 min-w-0 w-full max-w-[92px] sm:max-w-[104px] md:max-w-[112px] rounded-2xl border border-border/50 bg-muted/10 p-1.5"
                    aria-hidden
                  >
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-full aspect-square rounded-2xl ring-1 ring-border/50 bg-background/40 overflow-hidden">
                        <Skeleton className="w-full h-full rounded-2xl" />
                      </div>
                      <div className="min-w-0 w-full px-1 text-left">
                        <Skeleton className="h-3 w-16" />
                        <Skeleton className="mt-0.5 h-[11px] w-12" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : teams.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
          {teams.map(team => (
            <div key={team.key} className="rounded-2xl overflow-hidden border border-white/20 bg-background/60 shadow-md shadow-black/30 p-4">
              <div className="text-sm font-medium leading-none truncate">{team.title}</div>
              <div className="mt-3 flex items-start gap-2">
                {team.agents.slice(0, 3).map(t => {
                  const name = String(t.name ?? '').trim()
                  const role = String((t as any)?.role ?? '').trim()
                  const primaryLabel =
                    role || String((t as any)?.category ?? '').trim() || String((t as any)?.slug ?? '').trim() || name
                  const avatarUrl = withAvatarCacheBuster((t as any)?.avatarUrl, (t as any)?.avatarUpdatedAt)
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={goToMarketplace}
                      className="group flex-1 basis-0 min-w-0 w-full max-w-[92px] sm:max-w-[104px] md:max-w-[112px] rounded-2xl border border-border/50 bg-muted/10 hover:bg-muted/20 transition-colors text-left p-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`View ${name}${primaryLabel ? ` (${primaryLabel})` : ''} in Marketplace`}
                    >
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-full aspect-square rounded-2xl ring-1 ring-border/50 bg-background/40 overflow-hidden">
                          <AgentAvatar seed={name} imageUrl={avatarUrl} fill clip className="w-full h-full rounded-2xl" />
                        </div>
                        <div className="min-w-0 w-full px-1 text-left">
                          <div className="text-xs font-semibold leading-tight truncate max-w-[16ch]">{primaryLabel}</div>
                          <div className="mt-0.5 text-[11px] text-muted-foreground leading-tight truncate max-w-[16ch]">{name}</div>
                        </div>
                      </div>
                    </button>
                  )
                })}

                {Array.from({ length: Math.min(3, team.missingSlots) }).map((_, idx) => (
                  <div
                    key={`${team.key}-slot-${idx}`}
                    className="flex-1 basis-0 min-w-0 w-full max-w-[92px] sm:max-w-[104px] md:max-w-[112px] rounded-2xl border border-dashed border-white/15 bg-muted/5 p-1.5"
                    aria-label="Coming soon"
                  >
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-full aspect-square rounded-2xl ring-1 ring-border/30 bg-background/20 overflow-hidden flex items-center justify-center">
                        <AgentAvatar seed="Coming soon" imageUrl={undefined} fill clip className="w-full h-full rounded-2xl opacity-40" />
                      </div>
                      <div className="min-w-0 w-full px-1 text-left">
                        <div className="text-xs font-semibold leading-tight truncate max-w-[16ch] text-muted-foreground">Coming soon</div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground/70 leading-tight truncate max-w-[16ch]">New agent</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-white/20 bg-background/60 shadow-md shadow-black/30 p-6 text-sm text-muted-foreground">
          Teams will appear once templates are available.
        </div>
      )}
    </div>
  )
}

