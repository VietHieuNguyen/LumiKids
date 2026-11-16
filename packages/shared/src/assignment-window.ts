/**
 * When an assigned game may be started (pure; used by the API and shown the same way on the web).
 * A session started inside the window may always be finished, even if the window closes meanwhile.
 */
export interface AssignmentWindow {
  status: "ACTIVE" | "CANCELLED";
  opensAt: Date;
  dueAt: Date | null;
}

export function assignmentState(
  assignment: AssignmentWindow,
  now: Date,
): "CANCELLED" | "UPCOMING" | "OPEN" | "CLOSED" {
  if (assignment.status === "CANCELLED") return "CANCELLED";
  if (now < assignment.opensAt) return "UPCOMING";
  if (assignment.dueAt && now > assignment.dueAt) return "CLOSED";
  return "OPEN";
}

/** The deadline that applies to one child: the later of the assignment deadline and the child's extension. */
export function playableUntil(assignment: AssignmentWindow, extendedUntil: Date | null): Date | null {
  if (!assignment.dueAt) return null;
  return extendedUntil && extendedUntil > assignment.dueAt ? extendedUntil : assignment.dueAt;
}

export function canStart(assignment: AssignmentWindow, extendedUntil: Date | null, now: Date): boolean {
  if (assignment.status !== "ACTIVE" || now < assignment.opensAt) return false;
  const until = playableUntil(assignment, extendedUntil);
  return until === null || now <= until;
}
