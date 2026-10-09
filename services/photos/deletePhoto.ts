import type { AbstractPowerSyncDatabase } from '@powersync/react-native';
import type { AttachmentRecord } from '@powersync/attachments';
import type { PhotoAttachmentQueue } from '@/services/database/PhotoAttachmentQueue';

/** Deletes a photo row and its attachment (local file + queue record) in one transaction. */
export async function deletePhotoWithAttachment(
  powerSync: Pick<AbstractPowerSyncDatabase, 'writeTransaction'>,
  queue: Pick<PhotoAttachmentQueue, 'delete'> | null | undefined,
  photoId: string
): Promise<void> {
  await powerSync.writeTransaction(async (tx) => {
    await tx.execute(`DELETE FROM photos WHERE id = ?`, [photoId]);

    if (queue) {
      const attachments = await tx.getAll<AttachmentRecord>(
        `SELECT * FROM attachments WHERE id = ?`,
        [photoId]
      );

      if (attachments.length > 0) {
        await queue.delete(attachments[0], tx);
      }
    }
  });
}
