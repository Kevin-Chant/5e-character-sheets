import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useCharacter } from "src/lib/hooks/use-character";
import { useDatastore } from "src/lib/hooks/use-datastore";
import { useEncounter } from "src/lib/hooks/use-encounter";
import { loadPersistedCharacter } from "src/lib/hooks/reducers/actions";
import { normalizeSessionCode } from "src/lib/play/session";
import { sessionMemoryFor } from "src/lib/play/session-memory";
import {
  MAX_REJOIN_ATTEMPTS,
  planRejoin,
  playPathFor,
  rejoinDelayMs,
  shouldRestamp,
} from "src/lib/play/rejoin";

// Auto-reconnects to `/play/<code>` after a cold reload (e.g. Android evicting
// a background tab) without the player doing anything. Decision logic lives
// in the pure `play/rejoin.ts`; this hook is the wiring plus retry timing.

export interface AutoRejoin {
  // Whether the URL names a table. Gate redirects on this, not `rejoining` —
  // a reconnect passes through "connecting" on every attempt, and redirecting
  // in that window would navigate away before the retry loop finishes.
  atTable: boolean;
  rejoining: boolean;
  // Tries spent so far; past MAX_REJOIN_ATTEMPTS the surface offers a manual button.
  attempts: number;
  retry: () => void;
}

export function useAutoRejoin(): AutoRejoin {
  const { code: rawCode } = useParams();
  const navigate = useNavigate();
  const { character, dispatch } = useCharacter();
  const { characters } = useDatastore();
  const { sessionCode, sessionStatus, joinSession, hostSession, lastSession } =
    useEncounter();

  const urlCode = rawCode ? normalizeSessionCode(rawCode) : undefined;
  const [attempts, setAttempts] = useState(0);
  // Guards against React dev-mode double-invoking the effect for one scheduled try.
  const busy = useRef(false);
  // Attempts are spent per code; reset when the table changes.
  const attemptedCode = useRef<string | undefined>(urlCode);
  if (attemptedCode.current !== urlCode) {
    attemptedCode.current = urlCode;
    busy.current = false;
  }

  const memory = urlCode ? sessionMemoryFor(urlCode) : undefined;
  const wasLast = !!urlCode && !!lastSession && lastSession === urlCode;

  // Read through a ref: excluded from the scheduling effect's deps so a
  // re-render doesn't cancel/re-time an in-flight attempt. Settings (incl.
  // liveEditHost) load from localStorage in a mount effect, so a captured
  // closure from the first render would use the built-in default host instead.
  const actions = useRef({ joinSession, hostSession });
  actions.current = { joinSession, hostSession };

  const retry = useCallback(() => setAttempts(0), []);

  // Network-back events reset the backoff schedule (rather than connecting
  // directly, keeping one connect call site) — but not past the cap, since a
  // phone fires these all night and would otherwise keep restarting the
  // ladder for a table that has genuinely ended. Someone looking at the tab
  // is different, and does restart it.
  const attemptsRef = useRef(attempts);
  attemptsRef.current = attempts;
  const wakeRetry = useCallback(() => {
    if (attemptsRef.current >= MAX_REJOIN_ATTEMPTS) return;
    setAttempts(0);
  }, []);
  const [visible, setVisible] = useState(
    () => document.visibilityState !== "hidden",
  );
  useEffect(() => {
    const wake = () => {
      const shown = document.visibilityState !== "hidden";
      setVisible(shown);
      if (shown) setAttempts(0);
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wakeRetry);
    // pageshow fires (not visibilitychange) when a suspended-not-hidden tab is restored.
    window.addEventListener("pageshow", wakeRetry);
    return () => {
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wakeRetry);
      window.removeEventListener("pageshow", wakeRetry);
    };
  }, [wakeRetry]);

  const plan = planRejoin({
    urlCode,
    status: sessionStatus,
    memory,
    wasLast,
    attempts,
    visible,
  });

  useEffect(() => {
    if (plan.action === "connected") {
      // URL follows the session, never the reverse — a live connection is not
      // torn down to obey a stale link.
      if (shouldRestamp(urlCode, sessionCode)) {
        navigate(playPathFor(sessionCode), { replace: true });
      }
      if (attempts !== 0) setAttempts(0);
      return;
    }
    if (plan.action === "lobby") {
      navigate(`/join/${plan.code}`, { replace: true });
      return;
    }
    if (plan.action === "wait" || busy.current) return;

    const timer = setTimeout(async () => {
      busy.current = true;
      // Join first regardless of seat: a DM's own table is usually still open
      // (another client holding the realm), and joining reclaims the seat via
      // dmToken rather than opening a second realm for a room that exists.
      let result = await actions.current.joinSession(plan.code);
      // Nobody home: reopen on the same code so a pinned invite link
      // survives sidecar restarts.
      if (!result.ok && plan.seat === "dm" && result.reason === "absent") {
        result = await actions.current.hostSession(plan.code);
      }
      busy.current = false;
      if (!result.ok) setAttempts((spent) => spent + 1);
    }, rejoinDelayMs(attempts));
    return () => clearTimeout(timer);
  }, [plan.action, urlCode, sessionCode, sessionStatus, attempts, visible]);

  // Restore the sheet that was open when the tab died, per-table (not "last
  // sheet opened anywhere"). A DM's memory records no sheet, so nothing opens
  // for them.
  const restoredFor = useRef<string | undefined>();
  const playAsUuid = memory?.seat === "dm" ? undefined : memory?.playAsUuid;
  useEffect(() => {
    if (
      !urlCode ||
      !playAsUuid ||
      character ||
      restoredFor.current === urlCode
    ) {
      return;
    }
    // Character list arrives asynchronously (Drive OAuth resume + fetch);
    // wait rather than conclude the sheet is gone.
    const sheet = characters.find((c) => c.uuid === playAsUuid);
    if (!sheet) return;
    restoredFor.current = urlCode;
    dispatch(loadPersistedCharacter(sheet));
  }, [urlCode, playAsUuid, character, characters, dispatch]);

  return {
    atTable: !!urlCode,
    // True across the whole attempt including the "connecting" window
    // (plan.action === "wait" there, which answers a different question).
    rejoining:
      !!urlCode &&
      sessionStatus !== "connected" &&
      attempts < MAX_REJOIN_ATTEMPTS,
    attempts,
    retry,
  };
}
