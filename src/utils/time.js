export function addMinutes(date, minutes) {
  const result = new Date(date);
  result.setMinutes(result.getMinutes() + minutes);
  return result;
}

export function addHours(date, hours) {
  const result = new Date(date);
  result.setHours(result.getHours() + hours);
  return result;
}

export function formatDateTime(dateLike) {
  const date = new Date(dateLike);

  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

export function formatDurationSince(dateLike) {
  if (!dateLike) return 'chưa có dữ liệu';

  const target = new Date(dateLike).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - target);
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));

  if (days === 0) return 'hôm nay';
  if (days < 30) return `${days} ngày`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months} tháng`;

  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  return remMonths ? `${years} năm ${remMonths} tháng` : `${years} năm`;
}
