import { createRouter } from "nightlife-rabbit";
import { createServer } from "http";

let router;

const transport = createServer(
  // const transport = https.createServer(
  //   // TODO: generate keys
  //   {
  //     key: fs.readFileSync(__dirname + "/config/server.key"),
  //     cert: fs.readFileSync(__dirname + "/config/server.crt"),
  //   },
  (req, res) => {
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
            // No-op TODO: does this need any extra handling?
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
  }
);

router = createRouter({
  httpServer: transport,
  port: 9000,
  path: "/",
  autoCreateRealms: false,
});
