/** Vocabulary for declared educational metadata, not inference from animal names or pixels. */
export const habitatAliases: Record<string, readonly string[]> = {
  LAND: ["land", "trên cạn", "mặt đất", "trên đất"],
  WATER: ["water", "nước", "dưới nước"],
  AIR: ["air", "sky", "bầu trời", "trên trời", "trên không"],
  SAVANNA: ["savanna", "savannah", "thảo nguyên"],
  GRASSLAND: ["grassland", "đồng cỏ"],
  FOREST: ["forest", "jungle", "rừng", "khu rừng"],
  TREE: ["tree", "trees", "trên cây", "cây"],
  SEA: ["sea", "ocean", "biển", "đại dương"],
  RIVER: ["river", "sông"],
  LAKE: ["lake", "hồ"],
  FARM: ["farm", "nông trại", "trang trại"],
  DESERT: ["desert", "sa mạc"],
  ARCTIC: ["arctic", "bắc cực"],
  ANTARCTIC: ["antarctic", "antarctica", "nam cực"],
};
const parents: Record<string, string> = {
  SAVANNA: "LAND",
  GRASSLAND: "LAND",
  FOREST: "LAND",
  TREE: "LAND",
  FARM: "LAND",
  DESERT: "LAND",
  SEA: "WATER",
  RIVER: "WATER",
  LAKE: "WATER",
};
export function habitatConcepts(text: string): string[] {
  const normalized = ` ${text
    .normalize("NFC")
    .toLowerCase()
    // A species name does not request an extra destination group.
    .replace(/gấu\s+bắc\s+cực|polar\s+bears?/gu, " ")
    .replace(/xanh\s+nước\s+biển/gu, " ")
    .replace(/nước\s+biển/gu, "biển")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
  return Object.entries(habitatAliases)
    .filter(([, aliases]) =>
      aliases.some((alias) => normalized.includes(` ${alias} `)),
    )
    .map(([key]) => key);
}
export function expandHabitats(values: readonly string[]): string[] {
  return [
    ...new Set(
      values.flatMap((value) =>
        parents[value] ? [value, parents[value]!] : [value],
      ),
    ),
  ];
}
/** Removes coarse concepts when their more specific descendants are also present. */
export function mostSpecificHabitats(values: readonly string[]): string[] {
  return [...new Set(values)].filter(
    (value) =>
      !values.some((other) => other !== value && parents[other] === value),
  );
}
export function declaredHabitats(
  attributes: Record<string, unknown>,
): string[] {
  return [
    ...new Set(
      ["habitat", "habitats", "specificHabitats"].flatMap((key) => {
        const raw = attributes[key];
        const values = Array.isArray(raw) ? raw : [raw];
        return values.flatMap((value: unknown) =>
          typeof value === "string" ? habitatConcepts(value) : [],
        );
      }),
    ),
  ];
}
