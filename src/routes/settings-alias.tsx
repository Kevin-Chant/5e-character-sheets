import { useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useSettingsPanel } from "src/lib/hooks/use-settings-panel";

// Settings is an overlay, not a route; this alias opens the panel and
// redirects so a stray `/settings` bookmark doesn't render nothing.
export default function SettingsAlias() {
  const { openSettings } = useSettingsPanel();
  useEffect(() => {
    openSettings();
  }, []);
  return <Navigate to="/" replace />;
}
