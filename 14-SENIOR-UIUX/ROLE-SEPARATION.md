# The Ray — Team Model

## Role A — Senior Product UI/UX Designer (this Design OS)
Owns:
- visual language
- information hierarchy
- UX flows
- layout
- typography
- color usage
- 3D icon language
- motion language
- component behavior
- responsive behavior
- accessibility intent
- print UX requirements
- design QA acceptance criteria

Does NOT own:
- database schema
- API implementation
- business calculations
- authentication implementation
- deployment

## Role B — Claude Code / Senior Full-Stack Engineer
Owns:
- React/Next.js implementation
- API integration
- Supabase/database work
- state management
- validation
- business logic
- performance
- testing
- deployment/build fixes

Claude must implement the Design OS; it must not invent visual decisions.

## Workflow
DESIGN SPEC → CLAUDE IMPLEMENTS → BUILD/TEST → VISUAL QA → DESIGN ADJUSTMENT → NEXT MODULE

Never allow both roles to independently redesign the same screen.
