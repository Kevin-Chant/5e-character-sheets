import { createRouter } from "nightlife-rabbit";
// Internal module, not the public surface — nightlife-rabbit exports no way to
// reach Realm, and the patch below is on its prototype.
import Realm from "nightlife-rabbit/lib/realm.js";
import { createServer } from "http";

// Patches nightlife-rabbit's `Realm.cleanup`: the stock version unregisters
// every procedure in the realm on behalf of the departing session, and
// `unregister` throws for a procedure owned by someone else — aborting
// cleanup mid-loop and skipping the chained `removeSession`. That leaks the
// leaver's procedures/subscriptions/session entry whenever a realm holds
// registrations from two sessions (every client registers a liveness-ping
// procedure named after itself). This version drops only the procedures this
// session owns, always cleans its subscriptions, and never throws.
Realm.prototype.cleanup = function (session) {
  for (const uri of Object.keys(this.procedures)) {
    if (this.procedures[uri].callee === session) {
      delete this.procedures[uri];
    }
  }
  for (const key of Object.keys(this.topics)) {
    const topic = this.topics[key];
    topic.removeSession(session);
    if (topic.sessions.length === 0) {
      delete this.topics[key];
    }
  }
  return this;
};

let router;

// Speaks plain HTTP/WS; terminate TLS in front of it (reverse proxy/CDN) for
// wss:// from an HTTPS page.
//
// openRealm/closeRealm/realm are unauthenticated GETs — the uuid/session code
// is the authentication (no accounts). There's a lookup-by-name route but
// deliberately no list route, since enumerating realms would hand out every
// live session code at once.
const transport = createServer((req, res) => {
  const path = req.url || "/";
  // Liveness probe, fetched cross-origin by the SPA and by deploy/alarm checks.
  if (path === "/health") {
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(
      JSON.stringify({
        status: "ok",
        uptime: Math.floor(process.uptime()),
      }),
    );
    return;
  }
  const pathSegments = path.split("/").splice(1);
  let status = 200;
  let statusMessage = "";
  // Separates "realm doesn't exist" from "sidecar unreachable" — `openRealm`
  // creates the realm it's asked about, so it can't be used to check.
  if (pathSegments[0] === "realm" && pathSegments.length === 2) {
    const realm = lookupRealm(pathSegments[1]);
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    // A missing realm is an answer, not an error (avoid 404).
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

// `router.realm(uri)` throws for an unknown realm, so read the store
// directly. `hasOwnProperty`, not a truthiness check, since the name comes
// off the URL and `__proto__` would otherwise resolve to something.
function lookupRealm(name) {
  if (!/^[a-z0-9.]{1,128}$/i.test(name)) return undefined;
  if (!Object.prototype.hasOwnProperty.call(router.realms, name)) {
    return undefined;
  }
  return router.realms[name];
}

// How long an unoccupied realm stays open before being swept, and how often
// we check. Twelve hours so a table that goes quiet overnight is still there
// the next day.
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
      // First sweep that saw it empty — start the clock rather than closing
      // immediately.
      idleSince.set(name, now);
      continue;
    }
    if (now - since < REALM_TTL_MS) continue;
    // Closing only ends the sessions; delete from the store to actually
    // reclaim the name.
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
