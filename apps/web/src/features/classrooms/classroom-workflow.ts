import { ageInMonths } from "@lumikids/shared";
import type { ChildProfile } from "@lumikids/shared";

export type RosterFilter = "all" | "missing-code" | "disabled";

function searchable(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replaceAll("đ", "d").trim();
}

export function childNameMatches(fullName: string, query: string): boolean {
  const name = searchable(fullName);
  return searchable(query).split(/\s+/).every((word) => name.includes(word));
}

export function childMatches(child: Pick<ChildProfile, "fullName" | "status" | "loginCodeIssuedAt">, query: string, filter: RosterFilter): boolean {
  if (filter === "missing-code" && (child.status !== "ACTIVE" || child.loginCodeIssuedAt)) return false;
  if (filter === "disabled" && child.status !== "DISABLED") return false;
  return childNameMatches(child.fullName, query);
}

export function openingAgeBand(children: { dob: string }[], opensOn: string): 3 | 4 | 5 | "mixed" | "unsupported" | null {
  if (!children.length) return null;
  // The date picker already represents a Vietnamese calendar date.
  const day = new Date(`${opensOn}T00:00:00Z`);
  const ages = new Set(children.map((child) => Math.floor(ageInMonths(child.dob, day) / 12)));
  if ([...ages].some((age) => age !== 3 && age !== 4 && age !== 5)) return "unsupported";
  if (ages.size > 1) return "mixed";
  return [...ages][0] as 3 | 4 | 5;
}
