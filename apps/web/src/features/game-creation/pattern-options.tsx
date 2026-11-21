"use client";

import type { PatternRule } from "@lumikids/shared";

/** Rules of Chỉ số 46 with the age group each one suits (system.md, k = 5). */
const ruleOptions: { rule: PatternRule; label: string; hint: string }[] = [
  { rule: "AB", label: "AB", hint: "xen kẽ 2 hình · 3–4 tuổi" },
  { rule: "AAB", label: "AAB", hint: "4–5 tuổi" },
  { rule: "ABB", label: "ABB", hint: "4–5 tuổi" },
  { rule: "ABC", label: "ABC", hint: "3 hình · 4–6 tuổi" },
  { rule: "AABB", label: "AABB", hint: "5–6 tuổi" },
  { rule: "ABCD", label: "ABCD", hint: "4 hình · 5–6 tuổi" },
];
const MAX_RULES = 3;

export function PatternOptions({
  rules,
  onRulesChange,
  sequenceCount,
  onSequenceCountChange,
}: {
  rules: PatternRule[];
  onRulesChange: (rules: PatternRule[]) => void;
  sequenceCount: number;
  onSequenceCountChange: (count: number) => void;
}) {
  function toggle(rule: PatternRule) {
    if (rules.includes(rule)) {
      if (rules.length > 1) onRulesChange(rules.filter((value) => value !== rule));
    } else if (rules.length < MAX_RULES) onRulesChange([...rules, rule]);
  }
  return (
    <div className="mt-4 rounded-xl border border-line bg-paper p-3">
      <p className="text-sm font-semibold text-ink">Quy tắc của dãy (chọn tối đa 3)</p>
      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Quy tắc của dãy">
        {ruleOptions.map((option) => {
          const active = rules.includes(option.rule);
          return (
            <button
              key={option.rule}
              type="button"
              aria-pressed={active}
              onClick={() => toggle(option.rule)}
              className={`rounded-lg border px-3 py-1.5 text-left text-sm ${
                active ? "border-leaf bg-leaf-soft font-semibold text-ink" : "border-line bg-white text-ink-soft"
              }`}
            >
              <span className="font-mono">{option.label}</span>
              <span className="ml-1 text-xs">{option.hint}</span>
            </button>
          );
        })}
      </div>
      <label className="mt-3 flex items-center gap-3 text-sm text-ink">
        Số dãy
        <select
          value={sequenceCount}
          onChange={(event) => onSequenceCountChange(Number(event.target.value))}
          className="rounded-lg border border-line bg-white px-2 py-1"
        >
          {[3, 4, 5, 6].map((count) => (
            <option key={count} value={count}>
              {count}
            </option>
          ))}
        </select>
        <span className="text-xs text-ink-soft">Cần ít nhất 5 dãy để chấm Chỉ số 46.</span>
      </label>
    </div>
  );
}
