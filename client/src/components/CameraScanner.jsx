import {
  useEffect,
  useRef,
  useState
} from "react";

import { BrowserMultiFormatReader } from "@zxing/browser";

import {
  loadAIDetector,
  detectObjects
} from "../utils/aiDetector";

import {
  detectBarcodeRegions,
  initFastBarcodeDetector
} from "../utils/barcodeRegionDetector";

import {
  loadShelfModel,
  detectShelves
} from "../utils/shelfDetector";

import {
  recognizeProduct,
  loadProductModel
} from "../utils/productRecognizer";

import { GPUProcessor } from "../utils/gpuProcessor";
import { cropRegions } from "../utils/frameCropper";
import { startWarehouseCameras } from "../utils/multiCameraManager";

import { sendScan } from "../utils/api";
import useOnlineStatus from "../utils/useOnlineStatus";

const CameraScanner = ({ onDetected, warehouseMode = false }) => {

  const videoRefs = useRef([]);
  const gpuCanvas = useRef(null);
  const gpuProcessor = useRef(null);

  const codeReader = useRef(null);

  const workers = useRef([]);
  const workerIndex = useRef(0);

  const scanHistory = useRef(new Map());
  const trackedCodes = useRef(new Map());
  const itemCounts = useRef(new Map());

  const zoomState = useRef({
    active: false,
    x: 0,
    y: 0,
    scale: 1
  });

  const hardwareBuffer = useRef("");
  const lastKeyTime = useRef(0);

  const lastAI = useRef(0);

  const [scanCount, setScanCount] = useState(0);
  const [, forceRender] = useState(0);

  const online = useOnlineStatus();

  /* ================================
     DUPLICATE FILTER
  ================================ */

  const isDuplicate = (code) => {
    const now = Date.now();
    if (scanHistory.current.has(code) &&
        now - scanHistory.current.get(code) < 120)
      return true;

    scanHistory.current.set(code, now);
    return false;
  };

  /* ================================
     TRACKING + CONFIDENCE
  ================================ */

  const updateTracking = (code, bbox) => {
    const now = Date.now();

    const prev = trackedCodes.current.get(code) || {
      hits: 0,
      confidence: 0
    };

    const hits = prev.hits + 1;
    const confidence = Math.min(1, hits / 5);

    trackedCodes.current.set(code, {
      bbox,
      lastSeen: now,
      hits,
      confidence
    });

    trackedCodes.current.forEach((v, k) => {
      if (now - v.lastSeen > 1000) {
        trackedCodes.current.delete(k);
      }
    });
  };

  /* ================================
     ITEM COUNTING AI
  ================================ */

  const updateItemCount = (code) => {
    const now = Date.now();

    const entry = itemCounts.current.get(code) || {
      count: 0,
      lastSeen: now
    };

    entry.count += 1;
    entry.lastSeen = now;

    itemCounts.current.set(code, entry);

    itemCounts.current.forEach((v, k) => {
      if (now - v.lastSeen > 2000) {
        itemCounts.current.delete(k);
      }
    });
  };

  const getClusteredCounts = () => {
    const result = {};
    itemCounts.current.forEach((v, k) => {
      result[k] = v.count;
    });
    return result;
  };

  /* ================================
     DETECT HANDLER
  ================================ */

  const handleDetected = (code, source = "camera", bbox = null) => {

    if (!code) return;
    if (isDuplicate(code)) return;

    if (bbox) updateTracking(code, bbox);

    updateItemCount(code);

    setScanCount(v => v + 1);

    onDetected?.({
      code,
      source,
      tracked: trackedCodes.current.get(code),
      count: itemCounts.current.get(code)?.count || 1
    });

    if (online) sendScan(code);

    forceRender(v => v + 1);
  };

  /* ================================
     FAST SCAN + AUTO ZOOM
  ================================ */

  const fastScan = async (video) => {
    try {
      const result =
        await codeReader.current.decodeFromVideoElement(video);

      if (result) {

        const points = result.getResultPoints?.() || [];

        if (points.length) {
          const x = points[0].getX();
          const y = points[0].getY();

          zoomState.current = {
            active: true,
            x,
            y,
            scale: 1.8
          };

          handleDetected(result.getText(), "zxing", { x, y });
        }

      } else {
        zoomState.current.scale *= 0.95;
        if (zoomState.current.scale < 1.05) {
          zoomState.current.active = false;
          zoomState.current.scale = 1;
        }
      }

    } catch {}
  };

  /* ================================
     MULTI BARCODE
  ================================ */

  const multiScan = async (video) => {
    try {
      const regions = await detectBarcodeRegions(video);
      if (!regions?.length) return;

      const processed =
        gpuProcessor.current?.process(video);

      const bitmap =
        await createImageBitmap(processed || video);

      const crops =
        await cropRegions(bitmap, regions);

      for (const crop of crops) {
        if (!crop) continue;

        const worker =
          workers.current[
            workerIndex.current++ %
            workers.current.length
          ];

        worker.postMessage(crop, [crop]);
      }

    } catch {}
  };

  /* ================================
     AI LAYER
  ================================ */

  const runAI = async (video) => {
    const now = Date.now();
    if (now - lastAI.current < 300) return;
    lastAI.current = now;

    try {
      if (warehouseMode) {
        await detectShelves(video);
      }

      const objects = await detectObjects(video);

      if (objects?.length) {
        const product =
          await recognizeProduct(video);

        if (product) {
          onDetected?.({
            product: product.product,
            confidence: product.confidence
          });
        }
      }

    } catch {}
  };

  /* ================================
     HARDWARE SCANNER
  ================================ */

  const handleHardwareScan = (e) => {
    const now = Date.now();

    if (now - lastKeyTime.current > 50)
      hardwareBuffer.current = "";

    lastKeyTime.current = now;

    if (e.key === "Enter") {
      if (hardwareBuffer.current.length > 5) {
        handleDetected(
          hardwareBuffer.current,
          "hardware"
        );
      }
      hardwareBuffer.current = "";
      return;
    }

    if (/^[\w\d\-]$/.test(e.key))
      hardwareBuffer.current += e.key;
  };

  /* ================================
     WORKERS
  ================================ */

  const initWorkers = () => {
    const threads =
      navigator.hardwareConcurrency || 4;

    for (let i = 0; i < threads; i++) {
      const worker = new Worker(
        "/barcodeWorker.js",
        { type: "module" }
      );

      worker.onmessage = ({ data }) => {
        if (!data.code) return;
        handleDetected(data.code, "worker");
      };

      workers.current.push(worker);
    }
  };

  /* ================================
     LOOP
  ================================ */

  const loop = () => {

    videoRefs.current.forEach((video) => {

      if (!video || video.readyState < 2) return;

      fastScan(video);
      multiScan(video);
      runAI(video);

    });

    requestAnimationFrame(loop);
  };

  /* ================================
     CAMERA INIT
  ================================ */

  const initCameras = async () => {

    let streams = [];

    if (warehouseMode) {
      streams = await startWarehouseCameras(4);
    } else {
      const stream =
        await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "environment",
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 60 },
            focusMode: "continuous"
          },
          audio: false
        });

      streams = [stream];
    }

    streams.forEach((stream, i) => {
      const video = videoRefs.current[i];
      if (!video) return;
      video.srcObject = stream;
      video.play().catch(() => {});
    });
  };

  /* ================================
     INIT
  ================================ */

  useEffect(() => {

    const init = async () => {

      codeReader.current =
        new BrowserMultiFormatReader();

      await loadAIDetector();
      await initFastBarcodeDetector();
      await loadProductModel();
      await loadShelfModel();

      gpuProcessor.current =
        new GPUProcessor(gpuCanvas.current);

      initWorkers();
      await initCameras();

      loop();
    };

    init();

    document.addEventListener(
      "keydown",
      handleHardwareScan
    );

    return () => {
      workers.current.forEach(w => w.terminate());
      document.removeEventListener(
        "keydown",
        handleHardwareScan
      );
    };

  }, []);

  /* ================================
     UI
  ================================ */

  return (
    <div className={warehouseMode
      ? "grid grid-cols-2 gap-2"
      : "flex justify-center"}>

      <canvas ref={gpuCanvas} style={{ display: "none" }} />

      {(warehouseMode ? [0,1,2,3] : [0]).map(i => (

        <video
          key={i}
          ref={el => videoRefs.current[i] = el}
          autoPlay
          playsInline
          className="w-full border rounded"
          style={{
            transform: zoomState.current.active
              ? `scale(${zoomState.current.scale}) translate(-${zoomState.current.x / 4}px, -${zoomState.current.y / 4}px)`
              : "scale(1)"
          }}
        />

      ))}

      <div className="col-span-2 text-center p-2 bg-gray-100 rounded">
        Scans: <strong>{scanCount}</strong>

        <div className="text-xs mt-2">
          {Object.entries(getClusteredCounts()).map(([code, count]) => (
            <div key={code}>
              {code}: {count}
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};

export default CameraScanner;