export function plan(tasks, maxParallel) {
  // BUG: this only sorts once, ignores validation, and permits a task in the
  // same batch as its dependency.
  const pending = [...tasks].sort((a, b) => b.priority - a.priority);
  const completed = new Set();
  const batches = [];

  while (pending.length > 0) {
    const batch = [];
    for (let index = 0; index < pending.length && batch.length < maxParallel;) {
      const task = pending[index];
      if (task.dependencies.every((dependency) => completed.has(dependency) || batch.includes(dependency))) {
        batch.push(task.id);
        pending.splice(index, 1);
      } else {
        index += 1;
      }
    }
    if (batch.length === 0) break;
    batch.forEach((id) => completed.add(id));
    batches.push(batch);
  }
  return batches;
}
