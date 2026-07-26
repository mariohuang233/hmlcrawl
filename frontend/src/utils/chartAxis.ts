export const createSparseCategoryInterval = (
  dataLength: number,
  maxLabels: number
) => {
  if (dataLength <= maxLabels) {
    return () => true;
  }

  const lastIndex = Math.max(dataLength - 1, 0);
  const step = Math.max(1, Math.ceil(lastIndex / Math.max(maxLabels - 1, 1)));

  return (index: number) => (
    index === 0 ||
    index === lastIndex ||
    index % step === 0
  );
};
