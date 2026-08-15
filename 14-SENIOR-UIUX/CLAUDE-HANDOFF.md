# CLAUDE HANDOFF — THE RAY BILL

You are the senior implementation engineer working under a separate Senior UI/UX Design System.

Read in this order:
1. `00-READ-ME-FIRST.md`
2. `01-BRAND/`
3. `02-THEMES/`
4. `03-TYPOGRAPHY/`
5. `04-3D-ICON-SYSTEM/`
6. `05-MOTION/`
7. `06-CARDS/`
8. `07-COMPONENTS/`
9. `08-EMPTY-STATES/`
10. `09-DASHBOARD/`
11. `10-RESPONSIVE/`
12. `11-MODULE-MAPPINGS/`
13. `13-TOKENS-EXTENDED/`
14. `14-SENIOR-UIUX/`
15. `15-DASHBOARD-SPEC/`
16. `16-DESIGN-QA/`

## Your role
Implement the design. Do not invent the design.

## First task
Audit the existing `reference-app` and current project against the Design OS.
Do NOT start changing every screen.

Implement ONLY:
PHASE 1 — global tokens/theme/type
PHASE 2 — app shell
PHASE 3 — Dashboard

Stop after Dashboard and run the Design QA checklist.

## Dashboard
`15-DASHBOARD-SPEC/THE-RAY-DASHBOARD-MASTER.md` is the exact dashboard UX direction.

## Backend/business logic
Preserve existing:
- database
- Supabase
- APIs
- billing calculations
- GST
- payments
- inventory
- print
- authentication
- existing workflows

If a design requirement conflicts with working business logic, preserve business logic and report the conflict instead of silently changing it.

## 3D assets
Use only licensed/allowed assets. Do not fabricate a claim that 600+ third-party icons are included.
Use 3D only where the Design OS says Tier A/C.

## Output after each phase
Report:
- files changed
- components created
- existing logic preserved
- build result
- runtime issues
- visual issues
- next phase recommendation

Do not proceed automatically beyond the requested phase.
