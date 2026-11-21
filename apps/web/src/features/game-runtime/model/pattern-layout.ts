/**
 * Side of one PATTERN cell so the whole row (cells + the blank) fits the board without scrolling.
 * Height allows the row, the choice cards and the title (~3.2 rows). Clamped for touch (≥64px).
 */
export function patternCellSize(
  viewport: { width: number; height: number },
  cellCount: number,
): number {
  const byWidth = (viewport.width - 32) / (cellCount + 1);
  const byHeight = viewport.height / 3.2;
  return Math.min(160, Math.max(64, Math.floor(Math.min(byWidth, byHeight))));
}
