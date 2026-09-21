import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Alert } from 'react-native';
import { usePowerSync, useQuery } from '@powersync/react-native';
import { useSystem } from '@/services/database/System';
import { readTrackingReadiness } from '@/services/location/TrackingReadiness';
import { PhotoCapture } from './PhotoCapture';
import { PhotoGrid } from './PhotoGrid';
import { DeletePhotoModal } from './DeletePhotoModal';

const { act, create } = require('react-test-renderer');

jest.mock('@powersync/react-native', () => ({ usePowerSync: jest.fn(), useQuery: jest.fn() }));
jest.mock('@/services/database/System', () => ({ useSystem: jest.fn() }));
jest.mock('@/services/location/TrackingReadiness', () => ({ readTrackingReadiness: jest.fn() }));
jest.mock('expo-image-picker', () => ({}));
jest.mock('expo-image-manipulator', () => ({}));
jest.mock('expo-file-system', () => ({}));
jest.mock('@expo/vector-icons/Ionicons', () => 'Ionicons');
jest.mock('./PhotoGrid', () => ({ PhotoGrid: jest.fn(() => null) }));
jest.mock('./PhotoCaptureModal', () => ({ PhotoCaptureModal: () => null }));
jest.mock('./CameraCaptureModal', () => ({ CameraCaptureModal: () => null }));
jest.mock('./DeletePhotoModal', () => ({ DeletePhotoModal: jest.fn(() => null) }));
jest.mock('./LoadingModal', () => ({ LoadingModal: () => null }));
jest.mock('@/components/common/FastImageViewer', () => ({ FastImageViewer: () => null }));

beforeEach(() => { jest.clearAllMocks(); });

describe('photo deletion without location readiness', () => {
  it.each(['Location permission denied', 'Location settings unavailable'])(
    'deletes the photo and attachment when %s', async problem => {
      jest.mocked(readTrackingReadiness).mockRejectedValue(new Error(problem));
      const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
      const attachment = { id: 'photo-id' };
      const tx = {
        execute: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
        getAll: jest.fn<() => Promise<unknown[]>>().mockResolvedValue([attachment])
      };
      const deleteAttachment = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      jest.mocked(usePowerSync).mockReturnValue({
        writeTransaction: async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx)
      } as unknown as ReturnType<typeof usePowerSync>);
      jest.mocked(useQuery).mockReturnValue({ data: [], isLoading: false } as unknown as ReturnType<typeof useQuery>);
      jest.mocked(useSystem).mockReturnValue({
        attachmentQueue: { delete: deleteAttachment }
      } as unknown as ReturnType<typeof useSystem>);

      let renderer: ReturnType<typeof create>;
      try {
        await act(async () => {
          renderer = create(<PhotoCapture technicianId='technician-id' type='before'
            scheduleId='schedule-id' jobTitle='Test job' scheduledStartAtUtc='2026-09-21T17:00:00.000Z' />);
        });
        await act(async () => {
          renderer.root.findByType(PhotoGrid).props.onDeletePhoto('photo-id');
        });
        await act(async () => {
          await renderer.root.findByType(DeletePhotoModal).props.onConfirm();
        });

        expect(tx.execute).toHaveBeenCalledWith('DELETE FROM photos WHERE id = ?', ['photo-id']);
        expect(deleteAttachment).toHaveBeenCalledWith(attachment, tx);
        expect(renderer.root.findAllByType(DeletePhotoModal)).toHaveLength(0);
        expect(readTrackingReadiness).not.toHaveBeenCalled();
      } finally {
        await act(async () => { renderer?.unmount(); });
        alert.mockRestore();
      }
    }
  );
});
