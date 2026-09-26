// Task ids are UUID v4 strings (src/escalation.ts randomUUID). A Convex id is not one.

const TASK_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isWellFormedTaskId(taskId: string): boolean {
  return TASK_ID.test(taskId);
}
