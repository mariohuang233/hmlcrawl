---
title: Unify page entry rhythm and remove legacy motion conflicts
priority: HIGH
status: ready
area: page-shell
version: b00634a
---

# Unify page entry rhythm and remove legacy motion conflicts

## Finding

The page currently has two competing entrance systems. The canonical `.animate-in` rule uses the intended 220ms `--ease-out` motion, while the older, more-specific `.hero-card.animate-in:nth-child(...)` rules still force 600ms horizontal slides and a 150ms delay. Because specificity wins, the first viewport feels slower and less cohesive than the lower sections.

## Why it matters

The overview is the first and most frequently seen state. A long, directional slide makes the dashboard feel staged instead of immediately usable, and it creates an inconsistent tempo relative to the 140–220ms interactions elsewhere.

## Implementation

1. In `frontend/src/styles.css`, remove the legacy `slideInLeft` and `slideInRight` keyframes and their two `.hero-card.animate-in:nth-child(...)` assignments.
2. Keep all page and section entrance motion on `opacity` and `transform`, using `--duration-enter` and `--ease-out`.
3. Refine `.animate-in` to a subtle 6px vertical reveal and add small, capped delays for the two hero cards and four summary cards. The maximum delay must stay at or below 120ms, and controls must remain interactive immediately.
4. Keep `prefers-reduced-motion` opacity-only and remove all entrance delays in that mode.

## Verification

- Reload on desktop and mobile and confirm the first viewport settles within roughly 300ms.
- Confirm no horizontal page movement remains.
- Confirm keyboard focus is available immediately during entrances.
- Confirm reduced-motion mode uses opacity only with no stagger.

