# Fight Picker Style Guidelines

This document is mandatory for agents making visual, styling, layout, or user-interface changes in Fight Picker. Existing component patterns and these rules take precedence over generic framework defaults. When a requested change conflicts with this guide, call out the conflict before implementing it.

Last updated: August 13, 2026.

## Design Source Hierarchy

Use this order when references disagree:

1. The Fight Picks logo, product semantics, and explicit rules in this document.
2. Shared tokens and heading classes in `Client/src/index.css`.
3. The current implementation references listed at the end of this document.
4. External inspiration, including Beautiful UI, as directional guidance only.

External references must never override Fight Picker's palette, dark-only identity, red-left/blue-right fight order, accessibility, or product workflow.

## Brand Direction

Fight Picker should feel bold, competitive, social, and intentionally designed around the Fight Picks logo. The interface should be dark, high-contrast, energetic, and easy to scan without becoming neon, futuristic, or arcade-like.

Use the logo palette as the source of truth. Do not introduce a new dominant color family for a feature.

The visual balance should generally be:

- Red and pink energy on the left side of a two-sided layout.
- Blue energy on the right side of a two-sided layout.
- Black and white as the structural foundation.
- Accent colors used selectively for state, emphasis, and hierarchy rather than covering every surface.

The product should feel like a focused event workspace rather than a promotional poster. Prefer compact navigation, stable surfaces, clear hierarchy, progressive disclosure, and immediate feedback. Visual personality should come from the Fight Picks logo, fighter imagery, player cards, and avatars—not from decorative chrome.

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
- `--radius-md: 8px` is a legacy-compatible alias; prefer `--radius-sm` for new 8px surfaces.
- `--radius-lg: 12px` and `--radius-xl: 16px` are reserved for established large app surfaces. Do not introduce them casually.
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

### Application shell

- Design mobile first. The authenticated mobile shell uses a compact sticky header and a persistent bottom workspace bar for Picks, Prop Pix, and Leaderboard.
- Keep bottom navigation above the safe-area inset and reserve enough page-bottom spacing that it never covers the last action or footer control.
- Desktop uses a slim persistent left rail for workspace views, Stats, and Profile. Do not duplicate the mobile bottom bar on desktop.
- Notifications, account controls, logout, version, and admin access remain available, but they must not compete with the active event workflow.
- Preserve the active event and workspace view in the URL as `/?event=<id>&view=picks|props|leaderboard`.
- Constrain every authenticated route to the viewport. A component must not restore a body minimum width or create page-level horizontal scrolling.

### Event workspace and poster strip

- Events use one horizontally scrolling, native snap strip with stable poster dimensions. Do not add carousels with repeated centering timers or continuous animation.
- Show the complete poster with `object-fit: contain`; never crop poster artwork merely to fill its card.
- Poster cards, their images, and status labels must remain fully contained at narrow mobile widths.
- Status labels use a compact, opaque dark surface inset from every card edge. Long states such as `Coming Soon` must fit without translating outside the card.
- If artwork is missing or fails, show a high-contrast fallback containing only the event name and date. Do not squeeze location or other metadata into the poster tile.
- Center the selected event once after initial reconciliation. User scrolling should remain under user control after that.
- Put date, location, card times, and status in the compact selected-event summary below the strip.
- Keep the large editor admin-only, collapsed by default, and loaded only when needed.

### Fight workspace

- The fight list is displayed in reverse event order: main event at the top, earliest/next chronological bout at the bottom. Any automatic navigation must therefore search bottom to top.
- On entry, focus the next open fight missing a pick. If all picks are submitted and results have started, focus the next unfinished fight. If no result exists, preserve the normal top-of-page start.
- After a successful submission, advance to the next open fight missing a pick. Do not advance after a failed submission.
- When expanded stats collapse, return the same fight card to the sticky-header boundary. Do not leave the user looking at the following card after content height changes.
- Keep red-corner/fighter-one content on the left and blue-corner/fighter-two content on the right at every viewport size.
- Fighter like/dislike reminders use labeled controls in expanded details, a persistent portrait badge in collapsed views, and a brief one-shot portrait reaction. Do not use continuous reaction animation.

## Typography and Content

- Use the existing Inter system for interface text.
- Reserve display/decorative type for established brand moments such as the greeting or logo-adjacent treatments.
- Match heading size to its container. Compact panels should not receive hero-scale typography.
- Keep labels concise and action-oriented.
- Do not add explanatory paragraphs describing obvious controls. Use clear labels, familiar icons, tooltips for unfamiliar icons, and inline validation.

### Heading hierarchy

Use semantic heading levels for document structure and shared classes for visual hierarchy. Do not style a heading ad hoc because a nearby component looks different.

| Role | Shared class | Current size | Typical use |
| --- | --- | --- | --- |
| Page | `.app-page-heading` | `2rem` | Leaderboard, Prop Pix, Profile, authentication |
| Content | `.app-content-heading` | `1.5rem` | A primary section within a page |
| Section | `.app-section-heading` | `0.8rem` | Events, Upcoming Fights, compact workspace labels |
| Subsection | `.app-subsection-heading` | `1rem` | Panel and card group titles |

- Page headings are strong, uppercase, and widely spaced.
- Content headings use normal letter spacing and should not imitate hero typography.
- Section headings are muted, uppercase, and compact. Events and Upcoming Fights must use the same section-heading treatment.
- Use an `h1` once for the page topic where practical, then descend in order. A visual class does not change semantic rank.

## Controls and States

- Use icons for icon-native actions such as notifications, save, close, expand, collapse, and navigation. Add accessible labels and tooltips where needed.
- Use segmented controls or tabs for mutually exclusive views, but keep them borderless unless an existing component establishes a different pattern.
- Use swatches for color choices, toggles/checkboxes for binary settings, menus for option sets, and inputs/sliders/steppers for numeric values.
- Provide visible hover, focus, disabled, loading, empty, error, and success states.
- Focus states must remain visible without relying on cyan or neon outlines.
- Do not use rounded rectangular text buttons when a familiar symbol communicates the action more clearly.

### Navigation, tabs, and persistent preferences

- Mutually exclusive leaderboard periods use neutral text tabs with restrained active text/border treatment. Do not use shaded, gradient, glowing, or oversized active pills.
- Binary preferences use a real labeled switch. AI-user visibility lives in the footer as one persistent app-level preference shared by Picks and all leaderboard periods.
- Keep ordinary controls opaque or transparent. Do not use large-area backdrop blur or glass styling for routine controls.
- Pending actions should be local to the affected card. Use optimistic feedback only when rollback is reliable; do not blank or refresh the whole workspace.

### Leaderboard meaning

- Event leaderboards show event point totals without a point-difference badge; every event total already starts from zero.
- Event rank movement compares standings immediately before and after the latest completed fight.
- Completed, seasonal, and all-time boards should feel stable. Refresh on entry, explicit refresh, or bounded focus revalidation rather than constant polling.
- Keep player identity and streak/rivalry effects attached to the avatar or player identity area, not spread across the whole leaderboard card background.

## Imagery and Visual Assets

- Use real or generated bitmap assets when the user needs to inspect a subject, product, venue, person, or event.
- Do not use dark, blurred, cropped, or purely atmospheric media when the subject needs to be understood.
- Preserve the logo as a primary brand signal and do not tint it with non-brand colors.

### Procedural avatars and player cards

- The avatar system is a playful identity layer and may use user-selected colors beyond the core chrome palette. The surrounding interface must still use the Fight Picks palette.
- Supported character silhouettes, patterns, expressions, colors, proportions, and motion come from `avatarConfig.js` and `SquidAvatar.jsx`; do not maintain a second option list in styling code.
- Keep characters as connected, mouthless silhouettes with a restrained offset shadow. Character accents are independently configurable, render above patterns, and use their selected colors rather than washed-out overlays.
- Do not place avatars on generic backing plates in lists. Player-card artwork may still provide its intended background.
- Motion must stay lightweight: slow drift, occasional blink, and brief contextual reactions. Dense lists should render less motion than prominent profile/player-card views.
- Fire and frost streak treatments belong on the avatar. Pick-twin and nemesis reactions should be occasional, contextual, and non-blocking.
- Always honor `prefers-reduced-motion`; identity and state must remain understandable without animation.
- The player-card picker is compact, mobile-first, and two-column where space allows. It must clearly distinguish selected, available, and locked cards without relying on color alone.
- Load card choices and unlock details only when the picker opens. Apply a successful selection immediately and restore the previous state if saving fails.

## Motion and Performance

- Limit interface motion to purposeful opacity, color, and small positional transitions, normally `120–180ms`.
- Do not use hover scaling, cascading card entrances, count-up animations for routine data, continuous glows/pulses, or broad `transition: all` rules.
- Continuous avatar motion is the narrow exception described above and must be inexpensive, selectively enabled, and reduced-motion safe.
- Mount and fetch only the active workspace view. Prop Pix and Leaderboard must not request their view data before the user opens them.
- Preserve cached view content during revalidation instead of replacing it with a blank state. Use stable skeletons only for true first loads.
- Pause notification and leaderboard polling while the document is hidden. Poll an unfinished event leaderboard only while its view is visible.
- Public responses may use session-backed stale-while-revalidate caching. Personalized responses remain memory-only and clear on logout.
- Images need explicit dimensions or stable aspect ratios, lazy loading below the fold, and appropriate optimized variants.

## Implementation Checklist

Before completing a stylistic change, agents must verify:

- The new colors are consistent with the logo palette and do not introduce cyan, neon, purple-led, yellow, or unrelated dominant accents.
- Red-left and blue-right ordering is preserved where the layout has opposing sides.
- New radii use the existing tokens and do not add decorative curves or tab underlines.
- Text fits at desktop and mobile widths without overlap or clipping.
- Hover, focus, disabled, loading, empty, and error states remain coherent.
- Headings use the shared hierarchy unless a documented branded exception applies.
- Poster images use contain behavior, and event badges remain inside their cards at mobile widths.
- Sticky headers and bottom navigation do not obscure scroll targets or final controls.
- The active view is the only secondary workspace view mounted and fetched.
- Avatar motion and all other motion remain usable with reduced motion enabled.
- The relevant client lint/build checks pass.
- A browser screenshot or equivalent visual inspection has been used for meaningful layout changes.

## References

### External inspiration

- [Beautiful UI](https://www.beautifului.dev/) — directional reference for restraint, compact navigation, stable surfaces, and progressive disclosure. It is not a source for Fight Picker colors, branding, or fight semantics.

### Internal authoritative references

| Area | Reference |
| --- | --- |
| Logo and palette source | [`Client/src/assets/fytpix_500x500.png`](Client/src/assets/fytpix_500x500.png) |
| Global tokens and heading hierarchy | [`Client/src/index.css`](Client/src/index.css) |
| Mobile header, bottom workspace bar, desktop rail, footer preference | [`Client/src/App.jsx`](Client/src/App.jsx), [`Client/src/App.css`](Client/src/App.css) |
| URL-backed workspace state | [`Client/src/utils/workspaceState.js`](Client/src/utils/workspaceState.js) |
| Poster strip, fallbacks, status labels, selected-event summary | [`Client/src/EventSelector.jsx`](Client/src/EventSelector.jsx), [`Client/src/EventSelector.css`](Client/src/EventSelector.css) |
| Fight cards, red/blue semantics, reminders, anchored expansion | [`Client/src/Fights.jsx`](Client/src/Fights.jsx), [`Client/src/Fights.css`](Client/src/Fights.css) |
| Bottom-to-top fight targeting | [`Client/src/utils/fightNavigation.js`](Client/src/utils/fightNavigation.js) |
| Leaderboard controls and player presentation | [`Client/src/Leaderboard.jsx`](Client/src/Leaderboard.jsx), [`Client/src/Leaderboard.css`](Client/src/Leaderboard.css) |
| Stats and profile surfaces | [`Client/src/HighlightsPage.jsx`](Client/src/HighlightsPage.jsx), [`Client/src/HighlightsPage.css`](Client/src/HighlightsPage.css), [`Client/src/ProfilePage.jsx`](Client/src/ProfilePage.jsx), [`Client/src/ProfilePage.css`](Client/src/ProfilePage.css) |
| Prop Pix workspace | [`Client/src/components/PropPix.jsx`](Client/src/components/PropPix.jsx), [`Client/src/components/PropPix.css`](Client/src/components/PropPix.css) |
| Avatar options and validation | [`Client/src/utils/avatarConfig.js`](Client/src/utils/avatarConfig.js) |
| Avatar rendering and motion | [`Client/src/components/SquidAvatar.jsx`](Client/src/components/SquidAvatar.jsx), [`Client/src/components/SquidAvatar.css`](Client/src/components/SquidAvatar.css) |
| Avatar editing | [`Client/src/components/AvatarCustomizer.jsx`](Client/src/components/AvatarCustomizer.jsx), [`Client/src/components/AvatarCustomizer.css`](Client/src/components/AvatarCustomizer.css) |
| Player-card presentation and selection | [`Client/src/components/PlayerCard.jsx`](Client/src/components/PlayerCard.jsx), [`Client/src/components/PlayerCard.css`](Client/src/components/PlayerCard.css), [`Client/src/components/PlayerCardSelector.jsx`](Client/src/components/PlayerCardSelector.jsx), [`Client/src/components/PlayerCardSelector.css`](Client/src/components/PlayerCardSelector.css) |
