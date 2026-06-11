# Responsive UI Guidelines

This document captures implementation lessons from the docs header and search
responsive fixes. Reuse these checks before changing shared navigation,
toolbar, or search components.

## Keep Stateful Positioning in the Component

When a component changes layout by state, keep the state-specific positioning in
the component class logic.

Examples:

- Collapsed search button: center the icon inside the square button.
- Expanded mobile search: make both the input and icon use the same fixed
  coordinate system.
- Desktop search: keep the icon inside the normal input layout.

Avoid splitting one state between component classes and global CSS. If the input
is fixed but the icon remains absolute to the old container, the icon can appear
under or outside the input.

## Do Not Hide Primary Navigation to Fix Crowding

For tablet and medium desktop widths, keep primary navigation items visible
unless the product decision is to move them into a menu.

Prefer compressing secondary information first:

- Hide logo text and keep only the logo icon.
- Shorten the search input width.
- Hide keyboard shortcut hints.
- Use compact language controls.
- Hide GitHub star counts and keep only the icon.
- Tighten gaps and font size slightly.

Only move navigation into a menu as a deliberate layout mode, not as an
accidental overflow fix.

## Avoid Global CSS Fighting Component Classes

Global CSS is useful for broad layout rules, but it should not compete with
stateful component classes for the same properties.

Use global CSS for:

- Breakpoint-level spacing.
- Shared container constraints.
- Browser-native appearance resets.
- Theme-safe background and border defaults.

Use component classes for:

- Focused vs unfocused state.
- Expanded vs collapsed state.
- Icon placement tied to state.
- Element-specific z-index and fixed positioning.

If a value changes but the UI does not, check whether another class has higher
specificity or whether the visible element is not the one being edited.

## Normalize Native Search Inputs

Browsers can add native UI to `input[type="search"]`, including search
decorations and cancel buttons. Disable native decoration when using custom
icons.

Recommended baseline:

```css
input[type="search"] {
  -webkit-appearance: none;
  appearance: none;
}

input[type="search"]::-webkit-search-decoration,
input[type="search"]::-webkit-search-cancel-button {
  -webkit-appearance: none;
}
```

This avoids mistaking browser-native search icons for custom SVG icons during
debugging.

## Verify by Breakpoint and State

For shared header changes, verify the matrix below before committing:

- Mobile collapsed header.
- Mobile search focused.
- Mobile menu open.
- Tablet or medium desktop with localized nav labels.
- Desktop with full controls.
- Light and dark themes when colors or backgrounds changed.

When the issue is visual positioning, inspect the actual rendered element and
computed styles instead of tuning values blindly.
