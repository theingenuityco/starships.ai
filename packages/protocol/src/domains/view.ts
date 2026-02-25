/**
 * View Domain Types
 *
 * A "View" is a persisted, starship-scoped grid layout that arranges existing widgets
 * into a fixed-column grid with potentially infinite rows.
 */

export interface ViewGridItem {
  /**
   * Stable item id within the view layout (nanoid format recommended).
   */
  id: string;
  /**
   * References an existing WidgetModel.id
   */
  widgetId: string;
  /**
   * 0-based grid coordinates.
   */
  col: number;
  row: number;
  /**
   * Optional spans. Defaults are interpreted by the client as 1.
   */
  colSpan?: number;
  rowSpan?: number;
}

/**
 * Input item shape accepted by create/update endpoints.
 * The server/models layer will generate an id when omitted.
 */
export interface ViewGridItemInput extends Omit<ViewGridItem, 'id'> {
  id?: string;
}

export interface ViewLayout {
  /**
   * Fixed number of columns for the grid.
   */
  cols: number;
  /**
   * Placed widget items.
   */
  items: ViewGridItem[];
}

/**
 * Input layout shape accepted by create/update endpoints.
 * Item ids may be omitted and will be generated.
 */
export interface ViewLayoutInput extends Omit<ViewLayout, 'items'> {
  items: ViewGridItemInput[];
}

export interface ViewModel {
  id: string;
  name: string;
  slug: string;
  description: string;
  layout: ViewLayout;
  starshipId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateViewRequest {
  name: string;
  slug?: string;
  description: string;
  layout?: ViewLayoutInput;
  starshipId: string;
}

export interface UpdateViewRequest {
  name?: string;
  description?: string;
  layout?: ViewLayoutInput;
}

export interface ViewSearchParams {
  starshipId?: string;
  name?: string;
  slug?: string;
  limit?: number;
  offset?: number;
}

