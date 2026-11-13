# Simulation Engine

TypeScript-based, deterministic browser simulation layer for **non-Kali** educational content:
interactive quizzes, packet and topology diagrams, decision-tree exercises and similar material.
Not implemented yet.

## Relationship to practical laboratories

The original plan to simulate Kali Linux inside the browser is **superseded**. Students now use a
real Kali Linux installation on their college laboratory computers (dual boot), and CyberLab Academy
manages challenge assignments, verification, scoring and reporting. See:

- [`docs/CYBERLAB_MILESTONE_03_ARCHITECTURE.md`](../docs/CYBERLAB_MILESTONE_03_ARCHITECTURE.md)
- [`docs/CYBERLAB_PRACTICAL_LAB_SECURITY.md`](../docs/CYBERLAB_PRACTICAL_LAB_SECURITY.md)
- [`docs/CYBERLAB_MILESTONE_03_ROADMAP.md`](../docs/CYBERLAB_MILESTONE_03_ROADMAP.md)

This directory is **not** a challenge execution runtime, verifier, grader or terminal host. It must
never be used to fake practical Kali work, hold verification flags, or claim a student completed a
laboratory exercise.

Useful simulation concepts unrelated to Kali (for example guided network diagrams, protocol
walkthroughs and knowledge checks) remain valid future work.

No real external targets, no attack traffic and no production-network access may originate here.
