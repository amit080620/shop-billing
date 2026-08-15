# THE RAY BILL — MASTER UI/UX IMPLEMENTATION PROMPT

You are the implementation engineer, NOT the visual designer.

The attached Design OS is the source of truth. Do not invent a new visual language.

## FIRST
1. Read every file under `01-BRAND` through `11-MODULE-MAPPINGS`.
2. Inspect the existing application under `reference-app`.
3. Identify the existing theme provider, Tailwind tokens, component library, routes, APIs and business logic.
4. Produce a short implementation plan before editing code.

## NON-NEGOTIABLE
- Preserve 100% of business logic.
- Do not change database schema unless explicitly required.
- Do not change billing/GST/payment/print/inventory calculations.
- Do not replace working APIs.
- Do not introduce random icon libraries.
- Do not use saturated #0427F3 as large backgrounds.
- Do not mix flat, outline, emoji and unrelated 3D icon styles.
- Do not create one-off visual components when a Ray component exists.
- Light and dark must both be designed intentionally.
- Respect reduced motion.

## VISUAL GOAL
The Ray should feel like a premium business operating system:
calm dark/light surfaces + restrained blue/purple/magenta accents + tactile 3D business objects + purposeful micro-motion + excellent typography.

## ICON STRATEGY
Tier A: 3D business objects.
Tier B: clean 2D utility icons.
Tier C: large 3D empty-state illustrations.

Use the existing app's icon assets where they match. If an asset is not available, create a clearly named placeholder mapping rather than silently substituting a random icon.

## CARD STRATEGY
Use the Ray card system. Cards should have depth, not just borders.
Use subtle gradients, inner highlights and shadows. Keep dense data calm.

## MOTION
Use motion only when it communicates:
press, progress, success, error, state change, navigation or loading.
Never block business operations with animation.

## ROLLOUT
Do not redesign everything at once.

Phase 1: global tokens + typography + theme
Phase 2: shell/sidebar/topbar
Phase 3: dashboard
Phase 4: billing/print
Phase 5: products/inventory
Phase 6: customers/vendors
Phase 7: payments/GST/reports
Phase 8: restaurant/KDS
Phase 9: pharmacy/clinic/gym/service modules
Phase 10: mobile + TV/KDS polish

After each phase:
- run build
- fix TypeScript/runtime errors
- verify light/dark
- verify mobile
- verify existing business flows
- show changed files and what was preserved

Never proceed to the next phase if the previous phase has a regression.


## EXTENDED TOKEN RULE
Before implementing any component, read `13-TOKENS-EXTENDED/`.
Do not invent:
- spacing
- radius
- shadow/elevation
- breakpoints
- z-index
- print dimensions
- Hindi typography
- component states

Use the exact tokens/specifications.

## PRINT RULE
Billing print output is a separate product surface. Inspect existing print code first. Support thermal 58mm, thermal 80mm and A4 without changing billing calculations.

## QUALITY GATE
A phase is not complete until:
- visual tokens are used instead of arbitrary values
- no saturated-blue overload exists
- cards have consistent depth
- icons belong to the correct Tier A/B/C family
- light and dark are both checked
- Hindi/English mixed text is checked
- print output is checked where relevant
- mobile and desktop are checked
- build and runtime console are clean
