exports.calculateTrend = (values = []) => {
  if (values.length < 2) return 0;

  const first = values[values.length - 1];
  const last = values[0];

  return (last - first) / first;
};
