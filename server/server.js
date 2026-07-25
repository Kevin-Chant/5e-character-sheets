import { createRouter } from "nightlife-rabbit";
import { createServer } from "http";

let router;

// The sidecar speaks plain HTTP/WS. When exposing it to an HTTPS site, terminate
// TLS in front of it (e.g. a Caddy/nginx reverse proxy, or a CDN) so the browser
// reaches it over wss:// — browsers block insecure ws:// from an HTTPS page.
//
// Known, accepted limitations of this trust model (hobby deployment, no
// accounts): openRealm/closeRealm are unauthenticated GETs, so anyone who can
// reach the sidecar and knows a character uuid can open or close its realm; and
// realms whose host vanishes without calling closeRealm are never garbage-
// collected, so a long-running process slowly accumulates them. Restart the
// sidecar to reclaim; an idle-realm sweep would be the real fix.
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

const PORT = process.env.PORT ? Number(process.env.PORT) : 9000;

router = createRouter({
  httpServer: transport,
  port: PORT,
  path: "/",
  autoCreateRealms: false,
});

console.log(`Live-edit sidecar listening on port ${PORT}`);
