import { Hono } from "hono";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";

const bank = new Hono<{
  Variables: { userId: string; supabase: ReturnType<typeof import("../lib/supabase.js").createUserClient> };
}>();

bank.use("*", requireAuth);

/** GET /api/bank — List questions with optional filters */
bank.get("/", async (c) => {
  const supabase = c.var.supabase;
  const userId = c.var.userId;

  const position = c.req.query("position");
  const difficulty = c.req.query("difficulty");
  const type = c.req.query("type");
  const search = c.req.query("search");

  let query = supabase
    .from("question_bank")
    .select("id, position, difficulty, type, question, tags, created_at")
    .order("created_at", { ascending: false });

  if (position) query = query.eq("position", position);
  if (difficulty) query = query.eq("difficulty", difficulty);
  if (type) query = query.eq("type", type);
  if (search) query = query.ilike("question", `%${search}%`);

  const { data, error } = await query;
  if (error) return c.json({ error: error.message }, 500);

  // Get user favorites
  const { data: favs } = await supabase
    .from("favorite_questions")
    .select("question_id")
    .eq("user_id", userId);

  const favoriteIds = new Set((favs ?? []).map((f) => f.question_id));

  const rows = (data ?? []).map((q) => ({
    ...q,
    is_favorited: favoriteIds.has(q.id),
    tags: q.tags ?? [],
  }));

  return c.json(rows);
});

/** GET /api/bank/favorites — List user favorite questions */
bank.get("/favorites", async (c) => {
  const supabase = c.var.supabase;
  const userId = c.var.userId;

  const { data, error } = await supabase
    .from("favorite_questions")
    .select("question_id, created_at, question_bank(*)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) return c.json({ error: error.message }, 500);

  const rows = (data ?? []).map((f) => ({
    ...(f.question_bank as Record<string, unknown>),
    favorited_at: f.created_at,
    is_favorited: true,
  }));

  return c.json(rows);
});

/** GET /api/bank/:id — Get single question detail */
bank.get("/:id", async (c) => {
  const supabase = c.var.supabase;
  const userId = c.var.userId;
  const id = c.req.param("id");

  const { data: q, error } = await supabase
    .from("question_bank")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !q) return c.json({ error: "题目未找到" }, 404);

  // Check if user has favorited
  const { data: fav } = await supabase
    .from("favorite_questions")
    .select("id")
    .eq("user_id", userId)
    .eq("question_id", id)
    .maybeSingle();

  return c.json({
    ...q,
    tags: q.tags ?? [],
    is_favorited: fav !== null,
  });
});

/** POST /api/bank/:id/favorite — Toggle favorite */
bank.post("/:id/favorite", async (c) => {
  const supabase = c.var.supabase;
  const userId = c.var.userId;
  const questionId = c.req.param("id");

  // Check if question exists
  const { data: q } = await supabase
    .from("question_bank")
    .select("id")
    .eq("id", questionId)
    .single();

  if (!q) return c.json({ error: "题目未找到" }, 404);

  // Check current favorite state
  const { data: existing } = await supabase
    .from("favorite_questions")
    .select("id")
    .eq("user_id", userId)
    .eq("question_id", questionId)
    .maybeSingle();

  if (existing) {
    // Unfavorite
    const { error } = await supabase
      .from("favorite_questions")
      .delete()
      .eq("id", existing.id);
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ is_favorited: false });
  } else {
    // Favorite
    const { error } = await supabase
      .from("favorite_questions")
      .insert({ user_id: userId, question_id: questionId });
    if (error) return c.json({ error: error.message }, 500);
    return c.json({ is_favorited: true });
  }
});

export { bank };
