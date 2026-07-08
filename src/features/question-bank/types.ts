export type BankQuestion = {
  id: string;
  position: string;
  difficulty: string;
  type: string;
  question: string;
  tags: string[];
  created_at: string;
  is_favorited: boolean;
};

export type BankFilters = {
  position?: string;
  difficulty?: string;
  type?: string;
  search?: string;
};

