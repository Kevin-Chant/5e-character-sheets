import { createServer } from "http";
import { createRouter } from "nightlife-rabbit";

createRouter({
  httpServer: createServer(),
  port: 9000,
  path: "/",
  autoCreateRealms: true,
});
