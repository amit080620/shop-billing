# MOTION SYSTEM

Motion should communicate state, not decorate every interaction.

## Timing
- Tap feedback: 120–180ms
- Hover: 160–220ms
- Small action: 300–550ms
- Success: 500–800ms
- Major empty-state entrance: 500–900ms
- Printing/payment/order sequences: 900–1400ms total

## Easing
Use cubic-bezier(.22,1,.36,1) for entrances and tactile movement.

## Required action sequences
PRINT:
idle printer → paper starts → paper advances → bill complete → success check → settle

PAYMENT:
card/wallet appears → transaction pulse → confirmation → success

ORDER:
cart/product → order placed → confirmation

STOCK IN:
box arrives → opens → quantity confirmation

STOCK OUT:
box opens → item leaves → quantity confirmation

SAVE:
save icon press → compact check → toast

DELETE:
item compresses/fades → confirmation toast

SYNC:
rotate only while actual sync is running → settle

ERROR:
short shake/pulse → error message; never loop forever

## Rules
- Never delay a real API operation until animation ends.
- Never use infinite animation except active loading/sync.
- Respect prefers-reduced-motion.
