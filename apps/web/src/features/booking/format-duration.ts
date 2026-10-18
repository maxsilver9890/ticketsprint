export function formatDuration(milliseconds: number) {
  const safe = Math.max(0, milliseconds);
  const seconds = Math.floor(safe / 1000);
  const centiseconds = Math.floor((safe % 1000) / 10);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
}
