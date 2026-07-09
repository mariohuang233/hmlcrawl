---
name: design-taste-frontend
version: 2.0.0
description: The Anti-Slop Frontend Framework for AI Agents
---

# DESIGN_VARIANCE: 7
# MOTION_INTENSITY: 6
# VISUAL_DENSITY: 5

## Anti-Slop Ban List

### Visual & CSS
- No neon glows
- No pure black (#000) - use #1a1a1a max
- No gradient text
- No custom cursors
- No purple-to-blue gradients
- No box-shadow abuse

### Typography
- No Inter font - use Outfit, Nunito, or system fonts
- No oversized H1s (>32px on desktop)
- No serif on dashboards
- Use tabular-nums for all numbers
- Line-height: 1.4-1.6 for body text

### Layout
- No 3-column equal card grids - use asymmetric layouts
- Pixel-perfect alignment required
- Max-width containers with breathing room
- Mobile-first with graceful degradation

### Content
- No "John Doe", no generic avatars
- No fake numbers - use real data
- No startup slop names

### External
- No Unsplash placeholders
- Production-ready only

## Design System Rules

### Color System
- Primary: Warm, accessible palette
- Accent: Subtle complementary colors
- Neutral: Soft grays, no harsh contrasts
- Status: Semantic colors for success/warning/error

### Spacing System
- Base unit: 8px
- Consistent gap ratios (1:2:4)
- Whitespace as a design element

### Animation Rules
- Easing: cubic-bezier(0.4, 0, 0.2, 1)
- Duration: 300-600ms for micro-interactions
- Purposeful animations only - no decoration for decoration's sake

### Card Design
- Glassmorphism with subtle blur
- Subtle shadows, no heavy lifts
- Hover states with gentle elevation
- Rounded corners: 12-16px

### Data Visualization
- Clean, readable charts
- Minimal grid lines
- Consistent color coding
- Interactive tooltips
