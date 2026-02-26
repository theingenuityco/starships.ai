'use client'

import React from 'react'

import { StatCard } from './StatCard'
import { DataTable } from './DataTable'
import { MetricGrid } from './MetricGrid'
import { AreaChart, BarChart, DonutChart, LineChart, PieChart, RadarChart, RadialChart } from './charts'
import { ConnectorSuggestionCard } from './ConnectorSuggestionCard'
import { AgentSuggestionCard } from './AgentSuggestionCard'
import { StarshipDetails } from './StarshipDetails'

import { Box } from './primitives/Box'
import { IfWidget } from './primitives/IfWidget'
import { Stack } from './primitives/Stack'
import { Grid } from './primitives/Grid'
import { Text } from './primitives/Text'
import { ButtonWidget } from './primitives/ButtonWidget'
import { TabsWidget } from './primitives/TabsWidget'
import { InputWidget } from './primitives/InputWidget'
import { TextareaWidget } from './primitives/TextareaWidget'
import { SelectWidget } from './primitives/SelectWidget'
import { CheckboxWidget } from './primitives/CheckboxWidget'
import { SwitchWidget } from './primitives/SwitchWidget'

export type WidgetCategory = 'Layout' | 'Content' | 'Form' | 'Data' | 'Charts' | 'Other'

export type WidgetFieldOption = { label: string; value: string }

export type WidgetField =
  | {
      kind: 'string'
      path: string
      label: string
      placeholder?: string
    }
  | {
      kind: 'textarea'
      path: string
      label: string
      placeholder?: string
      rows?: number
    }
  | {
      kind: 'number'
      path: string
      label: string
      min?: number
      max?: number
      step?: number
    }
  | {
      kind: 'boolean'
      path: string
      label: string
    }
  | {
      kind: 'select'
      path: string
      label: string
      options: WidgetFieldOption[]
    }

export type WidgetCatalogEntry = {
  type: string
  Component: React.ComponentType<any>

  label: string
  category: WidgetCategory
  acceptsChildren: boolean
  defaultProps: Record<string, unknown>
  fields: WidgetField[]
  events?: string[]
}

const ALIGN_OPTIONS: WidgetFieldOption[] = [
  { label: 'default', value: '__default__' },
  { label: 'flex-start', value: 'flex-start' },
  { label: 'center', value: 'center' },
  { label: 'flex-end', value: 'flex-end' },
  { label: 'stretch', value: 'stretch' },
  { label: 'baseline', value: 'baseline' },
]

const JUSTIFY_OPTIONS: WidgetFieldOption[] = [
  { label: 'default', value: '__default__' },
  { label: 'flex-start', value: 'flex-start' },
  { label: 'center', value: 'center' },
  { label: 'flex-end', value: 'flex-end' },
  { label: 'space-between', value: 'space-between' },
  { label: 'space-around', value: 'space-around' },
  { label: 'space-evenly', value: 'space-evenly' },
]

export const WIDGET_CATALOG: readonly WidgetCatalogEntry[] = Object.freeze([
  // Layout primitives
  {
    type: 'Box',
    label: 'Box',
    category: 'Layout',
    acceptsChildren: true,
    defaultProps: { className: '' },
    fields: [{ kind: 'string', path: 'className', label: 'Class name', placeholder: 'tailwind classes…' }],
    Component: Box,
  },
  {
    type: 'If',
    label: 'If',
    category: 'Layout',
    acceptsChildren: true,
    defaultProps: { when: true, className: '' },
    fields: [
      { kind: 'boolean', path: 'when', label: 'When' },
      { kind: 'string', path: 'className', label: 'Class name', placeholder: 'tailwind classes…' },
    ],
    Component: IfWidget,
  },
  {
    type: 'Stack',
    label: 'Stack',
    category: 'Layout',
    acceptsChildren: true,
    defaultProps: { direction: 'column', gap: 12, wrap: false, className: '' },
    fields: [
      {
        kind: 'select',
        path: 'direction',
        label: 'Direction',
        options: [
          { label: 'column', value: 'column' },
          { label: 'row', value: 'row' },
        ],
      },
      { kind: 'number', path: 'gap', label: 'Gap', min: 0, max: 200, step: 1 },
      { kind: 'select', path: 'align', label: 'Align', options: ALIGN_OPTIONS },
      { kind: 'select', path: 'justify', label: 'Justify', options: JUSTIFY_OPTIONS },
      { kind: 'boolean', path: 'wrap', label: 'Wrap' },
      { kind: 'string', path: 'className', label: 'Class name', placeholder: 'tailwind classes…' },
    ],
    Component: Stack,
  },
  {
    type: 'Grid',
    label: 'Grid',
    category: 'Layout',
    acceptsChildren: true,
    defaultProps: { cols: 3, gap: 16, minColWidthPx: 320, className: '' },
    fields: [
      { kind: 'number', path: 'cols', label: 'Columns', min: 1, max: 24, step: 1 },
      { kind: 'number', path: 'gap', label: 'Gap', min: 0, max: 200, step: 1 },
      { kind: 'number', path: 'minColWidthPx', label: 'Min col width (px)', min: 120, max: 1200, step: 1 },
      { kind: 'string', path: 'className', label: 'Class name', placeholder: 'tailwind classes…' },
    ],
    Component: Grid,
  },
  {
    type: 'Tabs',
    label: 'Tabs',
    category: 'Layout',
    acceptsChildren: true,
    defaultProps: { defaultIndex: 0, labels: [], className: '' },
    fields: [
      { kind: 'number', path: 'defaultIndex', label: 'Default index', min: 0, max: 50, step: 1 },
      { kind: 'string', path: 'className', label: 'Class name', placeholder: 'tailwind classes…' },
    ],
    Component: TabsWidget,
  },

  // Content primitives
  {
    type: 'Text',
    label: 'Text',
    category: 'Content',
    acceptsChildren: false,
    defaultProps: { as: 'p', text: 'Text', className: '' },
    fields: [
      {
        kind: 'select',
        path: 'as',
        label: 'Tag',
        options: [
          { label: 'p', value: 'p' },
          { label: 'span', value: 'span' },
          { label: 'div', value: 'div' },
          { label: 'h1', value: 'h1' },
          { label: 'h2', value: 'h2' },
          { label: 'h3', value: 'h3' },
          { label: 'h4', value: 'h4' },
          { label: 'h5', value: 'h5' },
          { label: 'h6', value: 'h6' },
        ],
      },
      { kind: 'textarea', path: 'text', label: 'Text', placeholder: 'Text…', rows: 4 },
      { kind: 'string', path: 'className', label: 'Class name', placeholder: 'tailwind classes…' },
    ],
    Component: Text,
  },
  {
    type: 'Button',
    label: 'Button',
    category: 'Content',
    acceptsChildren: false,
    defaultProps: { label: 'Button', variant: 'default', size: 'default', disabled: false, className: '' },
    fields: [
      { kind: 'string', path: 'label', label: 'Label', placeholder: 'Button' },
      {
        kind: 'select',
        path: 'variant',
        label: 'Variant',
        options: [
          { label: 'default', value: 'default' },
          { label: 'destructive', value: 'destructive' },
          { label: 'outline', value: 'outline' },
          { label: 'primaryOutline', value: 'primaryOutline' },
          { label: 'secondary', value: 'secondary' },
          { label: 'ghost', value: 'ghost' },
          { label: 'link', value: 'link' },
        ],
      },
      {
        kind: 'select',
        path: 'size',
        label: 'Size',
        options: [
          { label: 'default', value: 'default' },
          { label: 'sm', value: 'sm' },
          { label: 'lg', value: 'lg' },
          { label: 'icon', value: 'icon' },
        ],
      },
      { kind: 'boolean', path: 'disabled', label: 'Disabled' },
      { kind: 'string', path: 'className', label: 'Class name', placeholder: 'tailwind classes…' },
    ],
    events: ['click'],
    Component: ButtonWidget,
  },

  // Form controls
  {
    type: 'Input',
    label: 'Input',
    category: 'Form',
    acceptsChildren: false,
    defaultProps: { label: 'Label', placeholder: 'Type…', value: '', type: 'text', disabled: false, className: '' },
    fields: [
      { kind: 'string', path: 'label', label: 'Label', placeholder: 'Label' },
      { kind: 'string', path: 'placeholder', label: 'Placeholder', placeholder: 'Type…' },
      { kind: 'string', path: 'value', label: 'Value', placeholder: '' },
      {
        kind: 'select',
        path: 'type',
        label: 'Type',
        options: [
          { label: 'text', value: 'text' },
          { label: 'email', value: 'email' },
          { label: 'password', value: 'password' },
          { label: 'number', value: 'number' },
          { label: 'search', value: 'search' },
          { label: 'url', value: 'url' },
          { label: 'tel', value: 'tel' },
        ],
      },
      { kind: 'boolean', path: 'disabled', label: 'Disabled' },
      { kind: 'string', path: 'className', label: 'Class name', placeholder: 'tailwind classes…' },
    ],
    events: ['change'],
    Component: InputWidget,
  },
  {
    type: 'Textarea',
    label: 'Textarea',
    category: 'Form',
    acceptsChildren: false,
    defaultProps: { label: 'Label', placeholder: 'Write…', value: '', rows: 4, disabled: false, className: '' },
    fields: [
      { kind: 'string', path: 'label', label: 'Label', placeholder: 'Label' },
      { kind: 'string', path: 'placeholder', label: 'Placeholder', placeholder: 'Write…' },
      { kind: 'textarea', path: 'value', label: 'Value', placeholder: '', rows: 4 },
      { kind: 'number', path: 'rows', label: 'Rows', min: 1, max: 24, step: 1 },
      { kind: 'boolean', path: 'disabled', label: 'Disabled' },
      { kind: 'string', path: 'className', label: 'Class name', placeholder: 'tailwind classes…' },
    ],
    events: ['change'],
    Component: TextareaWidget,
  },
  {
    type: 'Select',
    label: 'Select',
    category: 'Form',
    acceptsChildren: false,
    defaultProps: {
      label: 'Label',
      placeholder: 'Select…',
      value: 'a',
      optionsText: 'a: Option A\nb: Option B',
      disabled: false,
      className: '',
    },
    fields: [
      { kind: 'string', path: 'label', label: 'Label', placeholder: 'Label' },
      { kind: 'string', path: 'placeholder', label: 'Placeholder', placeholder: 'Select…' },
      { kind: 'string', path: 'value', label: 'Value', placeholder: 'a' },
      { kind: 'textarea', path: 'optionsText', label: 'Options (value: label per line)', placeholder: 'a: Option A\nb: Option B', rows: 5 },
      { kind: 'boolean', path: 'disabled', label: 'Disabled' },
      { kind: 'string', path: 'className', label: 'Class name', placeholder: 'tailwind classes…' },
    ],
    events: ['change'],
    Component: SelectWidget,
  },
  {
    type: 'Checkbox',
    label: 'Checkbox',
    category: 'Form',
    acceptsChildren: false,
    defaultProps: { label: 'Checkbox', checked: false, disabled: false, className: '' },
    fields: [
      { kind: 'string', path: 'label', label: 'Label', placeholder: 'Checkbox' },
      { kind: 'boolean', path: 'checked', label: 'Checked' },
      { kind: 'boolean', path: 'disabled', label: 'Disabled' },
      { kind: 'string', path: 'className', label: 'Class name', placeholder: 'tailwind classes…' },
    ],
    events: ['change'],
    Component: CheckboxWidget,
  },
  {
    type: 'Switch',
    label: 'Switch',
    category: 'Form',
    acceptsChildren: false,
    defaultProps: { label: 'Switch', checked: false, size: 'default', disabled: false, className: '' },
    fields: [
      { kind: 'string', path: 'label', label: 'Label', placeholder: 'Switch' },
      { kind: 'boolean', path: 'checked', label: 'Checked' },
      {
        kind: 'select',
        path: 'size',
        label: 'Size',
        options: [
          { label: 'default', value: 'default' },
          { label: 'sm', value: 'sm' },
        ],
      },
      { kind: 'boolean', path: 'disabled', label: 'Disabled' },
      { kind: 'string', path: 'className', label: 'Class name', placeholder: 'tailwind classes…' },
    ],
    events: ['change'],
    Component: SwitchWidget,
  },

  // Data / product-ish widgets
  { type: 'StatCard', label: 'Stat card', category: 'Data', acceptsChildren: false, defaultProps: {}, fields: [], Component: StatCard },
  {
    type: 'DataTable',
    label: 'Data table',
    category: 'Data',
    acceptsChildren: false,
    defaultProps: {},
    fields: [],
    events: ['row_click'],
    Component: DataTable,
  },
  { type: 'MetricGrid', label: 'Metric grid', category: 'Data', acceptsChildren: false, defaultProps: {}, fields: [], Component: MetricGrid },
  { type: 'StarshipDetails', label: 'Starship details', category: 'Data', acceptsChildren: false, defaultProps: {}, fields: [], Component: StarshipDetails },

  // Charts
  { type: 'BarChart', label: 'Bar chart', category: 'Charts', acceptsChildren: false, defaultProps: {}, fields: [], Component: BarChart },
  { type: 'LineChart', label: 'Line chart', category: 'Charts', acceptsChildren: false, defaultProps: {}, fields: [], Component: LineChart },
  { type: 'AreaChart', label: 'Area chart', category: 'Charts', acceptsChildren: false, defaultProps: {}, fields: [], Component: AreaChart },
  { type: 'PieChart', label: 'Pie chart', category: 'Charts', acceptsChildren: false, defaultProps: {}, fields: [], Component: PieChart },
  { type: 'DonutChart', label: 'Donut chart', category: 'Charts', acceptsChildren: false, defaultProps: {}, fields: [], Component: DonutChart },
  { type: 'RadarChart', label: 'Radar chart', category: 'Charts', acceptsChildren: false, defaultProps: {}, fields: [], Component: RadarChart },
  { type: 'RadialChart', label: 'Radial chart', category: 'Charts', acceptsChildren: false, defaultProps: {}, fields: [], Component: RadialChart },

  // Other
  {
    type: 'ConnectorSuggestionCard',
    label: 'Connector suggestion card',
    category: 'Other',
    acceptsChildren: false,
    defaultProps: {},
    fields: [],
    Component: ConnectorSuggestionCard,
  },
  {
    type: 'AgentSuggestionCard',
    label: 'Agent suggestion card',
    category: 'Other',
    acceptsChildren: false,
    defaultProps: {},
    fields: [],
    Component: AgentSuggestionCard,
  },
])

export const WIDGET_CATALOG_BY_TYPE: Record<string, WidgetCatalogEntry> = Object.freeze(
  Object.fromEntries(WIDGET_CATALOG.map(w => [w.type, w])) as Record<string, WidgetCatalogEntry>
)

export function getWidgetCatalogEntry(type: string | null | undefined): WidgetCatalogEntry | null {
  if (!type) return null
  return WIDGET_CATALOG_BY_TYPE[type] ?? null
}

