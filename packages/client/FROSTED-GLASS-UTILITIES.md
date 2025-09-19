# Frosted Glass Utilities

Beautiful frosted glass effects have been added to the Tailwind theme for reuse throughout the application.

## Utility Classes

### `.frosted-glass-card`

The primary frosted glass effect with maximum visibility and dark shadows.

- Background: Card color gradient (30% to 20% opacity)
- Backdrop filter: 20px blur with 180% saturation
- Border: Theme-aware with 20% opacity
- Perfect for: Navigation panels, message inputs (both sizes), modal dialogs, content cards

## Background Utilities

- `bg-frosted-card`: Card frosted background gradient

## Shadow Utilities

- `shadow-frosted-xl`: Extra large frosted shadow with maximum dark mode visibility

## Usage Examples

```jsx
// Navigation panel (current usage)
<div className="frosted-glass rounded-2xl shadow-frosted-xl">
  {/* content */}
</div>

// Modal dialog
<div className="frosted-glass-card rounded-lg shadow-frosted-lg">
  {/* modal content */}
</div>

// Tooltip or dropdown
<div className="frosted-glass-light rounded-md shadow-frosted">
  {/* tooltip content */}
</div>

// Custom combination
<div className="bg-frosted-subtle backdrop-filter-frosted border border-border/20 rounded-xl">
  {/* custom frosted element */}
</div>
```

## Theme Adaptation

All frosted glass utilities automatically adapt to dark and light themes:

- Use theme CSS variables (`--background`, `--card`, `--border`)
- Maintain consistent appearance across theme switches
- Preserve accessibility and readability

## Browser Support

- Modern browsers: Full support with `backdrop-filter`
- Legacy browsers: Graceful degradation with background gradients
- WebKit prefixes included for maximum compatibility
