import { useCallback, useMemo } from 'react';
import { useQuery, usePowerSync } from '@powersync/react-native';
import { objectIdFromKey } from '@/utils/objectId';
import {
  COURSE_CATALOG,
  getCourse,
  type CourseDefinition,
  type CourseSectionDefinition
} from '@/services/courses/catalog';

// Raw rows as stored locally (arrays are JSON strings — see schema.ts).
interface CourseAssignmentRow {
  id: string;
  courseSlug: string;
  clerkUserId: string;
  assignedByUserId: string;
  assignedAt: string;
  status: string;
}

interface CourseProgressRow {
  id: string;
  courseSlug: string;
  clerkUserId: string;
  completedSectionIds: string | null;
  lastSectionId: string | null;
  lastVisitedAt: string | null;
  completedAt: string | null;
}

export interface ParsedCourseProgress {
  completedSectionIds: string[];
  lastSectionId: string | null;
  lastVisitedAt: string | null;
  completedAt: string | null;
}

export interface AssignedCourse {
  course: CourseDefinition;
  status: string;
  assignedAt: string;
  progress: ParsedCourseProgress;
  completedCount: number;
  totalSections: number;
  completionPercent: number;
}

function parseSectionIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((s): s is string => typeof s === 'string')
      : [];
  } catch {
    return [];
  }
}

function emptyProgress(): ParsedCourseProgress {
  return {
    completedSectionIds: [],
    lastSectionId: null,
    lastVisitedAt: null,
    completedAt: null
  };
}

function toParsedProgress(row?: CourseProgressRow): ParsedCourseProgress {
  if (!row) return emptyProgress();
  return {
    completedSectionIds: parseSectionIds(row.completedSectionIds),
    lastSectionId: row.lastSectionId,
    lastVisitedAt: row.lastVisitedAt,
    completedAt: row.completedAt
  };
}

/**
 * Courses assigned to the signed-in user, joined in JS with the bundled
 * catalog and their local progress. Mirrors services/data/schedules.ts.
 */
export function useAssignedCourses(userId: string | null | undefined) {
  const { data: assignments = [], isLoading: assignmentsLoading } =
    useQuery<CourseAssignmentRow>(
      userId
        ? `SELECT * FROM courseassignments WHERE clerkUserId = ? ORDER BY assignedAt DESC`
        : `SELECT * FROM courseassignments WHERE 0`,
      [userId ?? '']
    );

  const { data: progressRows = [], isLoading: progressLoading } =
    useQuery<CourseProgressRow>(
      userId
        ? `SELECT * FROM courseprogress WHERE clerkUserId = ?`
        : `SELECT * FROM courseprogress WHERE 0`,
      [userId ?? '']
    );

  const assignedCourses = useMemo<AssignedCourse[]>(() => {
    const progressBySlug = new Map(
      progressRows.map((row) => [row.courseSlug, row])
    );

    return assignments
      .map((assignment) => {
        const course = getCourse(assignment.courseSlug);
        if (!course) return null;
        const progress = toParsedProgress(progressBySlug.get(course.slug));
        const totalSections = course.sections.length;
        // Count only catalog-valid section ids (deduped). Guards a stale/legacy
        // row with duplicate or unknown ids from displaying > total / > 100%.
        const catalogSectionIds = new Set(
          course.sections.map((s) => s.sectionId)
        );
        const completedCount = new Set(
          progress.completedSectionIds.filter((id) => catalogSectionIds.has(id))
        ).size;
        return {
          course,
          status: assignment.status,
          assignedAt: assignment.assignedAt,
          progress,
          completedCount,
          totalSections,
          completionPercent:
            totalSections > 0
              ? Math.min(100, Math.round((completedCount / totalSections) * 100))
              : 0
        } satisfies AssignedCourse;
      })
      .filter((c): c is AssignedCourse => c !== null);
  }, [assignments, progressRows]);

  return {
    assignedCourses,
    isLoading: assignmentsLoading || progressLoading
  };
}

/** Course + parsed progress for a single course (returns null if not assigned). */
export function useAssignedCourse(
  userId: string | null | undefined,
  courseSlug: string
) {
  const { assignedCourses, isLoading } = useAssignedCourses(userId);
  const assigned = assignedCourses.find((c) => c.course.slug === courseSlug);
  return { assigned: assigned ?? null, isLoading };
}

/**
 * Section accessibility: a section is locked until its prerequisite is
 * completed. The first section is always accessible.
 */
export function isSectionAccessible(
  section: CourseSectionDefinition,
  completedSectionIds: string[]
): boolean {
  if (!section.prerequisiteSectionId) return true;
  return completedSectionIds.includes(section.prerequisiteSectionId);
}

/**
 * Local writes that PowerSync pushes to /api/sync → courseprogress.handler.
 * One row per (clerkUserId, courseSlug); we upsert client-side too.
 */
export function useCourseProgressMutations(
  userId: string | null | undefined
) {
  const powerSync = usePowerSync();

  const writeProgress = useCallback(
    async (courseSlug: string, next: Partial<ParsedCourseProgress>) => {
      if (!userId) return;

      const existing = await powerSync.getOptional<CourseProgressRow>(
        `SELECT * FROM courseprogress WHERE clerkUserId = ? AND courseSlug = ?`,
        [userId, courseSlug]
      );

      const current = toParsedProgress(existing ?? undefined);
      const merged: ParsedCourseProgress = {
        completedSectionIds:
          next.completedSectionIds ?? current.completedSectionIds,
        lastSectionId:
          next.lastSectionId !== undefined
            ? next.lastSectionId
            : current.lastSectionId,
        lastVisitedAt:
          next.lastVisitedAt !== undefined
            ? next.lastVisitedAt
            : current.lastVisitedAt,
        completedAt:
          next.completedAt !== undefined
            ? next.completedAt
            : current.completedAt
      };

      const sectionsJson = JSON.stringify(merged.completedSectionIds);

      if (existing) {
        await powerSync.execute(
          `UPDATE courseprogress
              SET completedSectionIds = ?, lastSectionId = ?, lastVisitedAt = ?, completedAt = ?
            WHERE id = ?`,
          [
            sectionsJson,
            merged.lastSectionId,
            merged.lastVisitedAt,
            merged.completedAt,
            existing.id
          ]
        );
      } else {
        await powerSync.execute(
          `INSERT INTO courseprogress (id, courseSlug, clerkUserId, completedSectionIds, lastSectionId, lastVisitedAt, completedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            // Deterministic id per (user, course): the singleton progress row
            // always maps to the same `_id`, so a missing-local-row INSERT (cache
            // cleared, second device, not-yet-synced) reuses the id the server
            // already has → the backend upsert-by-_id becomes an update, never an
            // E11000 against the unique {clerkUserId, courseSlug} index.
            objectIdFromKey(`${userId}:${courseSlug}`),
            courseSlug,
            userId,
            sectionsJson,
            merged.lastSectionId,
            merged.lastVisitedAt,
            merged.completedAt
          ]
        );
      }
    },
    [powerSync, userId]
  );

  const markSectionVisited = useCallback(
    async (courseSlug: string, sectionId: string) => {
      await writeProgress(courseSlug, {
        lastSectionId: sectionId,
        lastVisitedAt: new Date().toISOString()
      });
    },
    [writeProgress]
  );

  const markSectionComplete = useCallback(
    async (courseSlug: string, sectionId: string) => {
      if (!userId) return;
      const existing = await powerSync.getOptional<CourseProgressRow>(
        `SELECT * FROM courseprogress WHERE clerkUserId = ? AND courseSlug = ?`,
        [userId, courseSlug]
      );
      const completed = new Set(
        parseSectionIds(existing?.completedSectionIds)
      );
      completed.add(sectionId);
      const completedSectionIds = Array.from(completed);

      const course = getCourse(courseSlug);
      const isCourseComplete =
        !!course && completedSectionIds.length >= course.sections.length;

      await writeProgress(courseSlug, {
        completedSectionIds,
        lastSectionId: sectionId,
        lastVisitedAt: new Date().toISOString(),
        completedAt: isCourseComplete ? new Date().toISOString() : null
      });
    },
    [powerSync, userId, writeProgress]
  );

  return { markSectionVisited, markSectionComplete };
}

export { COURSE_CATALOG };
