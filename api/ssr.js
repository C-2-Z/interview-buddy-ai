import { toNodeHandler } from "srvx/node";
import handler from "../dist/server/server.js";

export default toNodeHandler(handler.fetch);
