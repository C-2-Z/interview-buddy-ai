import { z } from "zod";

export const BankFiltersSchema = z.object({
  position: z.string().optional(),
  difficulty: z.string().optional(),
  type: z.string().optional(),
  search: z.string().optional(),
});

export type BankFilters = z.infer<typeof BankFiltersSchema>;

