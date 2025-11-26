/**
 * Widget Domain Types - Simplified Props-Based Architecture
 *
 * Widgets store component props directly - no schema/data separation.
 * What you store in the database is exactly what the React component receives as props.
 */

/**
 * Widget Model - Core entity
 */
export interface WidgetModel {
  id: string;
  name: string;
  slug: string;
  description: string;
  widgetType: string; // Component to render (e.g., "PieChart", "StatCard")
  props: Record<string, unknown>; // Component props with values
  starshipId: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Create Widget Request
 */
export interface CreateWidgetRequest {
  name: string;
  slug?: string; // Optional: auto-generated from name if not provided
  description: string;
  widgetType: string; // Component name
  props: Record<string, unknown>; // Component props with values (required)
  starshipId: string;
}

/**
 * Update Widget Request
 */
export interface UpdateWidgetRequest {
  name?: string;
  description?: string;
  props?: Record<string, unknown>; // Props to merge with existing
}

/**
 * Widget Search Parameters
 */
export interface WidgetSearchParams {
  starshipId?: string;
  name?: string;
  slug?: string;
  widgetType?: string; // Filter by component type
  limit?: number;
  offset?: number;
}
