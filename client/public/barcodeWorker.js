import { BrowserMultiFormatReader }
from "@zxing/browser";

const reader =
  new BrowserMultiFormatReader({
    delayBetweenScanAttempts:0
  });

self.onmessage = async(e)=>{

  const bitmap=e.data;

  try{

    const result =
      await reader.decodeFromImageBitmap(bitmap);

    self.postMessage({
      code:result?.text || null
    });

  }catch{
    self.postMessage({code:null});
  }

  bitmap.close();
};