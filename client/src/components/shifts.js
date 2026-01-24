export const ShiftManager = {
  start() {
    localStorage.setItem("shiftStart", Date.now());
    localStorage.setItem("shiftSales", "[]");
  },

  recordSale(sale) {
    const sales = JSON.parse(localStorage.getItem("shiftSales") || "[]");
    sales.push(sale);
    localStorage.setItem("shiftSales", JSON.stringify(sales));
  },

  end() {
    const sales = JSON.parse(localStorage.getItem("shiftSales") || "[]");
    const total = sales.reduce((s, i) => s + i.total, 0);

    const report = {
      startedAt: localStorage.getItem("shiftStart"),
      endedAt: Date.now(),
      transactions: sales.length,
      total,
    };

    localStorage.removeItem("shiftStart");
    localStorage.removeItem("shiftSales");

    return report;
  },
};
