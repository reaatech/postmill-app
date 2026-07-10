type TranslateFn = (key: string, fallback: string, vars?: Record<string, unknown>) => string;

export function greetingForUser(name: string, hour: number, t: TranslateFn) {
  if (hour < 5) return t('greeting_working_late', 'Working late, {{name}}?', { name });
  if (hour < 12) return t('greeting_good_morning', 'Good morning, {{name}}', { name });
  if (hour < 17) return t('greeting_good_afternoon', 'Good afternoon, {{name}}', { name });
  if (hour < 22) return t('greeting_good_evening', 'Good evening, {{name}}', { name });
  return t('greeting_good_night', 'Good night, {{name}}', { name });
}
