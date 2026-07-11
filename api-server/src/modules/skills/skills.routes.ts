/** Skill 列表路由 */
import { Hono } from "hono";
import { listSkillMetas } from "./skills.service.js";

const skills = new Hono();

skills.get("/", (c) => c.json(listSkillMetas()));

export { skills };

