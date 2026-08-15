# Component State Matrix

Every interactive component must define:
default / hover / focus-visible / active / disabled / loading / error / success where applicable.

## Button
Default: brand gradient primary or neutral secondary
Hover: lift 1px + shadow level 2
Active: translateY(1px), scale(.985)
Focus: 2px accessible ring
Disabled: 50% opacity, no lift
Loading: preserve width, show spinner, prevent duplicate action
Success: short success motion then settle

## Input
Default / hover / focus-visible / disabled / error / success.
Focus ring uses brand purple with low opacity.
Error uses semantic red, not brand blue.

## Card
Default / hover for interactive cards only / selected / disabled.
Do not animate static cards.

## Modal / Drawer
Enter / open / closing states; backdrop opacity; focus trap.
No layout jump.

## Toast
Info / success / warning / error.
Auto-dismiss only for non-critical messages.

## Table
Row hover / selected / loading / empty / error.
