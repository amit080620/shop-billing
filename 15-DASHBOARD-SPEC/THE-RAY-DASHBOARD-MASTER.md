# THE RAY DASHBOARD — MASTER SCREEN SPEC

## Product goal
The Dashboard is the command center for a business owner/operator. It should answer in 5 seconds:
1. How much did I sell?
2. What needs attention?
3. What happened recently?
4. What should I do next?

## Visual composition

### Global shell
Desktop:
- left sidebar 248px expanded / 76px collapsed
- topbar 64px
- content max width 1440px
- page padding 24–40px
Mobile:
- topbar 56px
- bottom navigation for primary modules where appropriate
- page padding 16px

### Header
Left:
- greeting / business name
- short contextual line

Right:
- date range
- notifications
- global search
- primary `New Bill` CTA

Do not put 5 competing CTAs in the header.

## KPI row

4 cards on desktop:
1. Today's Sales
2. Bills
3. Customers
4. Low Stock / Outstanding (contextual)

Card anatomy:
- 20–24px padding
- 18px radius
- 3D business icon 44–52px
- label 12–13px
- value 28–32px bold
- delta 12px
- tiny supporting text
- optional mini sparkline

3D icon sits inside a soft radial/gradient glow, NOT a solid saturated blue circle.

## Main analytics

### Sales Trend card
Desktop: 2/3 width.
- 7D / 30D / 90D segmented control
- headline total
- comparison delta
- smooth area/line chart
- neutral grid
- one restrained brand-gradient accent
- tooltip on hover
- no neon chart fill

Dark:
- chart area remains low-contrast
- line is bright enough for readability
- grid is subtle
- avoid blue-on-black glare

Light:
- chart line uses brand accent
- fill is 6–10% opacity

## Attention panel
1/3 width:
- Low stock
- unpaid/credit
- pending orders
- expiring medicine (if pharmacy)
Each item has:
3D/2.5D contextual icon + severity + count + action.

## Quick Actions
Use 6–8 actions max:
New Bill
Add Product
Add Customer
Purchase Stock
View Orders
Payments
Reports
Scan Barcode

Each quick action:
- 48–56px 3D icon
- title
- optional shortcut
- subtle hover lift
- no giant gradient blocks

## Recent activity
Two-column desktop:
- Recent Bills
- Recent Orders/Payments

Use compact rows, not oversized cards.

Row:
icon/avatar → title → metadata → amount/status → action.

## Bottom insight area
Optional:
- top products
- sales by category
- payment split
- stock alerts

Do not show every chart simultaneously. Use progressive disclosure.

## Dark-mode acceptance
The dashboard must NOT feel blue.
Target visual ratio:
~70% neutral surfaces
~20% content/semantic colors
~10% brand gradient/accent

## 3D acceptance
3D is visible but not everywhere:
- KPI icons
- quick action icons
- attention/empty-state illustrations
- major success states

Tiny table controls remain 2D.

## Motion acceptance
Dashboard entrance:
- stagger sections 40–60ms
- total perceived entrance <700ms

KPI:
- number count-up only on first meaningful load, not every refresh

Chart:
- draw-in once
- no continuous movement

Quick action:
- hover lift 2px
- press scale .985

Notifications:
- short pop, never bounce continuously

## States
Loading:
use skeleton cards and chart skeleton.

Empty:
large 3D illustration + one CTA.

Error:
compact error state + retry.

Offline:
persistent but calm status bar; don't block cached data.

## Mobile
Order:
Header → primary action → KPI carousel → attention → sales chart → quick actions → recent activity.

KPI cards become horizontal snap cards.
Charts use 280–320px height.
Quick actions become 2-column grid.
Recent tables become compact cards.

## TV/KDS
At >=1920px:
- larger type
- larger cards
- fewer controls
- high contrast
- optional auto-refresh only where business logic supports it.
