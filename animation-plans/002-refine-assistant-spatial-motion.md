---
title: Refine assistant spatial motion and message feedback
priority: HIGH
status: ready
area: assistant
version: b00634a
---

# Refine assistant spatial motion and message feedback

## Finding

The desktop assistant workspace, mobile assistant sheet, and proactive reminder currently share generic scale-and-rise keyframes. Their different spatial origins are not communicated, assistant hover rules are not consistently limited to hover-capable pointers, and newly added conversation content lacks a restrained, local acknowledgement.

## Why it matters

The assistant is a high-attention surface. Motion should explain where the surface comes from and make sending/receiving messages feel responsive without repeatedly animating streamed text or competing with reading.

## Implementation

1. In `frontend/src/styles.css`, give the desktop panel a 220ms opacity plus 8px horizontal reveal from the right with `--ease-out` and `transform-origin: top right`.
2. On mobile, override the panel with a 280ms bottom-sheet reveal using `cubic-bezier(0.32, 0.72, 0, 1)`, `translateY(20px)`, and no scale.
3. Give the reminder its own 180ms opacity plus 6px vertical reveal from `bottom right`.
4. Add a short, one-time entrance for newly mounted conversation rows and quick-reply groups, but never attach animation to the streamed text node itself.
5. Move assistant hover transforms/background effects inside `@media (hover: hover) and (pointer: fine)`, retain 100–160ms press feedback, and make reduced-motion behavior opacity-only.

## Verification

- Open the assistant on desktop and mobile and confirm the motion matches its screen edge.
- Send a message and confirm only the new row enters; streamed characters must not pulse or shift.
- Confirm touch devices do not retain hover states.
- Confirm reduced-motion mode removes translation and scale.

