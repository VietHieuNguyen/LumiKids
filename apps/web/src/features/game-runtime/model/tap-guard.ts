/**
 * Decides whether a card's click is a real tap. A drag ends with a click on mouse but often
 * without one on touch, so the "skip this click" flag is cleared on every new press.
 */
export function createTapGuard() {
  let suppress = false;
  return {
    down() {
      suppress = false;
    },
    up(dragged: boolean) {
      suppress = dragged;
    },
    /** True when the click should fill the blank; `detail === 0` is keyboard activation. */
    click(detail: number): boolean {
      const tap = !suppress || detail === 0;
      suppress = false;
      return tap;
    },
  };
}
