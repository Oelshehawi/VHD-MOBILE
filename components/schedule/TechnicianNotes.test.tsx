import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Text, TextInput, TouchableOpacity } from 'react-native';
import { usePowerSync } from '@powersync/react-native';
import { ConfirmationModal } from '@/components/common/ConfirmationModal';
import { readTrackingReadiness, type TrackingReadiness } from '@/services/location/TrackingReadiness';
import { TechnicianNotes } from './TechnicianNotes';

const { act, create } = require('react-test-renderer');

jest.mock('@powersync/react-native', () => ({ usePowerSync: jest.fn() }));
jest.mock('@/services/location/TrackingReadiness', () => ({ readTrackingReadiness: jest.fn() }));
jest.mock('@/components/common/ConfirmationModal', () => ({ ConfirmationModal: () => null }));

beforeEach(() => { jest.clearAllMocks(); });

describe('technician notes without location readiness', () => {
  it.each(['granted', 'foreground-denied', 'unavailable'] as const)(
    'saves notes with %s location permission and unknown native diagnostics', async kind => {
      const readiness: TrackingReadiness = {
        permission: kind === 'foreground-denied' ? { kind, canAskAgain: false } : { kind },
        accuracyAuthorization: 'unknown',
        backgroundRefresh: 'unknown',
        batteryRestricted: null,
        lowPowerMode: null,
        observedAt: '2026-09-21T17:00:00.000Z'
      };
      jest.mocked(readTrackingReadiness).mockResolvedValue(readiness);
      const execute = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
      jest.mocked(usePowerSync).mockReturnValue({ execute } as unknown as ReturnType<typeof usePowerSync>);

      let renderer: ReturnType<typeof create>;
      const pressButton = async (label: string) => {
        const button = renderer.root.findAllByType(TouchableOpacity).find(
          (node: { findAllByType: (type: typeof Text) => { props: { children: unknown } }[] }) =>
            node.findAllByType(Text).some(text => text.props.children === label)
        );
        expect(button).toBeDefined();
        await act(async () => { await button.props.onPress(); });
      };

      try {
        await act(async () => {
          renderer = create(<TechnicianNotes scheduleId='schedule-id'
            schedule={{ id: 'schedule-id', technicianNotes: 'Existing note' }} />);
        });
        await pressButton('Edit');
        await act(async () => {
          renderer.root.findByType(TextInput).props.onChangeText('Work completed; rear access locked.');
        });
        await pressButton('Save');

        expect(execute).toHaveBeenCalledWith('UPDATE schedules SET technicianNotes = ? WHERE id = ?',
          ['Work completed; rear access locked.', 'schedule-id']);
        expect(renderer.root.findByType(ConfirmationModal).props.visible).toBe(true);
        expect(readTrackingReadiness).not.toHaveBeenCalled();
      } finally {
        await act(async () => { renderer?.unmount(); });
      }
    }
  );
});
