export const OrchestrationUtil = {
  parseStringifiedJsonFields(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string' && (value.startsWith('{') || value.startsWith('['))) {
        try {
          result[key] = JSON.parse(value);
        } catch {
          result[key] = value;
        }
      } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        result[key] = this.parseStringifiedJsonFields(value as Record<string, unknown>);
      } else {
        result[key] = value;
      }
    }

    return result;
  },
};
