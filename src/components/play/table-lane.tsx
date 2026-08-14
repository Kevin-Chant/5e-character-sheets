import classNames from "classnames";
import { useEncounter } from "src/lib/hooks/use-encounter";
import { useTableTalk } from "src/lib/hooks/use-table-talk";
import { Exchange, ExchangeStage, exchanges } from "src/lib/play/reports";
import SessionBar from "./session-bar";

// The table as a place: session controls, who's here, and what they're
// rolling. Read-only ambience — the cards that need answering live in
// `CallStack`, above it.

export default function TableLane({ hideSession }: { hideSession?: boolean }) {
  const { sessionStatus } = useEncounter();
  const connected = sessionStatus === "connected";
  return (
    <aside className="table-lane" aria-label="The table">
      {/* Hidden during a reconnect — RejoinBanner takes its place. */}
      {!hideSession && <SessionBar />}
      {connected && <PresenceRoster />}
      {connected && <ChatterFeed />}
    </aside>
  );
}

// The presence roster. A quiet client (a backgrounded phone) gets a hollow
// dot rather than dropping off the list.
function PresenceRoster() {
  const { present, quietClients, clientId, encounter } = useEncounter();
  if (present.length === 0) return null;
  return (
    <div className="table-presence">
      <h3 className="play-rail-heading">At the table</h3>
      <ul>
        {present.map((client) => {
          const quiet = quietClients.includes(client.clientId);
          const you = client.clientId === clientId;
          const dm = encounter.dmClientId === client.clientId;
          return (
            <li
              key={client.clientId}
              className={classNames("table-presence-entry", {
                quiet: quiet && !you,
              })}
            >
              <span className="table-presence-dot" aria-hidden />
              <span className="table-presence-name">{client.name}</span>
              {you && <span className="table-presence-tag">you</span>}
              {dm && <span className="table-presence-tag">DM</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// The table's dice, overheard: one line per exchange, newest first, latest
// attempt per stage. Every client receives every report; this renders them
// for the player the way the exchange queue does for the DM.
const CHATTER_SHOWN = 8;

function ChatterFeed() {
  const { reports } = useTableTalk();
  if (reports.length === 0) return null;
  const feed = exchanges(reports).slice(-CHATTER_SHOWN).reverse();
  return (
    <div className="table-chatter">
      <h3 className="play-rail-heading">Rolls</h3>
      <ul>
        {feed.map((exchange) => (
          <ChatterLine key={exchange.exchangeId} exchange={exchange} />
        ))}
      </ul>
    </div>
  );
}

// The cast stage rolls nothing, so it contributes no number.
function stageSummary(stage: ExchangeStage): string | undefined {
  const roll = stage.latest;
  switch (stage.stage) {
    case "cast":
      return undefined;
    case "toHit":
      return `${roll.total} to hit`;
    case "damage":
      return `${roll.total} damage`;
    case "healing":
      return `${roll.total} healing`;
    default:
      return `${roll.total}`;
  }
}

function ChatterLine({ exchange }: { exchange: Exchange }) {
  const targets = exchange.targets
    .map((t) => t.name)
    .filter(Boolean)
    .join(", ");
  const parts = exchange.stages.map(stageSummary).filter(Boolean).join(" · ");
  const rerolled = exchange.stages.some((s) => s.superseded.length > 0);
  const manual = exchange.stages.some((s) => s.latest.manual);
  return (
    <li className="table-chatter-line">
      <span className="table-chatter-who">{exchange.fromName}</span>
      <span className="table-chatter-what">
        {exchange.label}
        {targets && <span className="table-chatter-target"> → {targets}</span>}
      </span>
      {parts && <span className="table-chatter-total">{parts}</span>}
      {rerolled && <span className="table-chatter-mark">re-rolled</span>}
      {manual && <span className="table-chatter-mark">real dice</span>}
    </li>
  );
}
