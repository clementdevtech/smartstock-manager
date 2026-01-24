import { useEffect, useRef } from "react";

export const useBarcodeScanner = (onScan) => {
  const buffer = useRef("");
  const lastTime = useRef(Date.now());

  useEffect(() => {
    const handler = (e) => {
      const now = Date.now();

      // Reset buffer if typing is slow (human typing)
      if (now - lastTime.current > 100) {
        buffer.current = "";
      }

      lastTime.current = now;

      if (e.key === "Enter") {
        if (buffer.current.length >= 6) {
          onScan(buffer.current);
        }
        buffer.current = "";
        return;
      }

      if (/^[0-9A-Za-z]$/.test(e.key)) {
        buffer.current += e.key;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onScan]);
};
