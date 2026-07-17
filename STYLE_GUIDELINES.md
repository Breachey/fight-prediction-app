# Fight Picker Style Guidelines

This document is mandatory for agents making visual, styling, layout, or user-interface changes in Fight Picker. Existing component patterns and these rules take precedence over generic framework defaults. When a requested change conflicts with this guide, call out the conflict before implementing it.

## Brand Direction

Fight Picker should feel bold, competitive, social, and intentionally designed around the Fight Picks logo. The interface should be dark, high-contrast, energetic, and easy to scan without becoming neon, futuristic, or arcade-like.

Use the logo palette as the source of truth. Do not introduce a new dominant color family for a feature.

The visual balance should generally be:

- Red and pink energy on the left side of a two-sided layout.
- Blue energy on the right side of a two-sided layout.
- Black and white as the structural foundation.
- Accent colors used selectively for state, emphasis, and hierarchy rather than covering every surface.

## Brand Palette

| Name | Hex | RGB | Primary use |
| --- | --- | --- | --- |
| Cotton Candy | `#F99EAD` | `249, 158, 173` | Soft red/pink emphasis, left-side highlights, friendly secondary accents |
| Burnt Tangerine | `#E9170D` | `233, 23, 13` | Strong red emphasis, alerts, left-side states, decisive actions |
| Black | `#050000` | `5, 0, 0` | App background, deep surfaces, overlays, text contrast foundations |
| Persian Blue | `#2B31B2` | `43, 49, 178` | Blue emphasis, right-side highlights, selected states, right-side controls |
| White | `#FCFBFD` | `252, 251, 253` | Primary text, readable controls, high-contrast surfaces |

### Color rules

- Do not use cyan, electric cyan, neon colors, fluorescent colors, or aqua as brand accents.
- Do not use purple or violet as a core color, dominant gradient, primary button color, or main background treatment.
- Do not use yellow, gold, lime, or generic orange as a default accent. Burnt Tangerine is the approved red-orange brand color; it is not a license to introduce a yellow/orange palette.
- Prefer the exact palette colors or restrained alpha variations of them over unrelated hex values.
- Use neutral black/white/gray surfaces for most panels. A screen should not become a wall of accent color.
- Keep text contrast high. Cotton Candy and Persian Blue should not be used for small text on similarly saturated backgrounds.
- Use red for left-side semantics and blue for right-side semantics whenever a UI presents two opposing sides, fighters, vote columns, or comparison lanes.
- Use color as a supplement to labels, icons, borders, or position. Never make color the only way to understand state.

### Gradients and effects

- Gradients may be subtle and should blend approved red, blue, black, white, and transparent values.
- Avoid dominant purple/blue gradients, cyan glows, neon glows, and rainbow effects.
- Use shadows for separation, not spectacle. Avoid heavy outer glows around ordinary controls.
- Do not add decorative orbs, bokeh blobs, floating circles, or abstract gradient blobs.

## Shape and Corner Radius

Use the existing radius tokens from `Client/src/index.css`:

- `--radius-xs: 4px` for compact controls, badges, and small utility elements.
- `--radius-sm: 8px` for cards, panels, inputs, and standard framed content.
- `--radius-md: 12px` only where an existing component already uses it or a larger control genuinely needs it.
- `--radius-lg: 16px` and `--radius-xl: 20px` only for established large app surfaces. Do not introduce them casually.
- `999px` pills are reserved for compact status chips, avatars, and deliberately pill-shaped indicators. They are not the default button shape.

New cards and compact feature surfaces should default to `4px` or `8px`. Do not create decorative rounded borders, curved underlines, tab arcs, or capsule-shaped text buttons. Tabs should use text, spacing, and restrained background contrast; they should not rely on a thick border or underline as decoration.

Do not add decorative accent rails, vertical edge strips, left or right border bars, corner bars, asymmetric accent borders, or similar visual markers to cards, headers, panels, or controls unless the user explicitly requests that treatment. Communicate state with labels, restrained surface contrast, or a normal full border instead.

## Layout and Composition

- Build for the actual workflow first. Operational screens should prioritize scanning, comparison, and repeated action.
- Keep page sections unframed unless they are genuinely a tool surface. Use cards for repeated items, not for every section.
- Do not place cards inside cards without a clear information hierarchy.
- Keep two-sided comparisons visually balanced and preserve red-left/blue-right ordering.
- Use stable dimensions for controls, cards, tabs, grids, and repeated tiles so text or hover states do not shift layout.
- Make mobile layouts deliberate: stack content when needed, keep controls full-width when useful, and prevent text from colliding with adjacent controls.
- Do not scale font sizes with viewport width. Use responsive layout constraints instead.
- Keep enough of the next section visible on branded or object-focused first views when designing a hero-like layout.

## Typography and Content

- Use the existing Inter system for interface text.
- Reserve display/decorative type for established brand moments such as the greeting or logo-adjacent treatments.
- Match heading size to its container. Compact panels should not receive hero-scale typography.
- Keep labels concise and action-oriented.
- Do not add explanatory paragraphs describing obvious controls. Use clear labels, familiar icons, tooltips for unfamiliar icons, and inline validation.

## Controls and States

- Use icons for icon-native actions such as notifications, save, close, expand, collapse, and navigation. Add accessible labels and tooltips where needed.
- Use segmented controls or tabs for mutually exclusive views, but keep them borderless unless an existing component establishes a different pattern.
- Use swatches for color choices, toggles/checkboxes for binary settings, menus for option sets, and inputs/sliders/steppers for numeric values.
- Provide visible hover, focus, disabled, loading, empty, error, and success states.
- Focus states must remain visible without relying on cyan or neon outlines.
- Do not use rounded rectangular text buttons when a familiar symbol communicates the action more clearly.

## Imagery and Visual Assets

- Use real or generated bitmap assets when the user needs to inspect a subject, product, venue, person, or event.
- Do not use dark, blurred, cropped, or purely atmospheric media when the subject needs to be understood.
- Preserve the logo as a primary brand signal and do not tint it with non-brand colors.

## Implementation Checklist

Before completing a stylistic change, agents must verify:

- The new colors are consistent with the logo palette and do not introduce cyan, neon, purple-led, yellow, or unrelated dominant accents.
- Red-left and blue-right ordering is preserved where the layout has opposing sides.
- New radii use the existing tokens and do not add decorative curves or tab underlines.
- Text fits at desktop and mobile widths without overlap or clipping.
- Hover, focus, disabled, loading, empty, and error states remain coherent.
- The relevant client lint/build checks pass.
- A browser screenshot or equivalent visual inspection has been used for meaningful layout changes.
