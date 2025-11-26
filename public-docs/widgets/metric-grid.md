---
title: MetricGrid Widget
slug: widgets/metric-grid
category: widgets
---

# MetricGrid Widget

A responsive grid layout for displaying multiple metrics and key-value pairs in a clean, organized format.

## Component Name

`MetricGrid`

## Description

MetricGrid is a lightweight widget for displaying multiple metrics or key-value pairs in a responsive grid layout. It provides a clean, scannable interface perfect for dashboards, summaries, and overview pages. Unlike StatCard, it has no card wrapper and focuses on compact presentation of multiple data points.

## Props

### metrics
- **Type:** `Array<Metric>`
- **Required:** Yes
- **Description:** Array of metrics to display. Each metric includes:
  - `label` (string, required): Metric label/name
  - `value` (string | number, required): Metric value
  - `unit` (string, optional): Unit of measurement (e.g., "%", "ms", "GB")
  - `trend` (string, optional): Trend indicator - "up", "down", "neutral"
  - `trendValue` (string, optional): Trend percentage or delta (e.g., "+12%", "-5")
  - `color` (string, optional): Custom color for the value (hex code)
  - `icon` (string, optional): Icon name to display next to label

### title
- **Type:** `string`
- **Required:** No
- **Description:** Optional heading displayed above the grid

### description
- **Type:** `string`
- **Required:** No
- **Description:** Optional subtitle or context text

### columns
- **Type:** `number`
- **Required:** No
- **Description:** Number of columns in the grid (default: 3, responsive breakpoints: 1 on mobile, 2 on tablet)

### compact
- **Type:** `boolean`
- **Required:** No
- **Description:** Whether to use compact spacing (default: false)

### showDividers
- **Type:** `boolean`
- **Required:** No
- **Description:** Whether to show dividers between metrics (default: true)

### className
- **Type:** `string`
- **Required:** No
- **Description:** Additional CSS classes for custom styling

## Visual Appearance

The MetricGrid displays as:
- **Title/Description:** Optional header text
- **Responsive Grid:** Auto-adjusting columns (1-4 based on screen size)
- **Metric Items:** Each showing label, value, optional unit, trend, and icon
- **Dividers:** Optional vertical separators between metrics
- **Trend Indicators:** Color-coded arrows or icons for trends
  - `up`: Green with up arrow (positive)
  - `down`: Red with down arrow (negative)
  - `neutral`: Gray with horizontal line
- **Compact Mode:** Reduced padding for dense layouts

## Usage Examples

### Basic MetricGrid - System Metrics

Simple metrics without trends:

```json
{
  "widgetType": "MetricGrid",
  "props": {
    "title": "System Overview",
    "metrics": [
      { "label": "CPU Usage", "value": 45, "unit": "%" },
      { "label": "Memory", "value": 8.2, "unit": "GB" },
      { "label": "Disk Space", "value": 156, "unit": "GB" },
      { "label": "Uptime", "value": "24d 6h" },
      { "label": "Active Processes", "value": 342 },
      { "label": "Network Traffic", "value": 125, "unit": "Mbps" }
    ],
    "columns": 3
  }
}
```

### MetricGrid with Trends

Metrics with trend indicators:

```json
{
  "widgetType": "MetricGrid",
  "props": {
    "title": "Business Metrics",
    "description": "Last 30 days vs previous period",
    "metrics": [
      { "label": "Revenue", "value": "$125,430", "trend": "up", "trendValue": "+12%" },
      { "label": "Active Users", "value": 1847, "trend": "up", "trendValue": "+8%" },
      { "label": "Conversion Rate", "value": 3.2, "unit": "%", "trend": "down", "trendValue": "-0.4%" },
      { "label": "Avg Order Value", "value": "$68", "trend": "neutral", "trendValue": "0%" },
      { "label": "Customer Retention", "value": 89, "unit": "%", "trend": "up", "trendValue": "+2%" },
      { "label": "Support Tickets", "value": 156, "trend": "down", "trendValue": "-15%" }
    ]
  }
}
```

### MetricGrid with Icons

Metrics with icons for visual context:

```json
{
  "widgetType": "MetricGrid",
  "props": {
    "title": "Performance Dashboard",
    "metrics": [
      { "label": "Response Time", "value": 245, "unit": "ms", "icon": "zap", "trend": "down", "trendValue": "-12%" },
      { "label": "Error Rate", "value": 0.3, "unit": "%", "icon": "alert-circle", "trend": "down", "trendValue": "-45%" },
      { "label": "Throughput", "value": 1250, "unit": "req/s", "icon": "activity", "trend": "up", "trendValue": "+8%" },
      { "label": "Cache Hit Rate", "value": 94, "unit": "%", "icon": "database", "trend": "neutral" }
    ],
    "columns": 2
  }
}
```

### Compact MetricGrid - Quick Stats

Dense layout for sidebar or limited space:

```json
{
  "widgetType": "MetricGrid",
  "props": {
    "title": "Today's Stats",
    "compact": true,
    "showDividers": false,
    "columns": 2,
    "metrics": [
      { "label": "Visitors", "value": 342 },
      { "label": "Page Views", "value": 1247 },
      { "label": "Bounce Rate", "value": 42, "unit": "%" },
      { "label": "Avg Session", "value": "3m 24s" }
    ]
  }
}
```

### MetricGrid with Custom Colors

Metrics with custom value colors:

```json
{
  "widgetType": "MetricGrid",
  "props": {
    "title": "Server Health",
    "metrics": [
      { "label": "API Status", "value": "Healthy", "color": "#10b981" },
      { "label": "Database", "value": "Healthy", "color": "#10b981" },
      { "label": "Cache", "value": "Warning", "color": "#f59e0b" },
      { "label": "Queue", "value": "Healthy", "color": "#10b981" },
      { "label": "Storage", "value": "Critical", "color": "#ef4444" },
      { "label": "CDN", "value": "Healthy", "color": "#10b981" }
    ]
  }
}
```

### 4-Column Grid - Financial Summary

Wide layout with many metrics:

```json
{
  "widgetType": "MetricGrid",
  "props": {
    "title": "Q4 Financial Summary",
    "description": "All figures in USD",
    "columns": 4,
    "metrics": [
      { "label": "Total Revenue", "value": "$2.4M", "trend": "up", "trendValue": "+18%" },
      { "label": "Operating Costs", "value": "$1.6M", "trend": "up", "trendValue": "+5%" },
      { "label": "Gross Profit", "value": "$800K", "trend": "up", "trendValue": "+34%" },
      { "label": "Net Margin", "value": 33, "unit": "%", "trend": "up", "trendValue": "+4%" },
      { "label": "Customer LTV", "value": "$1,250", "trend": "up", "trendValue": "+12%" },
      { "label": "CAC", "value": "$185", "trend": "down", "trendValue": "-8%" },
      { "label": "MRR", "value": "$85K", "trend": "up", "trendValue": "+22%" },
      { "label": "Churn Rate", "value": 3.2, "unit": "%", "trend": "down", "trendValue": "-1.1%" }
    ]
  }
}
```

### 2-Column Grid - User Engagement

Simple two-column layout:

```json
{
  "widgetType": "MetricGrid",
  "props": {
    "title": "User Engagement",
    "columns": 2,
    "metrics": [
      { "label": "Daily Active Users", "value": 8420, "icon": "users", "trend": "up", "trendValue": "+5%" },
      { "label": "Weekly Active Users", "value": 24300, "icon": "users", "trend": "up", "trendValue": "+8%" },
      { "label": "Avg Session Duration", "value": "12m 34s", "icon": "clock", "trend": "up", "trendValue": "+2m" },
      { "label": "Sessions per User", "value": 3.8, "icon": "repeat", "trend": "neutral" }
    ]
  }
}
```

## Trend Indicators

The `trend` property shows visual indicators:

- **`up`**: Green color with up arrow (↑) - indicates positive/improvement
- **`down`**: Red color with down arrow (↓) - indicates negative/decline
- **`neutral`**: Gray color with horizontal line (→) - indicates no change

Use `trendValue` to show the magnitude of change (e.g., "+12%", "-5", "+2.3 points").

## Common Use Cases

1. **Dashboard Overviews:** Display KPIs and key metrics at a glance
2. **System Monitoring:** Show server stats, performance metrics, health indicators
3. **Business Analytics:** Present revenue, user, and conversion metrics
4. **Financial Reports:** Display financial KPIs and ratios
5. **Performance Dashboards:** Show speed, error rates, and throughput metrics
6. **User Analytics:** Display engagement, retention, and growth metrics
7. **Real-time Monitoring:** Show live system or application metrics

## Tips for Agents

- **Extract metrics from prompts:**
  - "Show CPU at 45%, memory 8GB, disk 156GB" → Create three metrics with appropriate units
  - "Revenue up 12%, users up 8%, conversion down 0.4%" → Create metrics with trend indicators

- **Choose appropriate column count:**
  - 2-4 metrics → `columns: 2`
  - 5-6 metrics → `columns: 3`
  - 7+ metrics → `columns: 4` or `columns: 3`
  - Small space/sidebar → `columns: 1` or `columns: 2` with `compact: true`

- **Use trend indicators wisely:**
  - "Up" doesn't always mean good (e.g., error rate increasing is bad)
  - "Down" doesn't always mean bad (e.g., response time decreasing is good)
  - Consider the context of each metric
  - Use `neutral` for metrics where change is neither good nor bad

- **Format values appropriately:**
  - Currency → "$125,430" or "$2.4M"
  - Percentages → use `unit: "%"` instead of including in value
  - Time → "3m 24s", "24d 6h"
  - Large numbers → "1.2M", "450K" or "1,200,000"

- **Choose icons that match metrics:**
  - Users/people → "users"
  - Performance → "zap", "activity"
  - Time → "clock"
  - Errors → "alert-circle"
  - Money → "dollar-sign"
  - Storage → "database", "hard-drive"

- **Use compact mode when:**
  - Displaying in sidebar or narrow container
  - Many metrics need to fit in limited space
  - Reducing visual clutter is important

- **Custom colors for status:**
  - Green (#10b981) → Healthy, good, success
  - Yellow (#f59e0b) → Warning, attention needed
  - Red (#ef4444) → Critical, error, danger
  - Blue (#3b82f6) → Informational, neutral
  - Gray (#6b7280) → Inactive, disabled

## Related Components

- **StatCard:** Similar functionality but with card wrapper and more visual emphasis
- **Chart:** For visualizing metric trends over time instead of current values
- **DataTable:** For detailed row-by-row data instead of summary metrics
