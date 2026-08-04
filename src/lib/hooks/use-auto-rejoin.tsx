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
} from "src/lib/play/rejoin";

// The table in the URL, kept true in both directions.
//
// Downward: a `/play/<code>` this browser has been at reconnects on its own,
// with the sheet it was playing, having asked nothing. Upward: a session
// joined by any other route writes itself into the address bar, so the link is
// there to come back to before anyone needs it.
//
// **Why this is worth a hook of its own**: the reload it recovers from is not
// a reload anyone chose. Android evicts a background tab the moment something
// else wants the memory, and what returns is a cold page — so the recovery
// path has to run before the player has done anything, and has to be
// indistinguishable from never having left. Every decision it makes is
// `play/rejoin.ts`, which is pure; this is the wiring, plus the one thing a
// pure function can't hold: when to try again.

export interface AutoRejoin {
  // The URL names a table. **This, not `rejoining`, is what the surface must
  // gate its "nothing to play here, go to the picker" redirect on**: a
  // reconnect passes through `connecting` on every attempt, and a redirect
  // that fires in that gap navigates away from the one URL that knows how to
  // get back — taking the retry loop with it, since the hook unmounts too.
  atTable: boolean;
  // Actively trying to get in. The surface says so — an unexplained empty
  // board is the thing this whole path exists to avoid.
  rejoining: boolean;
  // Tries spent so far. Past the cap the surface offers the manual button
  // instead of pretending something is still happening.
  attempts: number;
  // Try again now, resetting the backoff — what the manual button calls.
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
  // The attempt in flight. Guards against the effect firing twice for one
  // scheduled try — which React's development double-invoke does for free.
  const busy = useRef(false);
  // Reset the count when the table changes: attempts are spent per code.
  const attemptedCode = useRef<string | undefined>(urlCode);
  if (attemptedCode.current !== urlCode) {
    attemptedCode.current = urlCode;
    busy.current = false;
  }

  const memory = urlCode ? sessionMemoryFor(urlCode) : undefined;
  const wasLast = !!urlCode && !!lastSession && lastSession === urlCode;

  // Read through a ref, and this one is not a nicety.
  //
  // The scheduled attempt below runs half a second after the effect that
  // scheduled it, and its dependencies deliberately don't include these — a
  // re-render must not cancel and re-time an attempt in flight. But `connect`
  // closes over `liveEditHost`, and **settings are read from localStorage in a
  // mount effect**, so the first render of a cold page load carries the
  // built-in default: the *cloud* sidecar. A captured `joinSession` from that
  // render reconnects a local table to production, which fails with
  // `no_such_realm` and looks for all the world like the table having closed.
  // Observed exactly that way in `session-smoke`'s reload scenario.
  const actions = useRef({ joinSession, hostSession });
  actions.current = { joinSession, hostSession };

  const retry = useCallback(() => setAttempts(0), []);

  // Coming back to the foreground, or coming back onto a network, is the
  // strongest possible hint that the last failure is stale — a phone that
  // failed in a lift should not then sit out a minute of backoff on the
  // pavement. Both events reset the schedule rather than connecting directly,
  // so there is still exactly one place that connects.
  useEffect(() => {
    const wake = () => {
      if (document.visibilityState === "visible") retry();
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", retry);
    // Restoring a frozen page fires this and *not* visibilitychange, which is
    // precisely the Android case: the tab was never hidden, it was suspended.
    window.addEventListener("pageshow", retry);
    return () => {
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", retry);
      window.removeEventListener("pageshow", retry);
    };
  }, [retry]);

  const plan = planRejoin({
    urlCode,
    status: sessionStatus,
    memory,
    wasLast,
    attempts,
  });

  useEffect(() => {
    if (plan.action === "connected") {
      // The URL follows the session, never the other way round: a live
      // connection is not torn down to obey a stale link. This is also the
      // only thing that has to happen for a table joined through the lobby,
      // the session bar or a rejoin shortcut to become linkable.
      const path = playPathFor(sessionCode);
      if (urlCode !== sessionCode) navigate(path, { replace: true });
      if (attempts !== 0) setAttempts(0);
      return;
    }
    if (plan.action === "lobby") {
      // Never been here. `/join/<code>` probes the realm and asks the
      // questions a first visit needs — including whether the code is a shared
      // *sheet* rather than a table.
      navigate(`/join/${plan.code}`, { replace: true });
      return;
    }
    if (plan.action === "wait" || busy.current) return;

    const timer = setTimeout(async () => {
      busy.current = true;
      // Join first, whichever seat this is. A DM's own table is usually still
      // open — someone else is holding the realm up — and joining it reclaims
      // the seat from this browser's `dmToken` anyway, while *hosting* an open
      // realm would be a second `openRealm` for a room that already exists.
      let result = await actions.current.joinSession(plan.code);
      // Nobody home. For a DM that isn't a failure, it's Thursday: reopening
      // the table on the same code is what keeps a pinned invite link alive
      // across the sidecar restarts every deploy causes.
      if (!result.ok && plan.seat === "dm" && result.reason === "absent") {
        result = await actions.current.hostSession(plan.code);
      }
      busy.current = false;
      if (!result.ok) setAttempts((spent) => spent + 1);
    }, rejoinDelayMs(attempts));
    return () => clearTimeout(timer);
  }, [plan.action, urlCode, sessionCode, sessionStatus, attempts]);

  // The sheet that was open when the tab died.
  //
  // A rejoin without it is a seat at the table with no character — technically
  // a real state (it's what a player waiting to be handed a sheet has), and
  // exactly the wrong one to drop somebody into mid-fight. The session memory
  // knows which sheet this browser played *at this table*, which is a better
  // answer than "the last sheet opened anywhere". A DM's memory deliberately
  // records no sheet — running the table is the job — so nothing opens for
  // them and whatever they had open stays.
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
    // The list arrives asynchronously — Drive takes an OAuth resume and a
    // fetch — so this waits rather than concluding the sheet is gone.
    const sheet = characters.find((c) => c.uuid === playAsUuid);
    if (!sheet) return;
    restoredFor.current = urlCode;
    dispatch(loadPersistedCharacter(sheet));
  }, [urlCode, playAsUuid, character, characters, dispatch]);

  return {
    atTable: !!urlCode,
    // True across the whole attempt, including the `connecting` window each
    // one passes through — `plan.action` is "wait" in that window, which is
    // the right answer for "should I start another attempt" and the wrong one
    // for "is something happening".
    rejoining:
      !!urlCode &&
      sessionStatus !== "connected" &&
      attempts < MAX_REJOIN_ATTEMPTS,
    attempts,
    retry,
  };
}
