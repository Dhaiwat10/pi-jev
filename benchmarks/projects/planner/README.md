# Dependency planner

Implement `plan(tasks, maxParallel)` in `src/planner.js`.

Each task has an `id`, `dependencies`, and integer `priority`. Return an array of
batches, where every batch is an array of task IDs.

Requirements:

- Reject duplicate or empty IDs.
- Reject missing dependencies and self-dependencies.
- Reject cycles with an error containing `cycle` and at least one cycle member.
- `maxParallel` must be a positive integer.
- A task can run only after all dependencies completed in earlier batches.
- Choose up to `maxParallel` currently ready tasks per batch.
- Ready tasks are ordered by descending priority, then lexicographic ID.
- Do not mutate the input tasks or dependency arrays.
- Empty input returns an empty plan.
