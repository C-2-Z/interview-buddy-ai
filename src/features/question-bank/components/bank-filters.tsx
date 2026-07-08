import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BANK_DIFFICULTIES,
  BANK_POSITIONS,
  BANK_TYPES,
} from "../hooks/use-question-bank";
import type { BankFilters } from "../types";

type BankFiltersProps = {
  filters: Required<BankFilters>;
  onChange: (key: keyof Required<BankFilters>, value: string) => void;
  onClear: () => void;
};

export function BankFilters({ filters, onChange, onClear }: BankFiltersProps) {
  const hasFilters =
    filters.position || filters.difficulty || filters.type || filters.search;

  return (
    <div className="flex flex-wrap gap-2">
      <Select
        value={filters.position}
        onValueChange={(v) => onChange("position", v === filters.position ? "" : v)}
      >
        <SelectTrigger className="w-36">
          <SelectValue placeholder="全部岗位" />
        </SelectTrigger>
        <SelectContent>
          {BANK_POSITIONS.map((position) => (
            <SelectItem key={position} value={position}>
              {position}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={filters.difficulty}
        onValueChange={(v) =>
          onChange("difficulty", v === filters.difficulty ? "" : v)
        }
      >
        <SelectTrigger className="w-28">
          <SelectValue placeholder="全部难度" />
        </SelectTrigger>
        <SelectContent>
          {BANK_DIFFICULTIES.map((difficulty) => (
            <SelectItem key={difficulty} value={difficulty}>
              {difficulty}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={filters.type}
        onValueChange={(v) => onChange("type", v === filters.type ? "" : v)}
      >
        <SelectTrigger className="w-28">
          <SelectValue placeholder="全部类型" />
        </SelectTrigger>
        <SelectContent>
          {BANK_TYPES.map((type) => (
            <SelectItem key={type} value={type}>
              {type}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="搜索题目..."
          value={filters.search}
          onChange={(e) => onChange("search", e.target.value)}
          className="pl-8"
        />
      </div>
      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={onClear}>
          清除筛选
        </Button>
      )}
    </div>
  );
}

