import { File } from 'expo-file-system';
import type { PhotoAttachmentQueue } from '@/services/database/PhotoAttachmentQueue';
import { debugLogger } from '@/utils/DebugLogger';
import type { DocumentationCategory } from '@/utils/equipmentCategories';
import {
  toQueueInputs,
  type ImportAssignment,
  type ImportCandidate,
  type PhotoJobContext
} from '@/utils/photoImport';

export const MAX_IMPORT_FILE_BYTES = 30 * 1024 * 1024;
export const MAX_IMPORT_FILE_MB = MAX_IMPORT_FILE_BYTES / (1024 * 1024);
const CHUNK_SIZE = 5;

export interface ImportProgress {
  done: number;
  total: number;
}

export interface ImportResult {
  savedIds: string[];
  tooLarge: number;
  failed: number;
}

interface ImportOptions {
  onProgress?: (progress: ImportProgress) => void;
  /** Turns a library reference (e.g. ph://) into a readable file before queueing. */
  resolveCandidate?: (candidate: ImportCandidate) => Promise<ImportCandidate>;
}

function readFileSize(candidate: ImportCandidate): number | null {
  if (candidate.fileSize) return candidate.fileSize;
  // Only file: URIs can be stat'd; anything else is sized by the prepare step.
  if (!candidate.uri.startsWith('file:')) return null;

  try {
    const file = new File(candidate.uri);
    return file.exists ? file.size ?? null : null;
  } catch {
    return null;
  }
}

/**
 * Queues photos in small chunks so a crash or kill mid-import keeps the
 * photos already saved. Oversized files are skipped and counted.
 */
export async function importAssignments(
  queue: Pick<PhotoAttachmentQueue, 'queuePhotos'>,
  assignments: readonly ImportAssignment[],
  ctx: PhotoJobContext,
  categories: readonly DocumentationCategory[],
  options: ImportOptions = {}
): Promise<ImportResult> {
  const result: ImportResult = { savedIds: [], tooLarge: 0, failed: 0 };
  const total = assignments.length;
  let done = 0;
  options.onProgress?.({ done, total });

  for (let start = 0; start < assignments.length; start += CHUNK_SIZE) {
    const chunk = assignments.slice(start, start + CHUNK_SIZE);
    const ready: ImportAssignment[] = [];

    for (const assignment of chunk) {
      try {
        const candidate = options.resolveCandidate
          ? await options.resolveCandidate(assignment.candidate)
          : assignment.candidate;
        const size = readFileSize(candidate);

        if (size !== null && size > MAX_IMPORT_FILE_BYTES) {
          result.tooLarge += 1;
          continue;
        }

        ready.push({ candidate: { ...candidate, fileSize: size }, target: assignment.target });
      } catch (error) {
        result.failed += 1;
        void debugLogger.info('PHOTO', 'Could not read photo for import', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    if (ready.length > 0) {
      try {
        const ids = await queue.queuePhotos(toQueueInputs(ready, ctx, categories));
        result.savedIds.push(...ids);
      } catch (error) {
        result.failed += ready.length;
        void debugLogger.info('PHOTO', 'Import chunk failed', {
          count: ready.length,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    done += chunk.length;
    options.onProgress?.({ done, total });
  }

  return result;
}

export function describeImportResult(result: ImportResult): { message: string; isError: boolean } {
  const saved = result.savedIds.length;
  const parts = [
    saved > 0
      ? `Added ${saved} photo${saved === 1 ? '' : 's'} – uploading in background`
      : 'No photos were added'
  ];
  if (result.tooLarge > 0) {
    parts.push(`${result.tooLarge} over ${MAX_IMPORT_FILE_MB}MB skipped`);
  }
  if (result.failed > 0) {
    parts.push(`${result.failed} couldn't be read`);
  }
  return { message: parts.join(' · '), isError: saved === 0 };
}
