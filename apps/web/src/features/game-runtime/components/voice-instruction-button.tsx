import type { SpeechStatus } from "../../../lib/speech-service";

export function VoiceInstructionButton({ status, disabled, onReplay }: {
  status: SpeechStatus;
  disabled: boolean;
  onReplay: () => void;
}) {
  const unavailable = status === "unsupported" || status === "no-voice" || status === "loading";
  const label = status === "unsupported" ? "Trình duyệt chưa hỗ trợ đọc hướng dẫn"
    : status === "no-voice" ? "Thiết bị chưa có giọng tiếng Việt"
    : status === "loading" ? "Đang tải giọng đọc"
    : status === "speaking" ? "Đang đọc — chạm để nghe lại"
    : status === "error" ? "Chạm để thử nghe hướng dẫn lại" : "Nghe lại hướng dẫn";
  return (
    <button type="button" className="asset-button-secondary game-voice-button" style={{ minWidth: 48, minHeight: 48 }}
      disabled={disabled || unavailable} aria-label={label} title={label} onClick={onReplay}
      data-speaking={status === "speaking" || undefined}>
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M11 5 6 9H3v6h3l5 4V5Z" />
        <path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />
      </svg>
      <span className="sr-only" role="status">{label}</span>
    </button>
  );
}
