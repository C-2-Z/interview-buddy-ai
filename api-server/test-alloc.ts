import { calculateAllocation } from './src/lib/skills/allocator.js';
import type { CategoryDef } from './src/lib/skills/skill-schema.js';

const cats: CategoryDef[] = [
  { key: 'JAVA', label: 'Java', priority: 'CORE' },
  { key: 'SPRING', label: 'Spring', priority: 'CORE' },
  { key: 'MYSQL', label: 'MySQL', priority: 'CORE' },
  { key: 'REDIS', label: 'Redis', priority: 'NORMAL' },
  { key: 'SYSTEM_DESIGN', label: '系统设计', priority: 'NORMAL' },
  { key: 'PROJECT', label: '项目经历', priority: 'ALWAYS_ONE' },
];

for (const total of [3, 5, 7, 10]) {
  const alloc = calculateAllocation(cats, total);
  const entries = [...alloc.entries()].map(([k, v]) => `${k}=${v}`).join(', ');
  const sum = [...alloc.values()].reduce((a, b) => a + b, 0);
  console.log(`${total}题 -> [${entries}] total=${sum} ${sum === total ? 'PASS' : 'FAIL'}`);
}
