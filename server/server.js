import { createRouter } from "nightlife-rabbit";
import { createServer } from "http";

// var transport = https.createServer(
//   // TODO: generate keys
//   {
//     key: fs.readFileSync(__dirname + "/config/server.key"),
//     cert: fs.readFileSync(__dirname + "/config/server.crt"),
//   },
//   function (req, res) {
//     // TODO: allow opening realms based on UUIDs requested
//     res.writeHead(200);
//   }
// );

const router = createRouter({
  httpServer: createServer(),
  port: 9000,
  path: "/",
  autoCreateRealms: true,
});

// TODO: call router.createRealm in response to request
// router.createRealm('com.example.inge');
