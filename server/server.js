import { createRouter } from "nightlife-rabbit";
import { createServer } from "http";

let router;

// The sidecar speaks plain HTTP/WS. When exposing it to an HTTPS site, terminate
// TLS in front of it (e.g. a Caddy/nginx reverse proxy, or a CDN) so the browser
// reaches it over wss:// — browsers block insecure ws:// from an HTTPS page.
//
// Known, accepted limitation of this trust model (hobby deployment, no
// accounts): openRealm/closeRealm/realm are unauthenticated GETs, so anyone who
// can reach the sidecar and knows a character uuid or session code can open,
// close or look up its realm. The uuid *is* the authentication — which is also
// why there is a lookup-by-name route and deliberately **no list route**:
// enumerating realms would hand out every live session code at once.
const transport = createServer((req, res) => {
  const path = req.url || "/";
  // Liveness probe. Used by the deploy job's post-restart check, by the
  // Lightsail status alarm's human follow-up, and by the "Test connection"
  // button in the app's settings — which is why it answers with a body and
  // permits cross-origin reads: the SPA fetches this straight from the
  // browser, on a different origin to the sidecar.
  if (path === "/health") {
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(
      JSON.stringify({
        status: "ok",
        // Seconds this process has been up — the cheap way to spot a sidecar
        // that is quietly restart-looping rather than serving.
        uptime: Math.floor(process.uptime()),
      }),
    );
    return;
  }
  const pathSegments = path.split("/").splice(1);
  let status = 200;
  let statusMessage = "";
  // Is anybody at this table? The app used to answer this by opening a real
  // WebSocket and seeing whether it survived, because `openRealm` *creates* the
  // realm it was asked about and so can't be used to ask. That probe can only
  // ever report two outcomes ("a realm answered" / "nothing answered"), which is
  // what made "the table is closed" and "the sidecar is unreachable" the same
  // observation. Answering it here separates them, and adds the occupancy the
  // probe could never see.
  if (pathSegments[0] === "realm" && pathSegments.length === 2) {
    const realm = lookupRealm(pathSegments[1]);
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    // A realm that isn't there is an answer, not an error — 404 would be read
    // as "no such route" by anything generic in front of this.
    res.end(
      JSON.stringify({
        exists: !!realm,
        sessions: realm ? realm.sessions.length : 0,
      }),
    );
    return;
  }
  if (pathSegments.length !== 2) {
    status = 404;
    statusMessage = "Content not found";
  } else {
    switch (pathSegments[0]) {
      case "openRealm":
        try {
          router.createRealm(pathSegments[1]);
        } catch {
          // No-op: realm already exists.
        }
        break;
      case "closeRealm":
        try {
          const realm = router.realm(pathSegments[1]);
          if (realm) {
            realm.close(1008, "wamp.error.system_shutdown");
          }
        } catch {
          // No-op
        }
        status = 204;
        break;
      default:
        // Not an API route
        status = 404;
        statusMessage = "Content not found";
        break;
    }
  }
  res.writeHead(status, statusMessage, {
    "Access-Control-Allow-Origin": "*",
  });
  res.end();
});

// `router.realms` is a plain object on the router with no accessor of its own —
// nightlife-rabbit exposes `realm(uri)`, which *throws* for an unknown realm
// rather than reporting one, so reading the store directly is the only way to
// ask a question instead of making a demand. `hasOwnProperty` rather than a
// truthiness check because the name comes off the URL, and `__proto__` would
// otherwise resolve to something that is not a realm.
function lookupRealm(name) {
  if (!/^[a-z0-9.]{1,128}$/i.test(name)) return undefined;
  if (!Object.prototype.hasOwnProperty.call(router.realms, name)) {
    return undefined;
  }
  return router.realms[name];
}

// How long a realm nobody is connected to stays open, and how often we look.
//
// Realms used to live until the process did, which made "is this table open?"
// really mean "has the sidecar restarted since?" — a question about our deploy
// cadence, not about the game. Twelve hours is deliberately long: a table that
// goes quiet at midnight is still there when somebody opens it at noon, and a
// DM who comes back next Thursday to a closed one lands on the reopen-this-code
// flow, which keeps the invite link they already handed out.
const REALM_TTL_MS = 12 * 60 * 60 * 1000;
const SWEEP_EVERY_MS = 30 * 60 * 1000;

// When each empty realm went quiet. Absent means "occupied, or not seen yet".
const idleSince = new Map();

function sweepIdleRealms(now) {
  for (const name of Object.keys(router.realms)) {
    const realm = router.realms[name];
    if (realm.sessions.length > 0) {
      idleSince.delete(name);
      continue;
    }
    const since = idleSince.get(name);
    if (since === undefined) {
      // First sweep that has seen it empty — start the clock rather than
      // closing it, so a realm opened seconds ago by a DM whose players haven't
      // arrived yet isn't swept out from under them.
      idleSince.set(name, now);
      continue;
    }
    if (now - since < REALM_TTL_MS) continue;
    // Closing only ends the (zero) sessions; the entry stays in the store, so
    // the realm would still report as existing forever. Dropping it is what
    // actually reclaims the name and the memory.
    try {
      realm.close(1008, "wamp.error.system_shutdown");
    } catch {
      // A realm that objects to being closed is still one we want gone.
    }
    delete router.realms[name];
    idleSince.delete(name);
  }
}

const PORT = process.env.PORT ? Number(process.env.PORT) : 9000;

router = createRouter({
  httpServer: transport,
  port: PORT,
  path: "/",
  autoCreateRealms: false,
});

setInterval(() => sweepIdleRealms(Date.now()), SWEEP_EVERY_MS);

console.log(`Live-edit sidecar listening on port ${PORT}`);
