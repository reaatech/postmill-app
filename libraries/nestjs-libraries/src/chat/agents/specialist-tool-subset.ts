/**
 * Pick a subset of tools for a specialist agent.
 * Names may be either the key used in the flat tools map (the tool class's
 * `name` property) or the `id` declared in `createTool()`.
 */
export const pickTools = (
  tools: Record<string, any>,
  names: string[]
): Record<string, any> => {
  const byId = new Map<string, string>();
  for (const [key, tool] of Object.entries(tools)) {
    if (tool?.id && typeof tool.id === 'string') {
      byId.set(tool.id, key);
    }
  }

  const picked: Record<string, any> = {};
  for (const name of names) {
    const key = tools[name] ? name : byId.get(name);
    if (key) {
      picked[key] = tools[key];
    }
  }
  return picked;
};
