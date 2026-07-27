import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useSettingsPanel } from "src/lib/hooks/use-settings-panel";

// `/settings` used to be the settings page. It's an overlay now (see
// `use-settings-panel.tsx`), so the path survives only as an alias: open the
// panel, then hand the URL back to the front door so nobody is left looking at
// a route that renders nothing behind the dialog.
export default function SettingsAlias() {
  const { openSettings } = useSettingsPanel();
  useEffect(() => {
    openSettings();
  }, []);
  return <Navigate to="/" replace />;
}
