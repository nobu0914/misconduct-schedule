const timers: Record<string, ReturnType<typeof setTimeout>> = {};

export function trackEvent(event: string, value: string) {
  fetch("/api/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, value }),
  }).catch(() => {});
}

/** デバウンス付き（検索ワード用。入力が止まって1秒後に送信） */
export function trackEventDebounced(event: string, value: string, delay = 1000) {
  clearTimeout(timers[event]);
  if (!value.trim()) return;
  timers[event] = setTimeout(() => trackEvent(event, value.trim()), delay);
}
