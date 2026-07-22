# Antigravity Agent Guidelines

## 1. Karpathy-Inspired Coding Guidelines

### Think Before Coding
*Don't assume. Don't hide confusion. Surface tradeoffs.*
Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### Simplicity First
*Minimum code that solves the problem. Nothing speculative.*
- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.
Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### Surgical Changes
*Touch only what you must. Clean up only your own mess.*
When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.
When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.
The test: Every changed line should trace directly to the user's request.

### Goal-Driven Execution
*Define success criteria. Loop until verified.*
Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"
For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```
Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

## 2. Next.js 16 & Website Reverse-Engineering Guidelines

### This is NOT the Next.js you know
This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

### Website Reverse-Engineer & Emulation Principles
- **Pixel-perfect emulation** — match the target's spacing, colors, typography exactly.
- **No personal aesthetic changes during emulation phase** — match 1:1 first, customize later.
- **Real content** — use actual text and assets from the target site, not placeholders.
- **Beauty-first** — every pixel matters.
- **Tailwind v4** — use Tailwind CSS v4 with oklch design tokens.
- **Code Style** — TypeScript strict mode, no `any`, PascalCase components, camelCase utils.

### Emulation/Cloning Phases
- **Phase 1: Visual Audit** — capture colors, typography, spacing scales, border radii, shadows, and hover/active states.
- **Phase 2: Component Inventory** — analyze structure, variants, loading skeletons, responsive behavior, and transition animations.
- **Phase 3: Layout Architecture** — map CSS grid/flexbox, columns, sticking elements, and scroll behavior.
- **Phase 4: Technical Stack Analysis** — verify CDN, image loading strategy, and state management.
