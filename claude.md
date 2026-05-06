## Code Quality & Architecture

- Write clean, readable, and maintainable code at all times — clarity beats cleverness.
- Follow SOLID principles strictly:
  - **S** — Each file/class/function has one clear responsibility.
  - **O** — Extend behavior without modifying existing, working code.
  - **L** — Subtypes must be substitutable for their base types.
  - **I** — Prefer small, focused interfaces over large, general-purpose ones.
  - **D** — Depend on abstractions, not concrete implementations.

## Dependencies

- Introduce a library when it meaningfully reduces complexity or risk — don't reinvent the wheel.
- Choose the library that best fits the app's existing ecosystem (size, maintenance status, community, license, TypeScript support).
- Prefer well-maintained, widely adopted packages over niche alternatives unless there's a strong reason.
- Always check if a suitable library is already installed before adding a new one.

## Simplicity

- Default to the simplest solution that correctly solves the problem — avoid over-engineering.
- If a piece of logic feels complex, stop and rethink. There is almost always a simpler path.
- Avoid premature abstraction — only generalize when a pattern clearly repeats.
- Write code that a new team member could understand without needing an explanation.

## Consistency

- Before implementing anything, scan the surrounding codebase to understand existing patterns, naming conventions, and structure.
- Match what's already there — file organization, function style, error handling, state management, etc.
- When in doubt, be consistent with the existing code over following a personal preference.
- If an existing pattern appears to be an anti-pattern, flag it with a comment rather than silently diverging from it.

## Plan.md

- when a new feature is introduced, update plan.md file if need to be reflected with the current implementation of the app.