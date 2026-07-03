import { ReactNode } from "react";

interface SettingsSectionProps {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
}

// A single labeled settings group: title, optional muted description, then its
// control(s). Gives every section on every tab consistent spacing and rhythm.
export default function SettingsSection({
  title,
  description,
  children,
}: SettingsSectionProps) {
  return (
    <section className="settings-section">
      <h3 className="settings-section-title">{title}</h3>
      {description !== undefined && (
        <p className="settings-description">{description}</p>
      )}
      {children}
    </section>
  );
}
