export function getReminderMaxScrollTop({ scrollHeight, clientHeight }) {
  return Math.max(0, scrollHeight - clientHeight);
}

export function reminderNeedsAutoScroll(metrics, threshold = 1) {
  return getReminderMaxScrollTop(metrics) > threshold;
}

export function advanceReminderScrollTop(currentScrollTop, distance, maxScrollTop) {
  return Math.min(maxScrollTop, currentScrollTop + Math.max(0, distance));
}

export function isReminderScrollAtBottom(scrollTop, maxScrollTop, threshold = 1) {
  return maxScrollTop - scrollTop <= threshold;
}
