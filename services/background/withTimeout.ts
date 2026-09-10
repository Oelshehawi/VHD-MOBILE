export async function withTimeout<T>(work: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Background operation timed out')), milliseconds);
    })]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
