import { useState } from 'react';
import { Modal } from 'react-native';
import { CameraCaptureScreen } from './CameraCaptureScreen';
import { PhotoReviewScreen } from './PhotoReviewScreen';

interface CameraCaptureModalProps {
  visible: boolean;
  onClose: () => void;
  onPhotosConfirmed: (photoUris: string[]) => void;
  type: 'before' | 'after';
}

export function CameraCaptureModal({
  visible,
  onClose,
  onPhotosConfirmed,
  type,
}: CameraCaptureModalProps) {
  const [capturedPhotos, setCapturedPhotos] = useState<string[]>([]);
  const [showReview, setShowReview] = useState(false);

  const handlePhotoCaptured = (uri: string) => {
    setCapturedPhotos((prev) => [...prev, uri]);
  };

  const handleDone = () => {
    if (capturedPhotos.length === 0) {
      // No photos captured, close modal directly
      handleClose();
    } else {
      // Show review screen
      setShowReview(true);
    }
  };

  const handleUpload = (photoUris: string[]) => {
    onPhotosConfirmed(photoUris);
    handleClose();
  };

  const handleCancel = () => {
    handleClose();
  };

  const handleClose = () => {
    // Reset state
    setCapturedPhotos([]);
    setShowReview(false);
    onClose();
  };

  const handleDeletePhoto = (index: number) => {
    setCapturedPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <Modal
      visible={visible}
      onRequestClose={handleClose}
      presentationStyle="fullScreen"
      animationType="slide"
    >
      {!showReview ? (
        <CameraCaptureScreen
          onPhotoCaptured={handlePhotoCaptured}
          capturedCount={capturedPhotos.length}
          onDone={handleDone}
          onClose={handleClose}
          type={type}
        />
      ) : (
        <PhotoReviewScreen
          photos={capturedPhotos}
          onUpload={handleUpload}
          onCancel={handleCancel}
          onDeletePhoto={handleDeletePhoto}
          type={type}
        />
      )}
    </Modal>
  );
}
