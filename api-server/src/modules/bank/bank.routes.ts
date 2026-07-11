/** 公共题库路由 */
import { Hono } from "hono";
import {
  requireAuth,
  type AuthVariables,
} from "../../shared/auth/require-auth.js";
import { BankFiltersSchema } from "./bank.schemas.js";
import {
  getBankQuestion,
  listBankQuestions,
  listFavoriteBankQuestions,
  toggleFavorite,
} from "./bank.service.js";

const bank = new Hono<{ Variables: AuthVariables }>();

bank.use("*", requireAuth);

bank.get("/", async (c) => {
  const filters = BankFiltersSchema.parse({
    position: c.req.query("position"),
    difficulty: c.req.query("difficulty"),
    type: c.req.query("type"),
    search: c.req.query("search"),
  });
  const result = await listBankQuestions({
    supabase: c.var.supabase,
    userId: c.var.userId,
    filters,
  });
  return c.json(result);
});

bank.get("/favorites", async (c) => {
  const result = await listFavoriteBankQuestions({
    supabase: c.var.supabase,
    userId: c.var.userId,
  });
  return c.json(result);
});

bank.get("/:id", async (c) => {
  const result = await getBankQuestion({
    supabase: c.var.supabase,
    userId: c.var.userId,
    questionId: c.req.param("id"),
  });
  if (!result) return c.json({ error: "题目未找到" }, 404);
  return c.json(result);
});

bank.post("/:id/favorite", async (c) => {
  const result = await toggleFavorite({
    supabase: c.var.supabase,
    userId: c.var.userId,
    questionId: c.req.param("id"),
  });
  if (!result) return c.json({ error: "题目未找到" }, 404);
  return c.json(result);
});

export { bank };

