import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";

let reader;

const init = () => {
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.CODE_128,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.CODE_39,
    BarcodeFormat.ITF,
    BarcodeFormat.CODABAR,
    BarcodeFormat.QR_CODE,
  ]);
  reader = new BrowserMultiFormatReader(hints);
};

init();

self.onmessage = async (e) => {
  const { imageData } = e.data;
  try {
    const result = await reader.decodeFromImageData(imageData);
    self.postMessage({
      success: true,
      text: result.getText(),
    });
  } catch {
    self.postMessage({ success: false });
  }
};