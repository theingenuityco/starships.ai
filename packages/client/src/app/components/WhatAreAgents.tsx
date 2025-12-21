'use client'

import Icon from '@/components/primitives/Icon'
import { Handle, Position, ReactFlow } from '@xyflow/react'
import type { Edge, Node, NodeProps } from '@xyflow/react'
import { useMemo } from 'react'

type AnatomyNodeData = {
  label: string
  sub: string
  icon: string
  kind: 'center' | 'leaf'
  inPosition?: Position
}

function AnatomyNode({ data }: NodeProps<Node<AnatomyNodeData>['data']>) {
  const isCenter = data.kind === 'center'

  const orbSizeClass = isCenter ? 'w-[92px] h-[92px]' : 'w-[68px] h-[68px]'

  return (
    // Important: the node bounding box should be ONLY the orb,
    // otherwise ReactFlow will anchor edges to the combined (orb + labels) box.
    <div className={`relative ${orbSizeClass} overflow-visible`}>
      {/* Handles (hidden) — positioned relative to the orb box */}
      {isCenter ? (
        <>
          <Handle id="top" type="source" position={Position.Top} style={{ opacity: 0 }} />
          <Handle id="right" type="source" position={Position.Right} style={{ opacity: 0 }} />
          <Handle id="bottom" type="source" position={Position.Bottom} style={{ opacity: 0 }} />
          <Handle id="left" type="source" position={Position.Left} style={{ opacity: 0 }} />
        </>
      ) : (
        <Handle id="in" type="target" position={data.inPosition ?? Position.Top} style={{ opacity: 0 }} />
      )}

      {/* Icon orb = the node */}
      <div
        title={`${data.label}${data.sub ? ` — ${data.sub}` : ''}`}
        className={[
          'agent-anatomy-orb relative grid place-items-center rounded-full border w-full h-full',
          isCenter
            ? 'border-white/25 bg-black/35 shadow-[0_0_22px_rgba(168,85,247,0.24),0_0_44px_rgba(59,130,246,0.14)]'
            : 'border-white/18 bg-white/[0.04] shadow-[0_0_14px_rgba(168,85,247,0.18),0_0_32px_rgba(59,130,246,0.10)]',
        ].join(' ')}
      >
        {/* Center pulsing aura */}
        {isCenter && <div className="agent-anatomy-center-ring pointer-events-none absolute inset-[-12px] rounded-full" />}

        <Icon
          name={data.icon}
          className={`${isCenter ? 'w-[44px] h-[44px]' : 'w-[30px] h-[30px]'} text-primary drop-shadow-[0_0_18px_rgba(168,85,247,0.28)]`}
        />
      </div>

      {/* Labels outside the orb */}
      <div className="absolute left-1/2 top-full mt-2 -translate-x-1/2 text-center leading-tight whitespace-nowrap">
        <div className={`${isCenter ? 'text-sm sm:text-base' : 'text-sm'} font-medium text-foreground`}>{data.label}</div>
        {data.sub && <div className="text-xs sm:text-sm text-muted-foreground">{data.sub}</div>}
      </div>
    </div>
  )
}

export default function WhatAreAgents() {
  const { nodes, edges } = useMemo(() => {
    const nodes: Node<AnatomyNodeData>[] = [
      {
        id: 'agent',
        type: 'anatomy',
        position: { x: 440, y: 0 },
        data: { label: 'Agent', sub: 'Anatomy of an agent', icon: 'head-circuit', kind: 'center' },
      },
      {
        id: 'identity',
        type: 'anatomy',
        position: { x: 0, y: 210 },
        data: { label: 'Identity', sub: 'Who it is', icon: 'fingerprint', kind: 'leaf', inPosition: Position.Top },
      },
      {
        id: 'role',
        type: 'anatomy',
        position: { x: 220, y: 210 },
        data: { label: 'Role', sub: 'What it does', icon: 'user-cog', kind: 'leaf', inPosition: Position.Top },
      },
      {
        id: 'instructions',
        type: 'anatomy',
        position: { x: 440, y: 210 },
        data: { label: 'Instructions', sub: 'How it behaves', icon: 'file-text', kind: 'leaf', inPosition: Position.Top },
      },
      {
        id: 'tools',
        type: 'anatomy',
        position: { x: 660, y: 210 },
        data: { label: 'Tools', sub: 'What it can use', icon: 'wrench', kind: 'leaf', inPosition: Position.Top },
      },
      {
        id: 'autonomy',
        type: 'anatomy',
        position: { x: 880, y: 210 },
        data: { label: 'Autonomy', sub: 'How far it can go', icon: 'shield-check', kind: 'leaf', inPosition: Position.Top },
      },
    ]

    const edges: Edge[] = [
      { id: 'e-agent-identity', source: 'agent', sourceHandle: 'bottom', target: 'identity', targetHandle: 'in', type: 'bezier', animated: true },
      { id: 'e-agent-role', source: 'agent', sourceHandle: 'bottom', target: 'role', targetHandle: 'in', type: 'bezier', animated: true },
      { id: 'e-agent-instructions', source: 'agent', sourceHandle: 'bottom', target: 'instructions', targetHandle: 'in', type: 'bezier', animated: true },
      { id: 'e-agent-tools', source: 'agent', sourceHandle: 'bottom', target: 'tools', targetHandle: 'in', type: 'bezier', animated: true },
      { id: 'e-agent-autonomy', source: 'agent', sourceHandle: 'bottom', target: 'autonomy', targetHandle: 'in', type: 'bezier', animated: true },
    ].map(e => ({
      ...e,
      style: { stroke: 'rgba(168,85,247,0.55)', strokeWidth: 2.2 },
    }))

    return { nodes, edges }
  }, [])

  return (
    <section className="py-14 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-10 md:mb-14">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-semibold mb-2 text-center">What are agents?</h2>
          <p className="text-sm md:text-base text-muted-foreground text-center max-w-2xl mx-auto">
            Agents are AI teammates you set up to handle tasks for you.
          </p>
        </div>

        <div className="mx-auto max-w-6xl">
          <div className="rounded-2xl bg-transparent border border-transparent px-4 pb-4 pt-0 sm:px-6 sm:pb-6 sm:pt-0 shadow-none">
            <div className="h-[260px] sm:h-[320px] md:h-[400px]">
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={{ anatomy: AnatomyNode }}
                fitView
                fitViewOptions={{ padding: 0 }}
                minZoom={1}
                maxZoom={1}
                proOptions={{ hideAttribution: true }}
                nodesDraggable={false}
                nodesConnectable={false}
                elementsSelectable={false}
                panOnDrag={false}
                zoomOnScroll={false}
                zoomOnPinch={false}
                zoomOnDoubleClick={false}
                preventScrolling={false}
                className="!bg-transparent"
              >
              </ReactFlow>
            </div>
          </div>

          {/* A11y fallback */}
          <ul className="sr-only">
            <li>Identity</li>
            <li>Role</li>
            <li>Instructions</li>
            <li>Tools</li>
            <li>Autonomy</li>
          </ul>
        </div>
      </div>

      <style jsx>{`
        /* Edge animation tinting */
        :global(.react-flow__edge-path) {
          stroke: rgba(168, 85, 247, 0.55);
        }
        :global(.react-flow__edge.animated .react-flow__edge-path) {
          stroke-dasharray: 6 10;
          animation: agentEdgeDash 1.8s linear infinite;
        }
        @keyframes agentEdgeDash {
          to {
            stroke-dashoffset: -32;
          }
        }

        /* Center ring pulse */
        .agent-anatomy-center-ring {
          background: radial-gradient(closest-side, rgba(168, 85, 247, 0.18), rgba(59, 130, 246, 0.08), transparent 70%);
          animation: centerPulse 2.6s ease-in-out infinite;
          filter: blur(10px);
        }
        @keyframes centerPulse {
          0%,
          100% {
            opacity: 0.6;
            transform: scale(0.985);
          }
          50% {
            opacity: 1;
            transform: scale(1.02);
          }
        }

        /* Respect reduced motion */
        @media (prefers-reduced-motion: reduce) {
          :global(.react-flow__edge.animated .react-flow__edge-path) {
            animation: none !important;
          }
          .agent-anatomy-center-ring {
            animation: none !important;
          }
        }
      `}</style>
    </section>
  )
}
