export type RetryOptions = {
  attempts?: number;
  delayMs?: number;
  backoffFactor?: number;
};

export const withRetry = async <T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> => {
  const attempts = options.attempts ?? 3;
  const delayMs = options.delayMs ?? 500;
  const backoffFactor = options.backoffFactor ?? 2;

  let lastError: unknown;

  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i === attempts - 1) break;
      const wait = delayMs * Math.pow(backoffFactor, i);
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }

  throw lastError;
};
