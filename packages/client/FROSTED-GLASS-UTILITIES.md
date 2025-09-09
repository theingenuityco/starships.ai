# Frosted Glass Utilities

Beautiful frosted glass effects have been added to the Tailwind theme for reuse throughout the application.

## Utility Classes

### `.frosted-glass`

The main frosted glass effect - ultra-subtle transparency with strong blur.

- Background: Very subtle gradient (3% to 1% opacity)
- Backdrop filter: 20px blur with 180% saturation
- Border: Theme-aware with 20% opacity
- Perfect for: Navigation panels, floating elements

### `.frosted-glass-card`

Card-style frosted glass with slightly more opacity.

- Background: Card color gradient (10% to 5% opacity)
- Backdrop filter: 20px blur with 180% saturation
- Border: Theme-aware with 20% opacity
- Perfect for: Modal dialogs, content cards

### `.frosted-glass-light`

Lighter frosted glass effect with more visibility.

- Background: Background color gradient (5% to 2% opacity)
- Backdrop filter: 15px blur with 160% saturation
- Border: Theme-aware with 30% opacity
- Perfect for: Tooltips, dropdowns, temporary overlays

## Background Utilities

- `bg-frosted-light`: Light frosted background gradient
- `bg-frosted-subtle`: Subtle frosted background gradient
- `bg-frosted-card`: Card frosted background gradient

## Backdrop Filter Utilities

- `backdrop-filter-frosted`: 20px blur with 180% saturation
- `backdrop-filter-frosted-light`: 15px blur with 160% saturation
- `backdrop-filter-frosted-heavy`: 25px blur with 200% saturation

## Shadow Utilities

- `shadow-frosted`: Basic frosted shadow
- `shadow-frosted-lg`: Large frosted shadow
- `shadow-frosted-xl`: Extra large frosted shadow

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
