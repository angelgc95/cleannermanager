export interface CleanerAssignmentRule {
  cleaner_user_id: string;
  listing_id?: string | null;
  assignment_weekdays?: number[] | null;
  created_at?: string | null;
}

export function normalizeAssignmentWeekdays(value: unknown): number[] {
  if (!Array.isArray(value)) return [];

  return [...new Set(
    value
      .map((day) => Number(day))
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
  )].sort((a, b) => a - b);
}

export function getAssignmentWeekday(value: string | Date | null | undefined): number | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.getDay();
  }

  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))).getUTCDay();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getDay();
}

function sortedAssignments<T extends CleanerAssignmentRule>(assignments: T[]) {
  return assignments
    .map((assignment, index) => {
      const time = assignment.created_at ? new Date(assignment.created_at).getTime() : NaN;
      return {
        assignment,
        index,
        order: Number.isFinite(time) ? time : index,
      };
    })
    .sort((left, right) => left.order - right.order || left.index - right.index)
    .map(({ assignment }) => assignment);
}

export function resolveCleanerAssignment<T extends CleanerAssignmentRule>(
  assignments: T[],
  eventDate: string | Date | null | undefined,
): T | null {
  const orderedAssignments = sortedAssignments(assignments);
  if (orderedAssignments.length === 0) return null;

  const weekday = getAssignmentWeekday(eventDate);
  if (weekday !== null) {
    const dayMatch = orderedAssignments.find((assignment) =>
      normalizeAssignmentWeekdays(assignment.assignment_weekdays).includes(weekday)
    );
    if (dayMatch) return dayMatch;
  }

  return orderedAssignments.find((assignment) => normalizeAssignmentWeekdays(assignment.assignment_weekdays).length === 0) ?? null;
}
