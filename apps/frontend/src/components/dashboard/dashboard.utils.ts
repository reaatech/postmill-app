export function greetingForUser(name: string, hour: number) {
  if (hour < 5) return `Working late, ${name}?`;
  if (hour < 12) return `Good morning, ${name}`;
  if (hour < 17) return `Good afternoon, ${name}`;
  if (hour < 22) return `Good evening, ${name}`;
  return `Good night, ${name}`;
}
