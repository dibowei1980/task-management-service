const isDev = import.meta.env.DEV;

export const logger = {
  error: (context: string, error: unknown) => {
    if (isDev) console.error(`[${context}]`, error);
  },
  warn: (context: string, message: string) => {
    if (isDev) console.warn(`[${context}]`, message);
  },
  info: (context: string, message: string) => {
    if (isDev) console.info(`[${context}]`, message);
  },
};