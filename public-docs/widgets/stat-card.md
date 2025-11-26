---
title: StatCard Widget
slug: widgets/stat-card
category: widgets
---

# StatCard Widget

A card component that displays multiple statistics with labels, values, and optional variants for visual emphasis.

## Component Name

`StatCard`

## Description

StatCard is a versatile widget for displaying key metrics and statistics. It presents data in a clean, organized card layout with support for multiple stats, color variants, and optional icons. Perfect for dashboards showing user counts, revenue metrics, performance indicators, or any numerical data.

## Props

### title
- **Type:** `string`
- **Required:** Yes
- **Description:** The main heading text displayed at the top of the card

### stats
- **Type:** `Array<StatItem>`
- **Required:** Yes
- **Description:** Array of statistics to display in the card. Each stat includes:
  - `label` (string, required): The stat label/name
  - `value` (string | number, required): The stat value to display
  - `variant` (string, optional): Visual style - `"default"`, `"success"`, `"warning"`, or `"error"`
  - `icon` (string, optional): Icon name to display next to the stat

### description
- **Type:** `string`
- **Required:** No
- **Description:** Optional subtitle or description text shown below the title

### className
- **Type:** `string`
- **Required:** No
- **Description:** Additional CSS classes for custom styling

## Visual Appearance

The StatCard displays as a bordered card containing:
- **Title:** Large heading at the top
- **Description:** Optional smaller text below title
- **Stats Grid:** Responsive grid of statistics (2-3 columns on desktop)
- Each stat shows:
  - Label in muted color
  - Value in large, bold text
  - Optional icon
  - Color-coded background based on variant:
    - `default`: Neutral background
    - `success`: Green background (positive metrics)
    - `warning`: Yellow background (attention needed)
    - `error`: Red background (critical issues)

## Usage Examples

### Basic StatCard

Display simple user statistics without variants:

```json
{
  "widgetType": "StatCard",
  "props": {
    "title": "User Statistics",
    "stats": [
      { "label": "Total Users", "value": 1250 },
      { "label": "Active Users", "value": 842 },
      { "label": "New Today", "value": 23 }
    ]
  }
}
```

### StatCard with Variants

Use color variants to emphasize different metric types:

```json
{
  "widgetType": "StatCard",
  "props": {
    "title": "System Health",
    "description": "Last 24 hours",
    "stats": [
      { "label": "Active Users", "value": 842, "variant": "success" },
      { "label": "Pending Actions", "value": 23, "variant": "warning" },
      { "label": "System Errors", "value": 3, "variant": "error" }
    ]
  }
}
```

### StatCard with Icons

Include icons for better visual context:

```json
{
  "widgetType": "StatCard",
  "props": {
    "title": "Revenue Metrics",
    "description": "Last 30 days",
    "stats": [
      {
        "label": "Total Revenue",
        "value": "$45,230",
        "variant": "success",
        "icon": "dollar-sign"
      },
      {
        "label": "Orders",
        "value": 342,
        "icon": "shopping-cart"
      },
      {
        "label": "Refunds",
        "value": "$850",
        "variant": "warning",
        "icon": "arrow-left"
      }
    ]
  }
}
```

### Complete Example with All Options

```json
{
  "widgetType": "StatCard",
  "props": {
    "title": "Q4 Performance Dashboard",
    "description": "October - December 2024",
    "className": "shadow-lg",
    "stats": [
      {
        "label": "Total Sales",
        "value": "$125,430",
        "variant": "success",
        "icon": "trending-up"
      },
      {
        "label": "Active Customers",
        "value": 1847,
        "variant": "success",
        "icon": "users"
      },
      {
        "label": "Pending Orders",
        "value": 156,
        "variant": "warning",
        "icon": "clock"
      },
      {
        "label": "Failed Transactions",
        "value": 12,
        "variant": "error",
        "icon": "alert-circle"
      }
    ]
  }
}
```

## Common Use Cases

1. **Dashboard Metrics:** Display KPIs, user counts, revenue figures
2. **System Monitoring:** Show server status, error counts, performance metrics
3. **Analytics Overview:** Present engagement stats, conversion rates, growth metrics
4. **E-commerce Stats:** Display sales, orders, customer counts, inventory levels
5. **Project Management:** Show task counts, team member stats, completion rates

## Tips for Agents

- **Extract data from user prompts:** When user says "842 active users, 23 pending", extract these as stat values
- **Choose appropriate variants:** Use `success` for positive metrics, `warning` for neutral/attention, `error` for critical
- **Use descriptive labels:** Keep labels concise but clear ("Active Users" not just "Users")
- **Format values appropriately:** Add currency symbols ($), percentages (%), or units as needed
- **Group related stats:** Put similar metrics in the same card

## Related Components

- **MetricGrid:** Similar but without card wrapper, for more compact layouts
- **Chart:** For visualizing trends over time instead of single values
- **DataTable:** For detailed tabular data instead of summary stats
