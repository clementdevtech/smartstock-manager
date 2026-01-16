module.exports = function generateProductKey() {
  const part = () => Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${part()}-${part()}-${part()}`;
};
