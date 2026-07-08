import { Hono } from "hono";
import { getAllSkillMetas } from "../lib/skills/index.js";

const skills = new Hono();

/** GET /api/skills — list all available skills (lightweight metadata) */
skills.get("/", async (c) => {
  const metas = getAllSkillMetas();
  return c.json(metas);
});

export { skills };
