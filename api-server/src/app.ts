import { Hono } from "hono";
import { logger } from "hono/logger";
import { corsMiddleware } from "./config/cors.js";
import { bank } from "./modules/bank/bank.routes.js";
import { questions } from "./modules/questions/questions.routes.js";
import { sessions } from "./modules/sessions/sessions.routes.js";
import { settings } from "./modules/settings/settings.routes.js";
import { skills } from "./modules/skills/skills.routes.js";
import { resumes } from "./modules/resumes/resumes.routes.js";
import { voice } from "./modules/voice/voice.routes.js";
import { generation } from "./modules/generation/generation.routes.js";
import { performanceRoutes } from "./modules/performance/performance.routes.js";

const app = new Hono();

app.use("*", corsMiddleware);
app.use("*", logger());

app.route("/api/sessions", generation);
app.route("/api/sessions", sessions);
app.route("/api/questions", questions);
app.route("/api/bank", bank);
app.route("/api/settings", settings);
app.route("/api/skills", skills);
app.route("/api/resumes", resumes);
app.route("/api/voice", voice);
app.route("/api/performance", performanceRoutes);

app.get("/api/health", (c) => c.json({ status: "ok" }));

export const port = Number(process.env.PORT) || 3001;
export default app;

