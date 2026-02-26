import type { WidgetInstanceNode } from '@starships/protocol';
import { collectStructureNodeIds, dehydrateViewRoot, hydrateViewRoot, isFullWidgetNode, isStructureNode } from '@/utils/viewRootWidgets';

describe('viewRootWidgets', () => {
  it('dehydrate -> hydrate roundtrip preserves full root shape', () => {
    const full: WidgetInstanceNode = {
      id: 'root',
      type: 'Box',
      props: { className: 'p-6' },
      children: [
        {
          id: 'title',
          type: 'Text',
          props: { as: 'h2', text: 'Hello' },
          bindings: { text: { kind: 'state', path: 'title' } },
        },
        {
          id: 'row',
          type: 'Stack',
          props: { direction: 'row' },
          handlers: { click: { kind: 'actions', actions: [{ type: 'set_state', path: 'x', value: 1 }] } },
          children: [
            { id: 'kpi', type: 'StatCard', props: { title: 'KPI', stats: [{ label: 'MRR', value: '$1' }] } },
          ],
        },
      ],
      permissions: { workflows: ['some-workflow'] },
    };

    const { structureRoot, widgets } = dehydrateViewRoot(full);
    expect(isStructureNode(structureRoot)).toBe(true);
    expect(isFullWidgetNode(structureRoot)).toBe(false);
    expect(widgets.length).toBeGreaterThanOrEqual(4);

    const map = new Map(widgets.map((w) => [w.nodeId, w]));
    const hydrated = hydrateViewRoot(structureRoot, map);

    expect(hydrated).toEqual(full);
  });

  it('collectStructureNodeIds returns all ids in pre-order', () => {
    const full: WidgetInstanceNode = {
      id: 'root',
      type: 'Box',
      props: {},
      children: [
        { id: 'a', type: 'Text', props: {} },
        { id: 'b', type: 'Box', props: {}, children: [{ id: 'c', type: 'Text', props: {} }] },
      ],
    };

    const { structureRoot } = dehydrateViewRoot(full);
    expect(collectStructureNodeIds(structureRoot)).toEqual(['root', 'a', 'b', 'c']);
  });
});

