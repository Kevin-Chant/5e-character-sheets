import Modal from "src/components/modal";
import SharingToggle from "src/components/sharing-toggle";
import DriveShareControls from "src/components/drive-share-controls";

interface ShareModalProps {
  onClose: () => void;
}

// Every way of sharing a character in one dialog; each section self-hides
// when not applicable.
export default function ShareModal({ onClose }: ShareModalProps) {
  return (
    <Modal title="Share character" onClose={onClose}>
      <p className="text-muted">
        Share a live, co-editable session, or grant someone access to your saved
        character.
      </p>
      <SharingToggle />
      <DriveShareControls />
    </Modal>
  );
}
