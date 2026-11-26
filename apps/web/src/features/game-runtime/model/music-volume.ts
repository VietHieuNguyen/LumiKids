/** Preserve the player's actual volume, including any future volume preference. */
export function duckMusic(player: Pick<HTMLAudioElement, "volume">): () => void {
  const previous = player.volume;
  player.volume = previous * 0.2;
  return () => { player.volume = previous; };
}
