import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaCopy } from "react-icons/fa6";
import { copyToClipboard } from "src/lib/browser";
import { useEncounter } from "src/lib/hooks/use-encounter";
import { useSettings } from "src/lib/hooks/use-settings";
import { inviteLink } from "src/lib/play/session";
import Modal from "src/components/modal";
import Select from "src/components/select";
import TablePolicyFields from "./table-policy-fields";

// Everything a DM sets about the table rather than about this round: policy,
// the invite, who is holding which sheet, the seat. Policy edits land on the
// encounter, so they are this game's alone — the defaults they started from
// live in Settings.
export default function TableSettingsModal({
  onClose,
}: {
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const {
    encounter,
    clientId,
    sessionCode,
    sessionStatus,
    sharing,
    setSharingLevel,
    hideDeathSaves,
    setDeathSavesHidden,
    setSheetOffered,
    assignSheetTo,
    present,
    releaseDm,
    leaveSession,
  } = useEncounter();

  const brought = encounter.participants.filter(
    (participant) =>
      participant.characterUuid && participant.ownerClientId === clientId,
  );
  const connected = sessionStatus === "connected";

  return (
    <Modal title="Table settings" onClose={onClose} className="table-settings">
      <div className="settings-sections">
        <section className="settings-section">
          <h3 className="settings-section-title">What players see</h3>
          <TablePolicyFields
            idPrefix="table"
            sharing={sharing}
            onSharing={setSharingLevel}
            hideDeathSaves={hideDeathSaves}
            onHideDeathSaves={setDeathSavesHidden}
            defaults={{
              sharing: settings.defaultSharing,
              hideDeathSaves: settings.defaultHideDeathSaves,
            }}
          />
        </section>

        {connected && sessionCode && (
          <section className="settings-section">
            <h3 className="settings-section-title">Invite</h3>
            <p className="settings-description">
              Anyone who opens this link lands at your table. Read the code out
              if the link won&apos;t travel.
            </p>
            <InviteRow code={sessionCode} />
          </section>
        )}

        {brought.length > 0 && (
          <section className="settings-section">
            <h3 className="settings-section-title">Sheets you brought</h3>
            <p className="settings-description">
              An offered sheet can be picked up by anyone at the table without
              one. Handing it to someone asks them directly.
            </p>
            <ul className="brought-sheets">
              {brought.map((participant) => (
                <li key={participant.id}>
                  <span>{participant.name}</span>
                  <span className="row">
                    {participant.claimable ? (
                      <button
                        type="button"
                        onClick={() => setSheetOffered(participant.id, false)}
                      >
                        Stop offering
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setSheetOffered(participant.id, true)}
                      >
                        Offer
                      </button>
                    )}
                    {present.length > 0 && (
                      <Select
                        className="hand-to-select"
                        label={`Hand ${participant.name} to a player`}
                        triggerLabel="Hand to…"
                        value=""
                        options={present.map((client) => ({
                          value: client.clientId,
                          label: client.name,
                        }))}
                        onChange={(toClientId) => {
                          if (!toClientId) return;
                          assignSheetTo(participant.id, toClientId);
                        }}
                      />
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {connected && (
          <section className="settings-section">
            <h3 className="settings-section-title">Your seat</h3>
            <p className="settings-description">
              You&apos;re running this table. Release the seat and anyone here
              can claim it; leaving the table on its own doesn&apos;t give it
              up.
            </p>
            <span className="row">
              <button type="button" onClick={releaseDm}>
                Release the DM seat
              </button>
              <button
                type="button"
                onClick={() => {
                  leaveSession();
                  navigate("/play", { replace: true });
                  onClose();
                }}
              >
                Leave the table
              </button>
            </span>
          </section>
        )}
      </div>
    </Modal>
  );
}

function InviteRow({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="invite-row">
      <code>{code}</code>
      <button
        type="button"
        onClick={async () => {
          await copyToClipboard(inviteLink(window.location.origin, code));
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        <FaCopy /> {copied ? "Copied" : "Copy the invite link"}
      </button>
    </span>
  );
}
