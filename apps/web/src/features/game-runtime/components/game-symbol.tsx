import type { GameType } from "@lumikids/shared";

/** Fixed-size, text-free marker for the three existing game modes. */
export function GameSymbol({ type }: { type: GameType }) {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      {type === "COUNTING" ? (
        <>
          <rect
            x="4"
            y="3"
            width="24"
            height="26"
            rx="6"
            fill="#fff"
            stroke="currentColor"
            strokeWidth="2"
          />
          {[10, 16, 22].flatMap((x) =>
            [10, 16, 22].map((y) => (
              <circle
                key={`${x}-${y}`}
                cx={x}
                cy={y}
                r="1.8"
                fill="currentColor"
              />
            )),
          )}
        </>
      ) : type === "MATCHING" ? (
        <>
          <rect
            x="2"
            y="5"
            width="12"
            height="20"
            rx="4"
            fill="#fff"
            stroke="currentColor"
            strokeWidth="2"
          />
          <rect
            x="18"
            y="7"
            width="12"
            height="20"
            rx="4"
            fill="#fff"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            d="m8 13 3 3-3 3m16-5-3 3 3 3M12 16h8"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : (
        <>
          <path
            d="M3 16h11l-1 12H4L3 16Zm15 0h11l-1 12h-9l-1-12Z"
            fill="#fff"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <circle cx="9" cy="7" r="4" fill="#f8bb45" />
          <path d="m24 3 5 8H19l5-8Z" fill="#ee89a6" />
        </>
      )}
    </svg>
  );
}
