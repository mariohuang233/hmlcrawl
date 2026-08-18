---
title: Restrain data update feedback and staged detail reveals
priority: MEDIUM
status: ready
area: dashboard-data
version: b00634a
---

# Restrain data update feedback and staged detail reveals

## Finding

Updated stat values currently run a 500ms overshooting scale to 1.12 with a glow, while device detail cards appear as one undifferentiated block and recharge rows can accumulate unbounded inline animation delay. This makes refreshes visually louder than the actual data hierarchy and can keep a long history list animating after it is already visible.

## Why it matters

Data refresh happens often, so its feedback must be subtle and inexpensive. The high-value hierarchy is the section first, then its first few records; later rows should be available immediately.

## Implementation

1. In `frontend/src/styles.css`, replace `numberFlash` with a 180ms color-and-opacity emphasis with at most a 2px vertical offset and no glow or overshoot.
2. In `frontend/src/components/AnimatedNumber.tsx`, align the update-state timeout with the new 180ms duration.
3. Add a small, capped stagger to the first three `.device-energy-item` children after the parent becomes visible.
4. In `frontend/src/components/RechargeHistory.tsx`, cap timeline animation delay to the first five rows and keep all later rows at the same maximum delay or zero; prefer a CSS custom property over a broad inline `animationDelay` property.
5. Ensure all detail animation uses `opacity` and `transform` only, and remove delays under `prefers-reduced-motion`.

## Verification

- Refresh data repeatedly and confirm number updates feel noticeable but calm.
- Scroll to device energy and recharge history and confirm the first details cascade quickly without delaying long lists.
- Confirm no layout shift and no lingering animation beyond 300ms.
- Confirm reduced-motion mode has no transform or stagger.

