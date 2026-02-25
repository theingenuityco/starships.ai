'use client'

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

export type WidgetDefinition = {
  type: string
  label: string
  category: 'Layout' | 'Content' | 'Data' | 'Charts' | 'Other'
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

export const WIDGET_DEFINITIONS: Record<string, WidgetDefinition> = {
  Box: {
    type: 'Box',
    label: 'Box',
    category: 'Layout',
    acceptsChildren: true,
    defaultProps: { className: '' },
    fields: [{ kind: 'string', path: 'className', label: 'Class name', placeholder: 'tailwind classes…' }],
  },

  Stack: {
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
  },

  Grid: {
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
  },

  Text: {
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
  },

  Button: {
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
  },

  Tabs: {
    type: 'Tabs',
    label: 'Tabs',
    category: 'Layout',
    acceptsChildren: true,
    defaultProps: { defaultIndex: 0, labels: [], className: '' },
    fields: [
      { kind: 'number', path: 'defaultIndex', label: 'Default index', min: 0, max: 50, step: 1 },
      { kind: 'string', path: 'className', label: 'Class name', placeholder: 'tailwind classes…' },
    ],
  },
}

export function getWidgetDefinition(type: string | null | undefined): WidgetDefinition | null {
  if (!type) return null
  return WIDGET_DEFINITIONS[type] ?? null
}

