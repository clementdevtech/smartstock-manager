import { useReactToPrint } from "react-to-print";

export const useReceiptPrinter = (ref) =>
  useReactToPrint({
    content: () => ref.current,
    documentTitle: "Receipt",
  });
