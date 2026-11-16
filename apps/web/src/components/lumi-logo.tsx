/** The LumiKids mark (same as the landing and login pages). */
export function LumiLogo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="14" fill="#183829" />
      <path d="M16 7.5c1.2 3.6 3.4 5.8 7 7-3.6 1.2-5.8 3.4-7 7-1.2-3.6-3.4-5.8-7-7 3.6-1.2 5.8-3.4 7-7z" fill="#F2C868" />
      <circle cx="23.5" cy="8.5" r="1.6" fill="#BFE3D0" />
    </svg>
  );
}
