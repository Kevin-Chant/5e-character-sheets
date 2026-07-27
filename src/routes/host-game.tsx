import SessionEntry from "src/components/sessions/session-entry";

// `/host` — starting a table. A route rather than a step inside another page so
// that picking Google Drive from the lobby can come back to a URL instead of
// carrying the whole half-answered lobby through an OAuth popup as router state.
export default function HostGame() {
  return <SessionEntry mode="host" />;
}
