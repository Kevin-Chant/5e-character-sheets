import { createRouter } from "nightlife-rabbit";
import { createServer } from "http";

let router;

// The sidecar speaks plain HTTP/WS. When exposing it to an HTTPS site, terminate
// TLS in front of it (e.g. a Caddy/nginx reverse proxy, or a CDN) so the browser
// reaches it over wss:// — browsers block insecure ws:// from an HTTPS page.
const transport = createServer((req, res) => {
  const path = req.url || "/";
  if (path === "/health") {
    res.writeHead(200, {
      "Access-Control-Allow-Origin": "*",
    });
    res.end();
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
