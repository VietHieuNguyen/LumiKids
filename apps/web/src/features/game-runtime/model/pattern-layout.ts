/**
 * Side of one PATTERN cell so the whole row (cells + the blank) fits the board without scrolling.
 * `viewport.width` is the row's own content width; the 6px gaps between cells are part of the row.
 * Height allows the row, the choice cards and the title (~3.2 rows).
 */
export const PATTERN_GAP = 6;

export function patternCellSize(
  viewport: { width: number; height: number },
  cellCount: number,
): number {
  const byWidth = (viewport.width - PATTERN_GAP * cellCount) / (cellCount + 1);
  const byHeight = viewport.height / 3.2;
  return Math.min(160, Math.max(48, Math.floor(Math.min(byWidth, byHeight))));
}
