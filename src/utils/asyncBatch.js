export const runInBatches = async ({
  items = [],
  batchSize = 25,
  delayMs = 0,
  worker,
  onProgress,
  parallel = false,
}) => {
  if (!Array.isArray(items) || items.length === 0) {
    return { completed: 0, total: 0 };
  }

  const safeBatchSize = Math.max(1, Number(batchSize) || 25);
  let completed = 0;
  for (let index = 0; index < items.length; index += safeBatchSize) {
    const batch = items.slice(index, index + safeBatchSize);
    if (parallel) {
      await Promise.all(batch.map((item) => worker(item)));
    } else {
      for (const item of batch) {
        await worker(item);
      }
    }
    completed += batch.length;
    onProgress?.({ completed, total: items.length });
    if (delayMs > 0 && index + safeBatchSize < items.length) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return { completed, total: items.length };
};
