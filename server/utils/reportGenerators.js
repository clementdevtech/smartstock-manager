const PDFDocument = require("pdfkit");
const { Parser } = require("json2csv");
const ExcelJS = require("exceljs");

/* ================= PDF ================= */
exports.generateBalanceSheetPDF = (data, res) => {
  const doc = new PDFDocument({ margin: 40 });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "attachment; filename=balance-sheet.pdf");

  doc.pipe(res);

  doc.fontSize(18).text("Balance Sheet", { align: "center" });
  doc.moveDown();

  doc.fontSize(12).text(`Period: ${data.period.from} → ${data.period.to}`);
  doc.moveDown();

  doc.text(`Total Sales: ${data.sales.totalSales}`);
  doc.text(`Total Profit: ${data.sales.totalProfit}`);
  doc.text(`Transactions: ${data.sales.transactions}`);
  doc.moveDown();

  doc.text("Expenses:");
  Object.entries(data.expenses).forEach(([k, v]) => {
    doc.text(`  ${k}: ${v}`);
  });

  doc.moveDown();
  doc.fontSize(14).text(`NET PROFIT: ${data.netProfit}`, { underline: true });

  doc.end();
};

/* ================= CSV ================= */
exports.generateCSV = (data) => {
  const parser = new Parser();
  return parser.parse([data]);
};

/* ================= EXCEL ================= */
exports.generateExcel = async (data, res) => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Balance Sheet");

  ws.addRow(["Metric", "Value"]);
  ws.addRow(["Total Sales", data.sales.totalSales]);
  ws.addRow(["Total Profit", data.sales.totalProfit]);
  ws.addRow(["Transactions", data.sales.transactions]);
  ws.addRow(["Net Profit", data.netProfit]);

  ws.addRow([]);
  ws.addRow(["Expenses"]);
  Object.entries(data.expenses).forEach(([k, v]) => {
    ws.addRow([k, v]);
  });

  res.setHeader(
    "Content-Disposition",
    "attachment; filename=balance-sheet.xlsx"
  );

  await wb.xlsx.write(res);
  res.end();
};
