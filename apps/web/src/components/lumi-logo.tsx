/** One brand mark shared by public, staff and children's screens. */
export function LumiLogo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="184 144 876 1056" aria-hidden="true" focusable="false" className="shrink-0" data-lumi-logo="true">
      {/* Frame the supplied transparent artwork without changing the source image. */}
      <image href="/brand/lumikids-logo.png" width="1169" height="1345" />
    </svg>
  );
}

export function LumiWordmark({ className = "" }: { className?: string }) {
  return <span className={`font-display font-extrabold tracking-tight ${className}`}>LumiKids</span>;
}
