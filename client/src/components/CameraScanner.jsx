import {
  useEffect,
  useRef,
  useState
} from "react";

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
import { lookupProduct } from "../utils/productLookup";

const CameraScanner = ({
  onDetected,
  warehouseMode = false
}) => {

  const videoRefs = useRef([]);
  const workers = useRef([]);
  const workerIndex = useRef(0);
  const gpuCanvas = useRef(null);
  const gpuProcessor = useRef(null);

  const pipelineInterval = useRef(null);

  const [scanCount,setScanCount] = useState(0);
  const online = useOnlineStatus();

  const scanHistory = useRef(new Map());

  const hardwareBuffer = useRef("");
  const lastKeyTime = useRef(0);
  const frameCounter = useRef(0);
  const lastObjectDetect = useRef(0);
  const lastShelfDetect = useRef(0);
  const lastProductDetect = useRef(0);

  /* ================================
     DUPLICATE FILTER
  ================================ */

  const isDuplicate = (code) => {

    const now = Date.now();

    if(
      scanHistory.current.has(code) &&
      now - scanHistory.current.get(code) < 500
    ) return true;

    scanHistory.current.set(code,now);
    return false;

  };

  /* ================================
     DETECT HANDLER
  ================================ */

  const handleDetected = (code,source="camera") => {

    if(!code) return;

    if(isDuplicate(code)) return;

    setScanCount(v=>v+1);

    onDetected?.(code,{source});

    if(online)
      sendScan(code);

  };

  /* ================================
     WORKERS
  ================================ */

  const initWorkers = () => {

    const threads =
      navigator.hardwareConcurrency || 4;

    for(let i=0;i<threads;i++){

      const worker = new Worker(
        "/barcodeWorker.js",
        { type:"module" }
      );

      worker.onmessage = ({data}) => {

        if(!data.code) return;

        handleDetected(data.code,"worker");

      };

      workers.current.push(worker);
    }

  };

  /* ================================
     HARDWARE SCANNER
  ================================ */

  const handleHardwareScan = (e)=>{

    const now = Date.now();

    if(now-lastKeyTime.current>50)
      hardwareBuffer.current="";

    lastKeyTime.current=now;

    if(e.key==="Enter"){

      if(hardwareBuffer.current.length>5){

        handleDetected(
          hardwareBuffer.current,
          "hardware"
        );

      }

      hardwareBuffer.current="";
      return;
    }

    if(/^[\w\d]$/.test(e.key))
      hardwareBuffer.current+=e.key;

  };

  /* ================================
     SEND FRAME TO WORKER
  ================================ */

  const sendToWorker = (bitmap) => {

    const worker =
      workers.current[
        workerIndex.current++
        % workers.current.length
      ];

    worker.postMessage(bitmap,[bitmap]);

  };

  /* ================================
     FRAME PROCESSING
  ================================ */

const processFrame = async (video) => {

  if (!video) return;

  try {

    frameCounter.current++;

    // Skip frames to reduce CPU load
    if (frameCounter.current % 2 !== 0) return;

    /* =========================
       GPU PREPROCESS
    ========================= */

    const processed =
      gpuProcessor.current?.process(video);

    if (!processed) return;

    const bitmap =
      await createImageBitmap(processed);

    /* =========================
       BARCODE REGION DETECTION
    ========================= */

    let regions = [];

    try {

      regions =
        await detectBarcodeRegions(video);

    } catch (err) {

      console.warn("Barcode region detection failed", err);

    }

    /* =========================
       CROP REGIONS
    ========================= */

    const crops =
      await cropRegions(bitmap, regions);

    /* =========================
       SEND CROPS TO WORKERS
    ========================= */

    for (const c of crops) {

      if (c)
        sendToWorker(c);

    }

    /* =========================
       SHELF DETECTION (1 FPS)
    ========================= */

    const now = Date.now();

    if (gpuProcessor.current.shelfDetectionEnabled && now - lastShelfDetect.current > 1000) {
        try {
            const shelves = await detectShelves(video);
          } catch (err) {
            console.warn("Shelf detection failed", err);
          }
            lastShelfDetect.current = now;
        }

    /* =========================
       OBJECT DETECTION (5 FPS)
    ========================= */

    if (now - lastObjectDetect.current > 200) {

      let objects = [];

      try {

        objects =
          await detectObjects(video);

      } catch (err) {

        console.warn("Object detection failed", err);

      }

      lastObjectDetect.current = now;

      /* =========================
         PRODUCT RECOGNITION
      ========================= */

      if (objects.length &&
          now - lastProductDetect.current > 800) {

        try {

          const product =
            await recognizeProduct(video);

          if (product) {

            onDetected?.({
              product: product.product,
              confidence: product.confidence
            });

          }

        } catch (err) {

          console.warn("Product recognition failed", err);

        }

        lastProductDetect.current = now;

      }

    }

  } catch (err) {

    console.warn("Frame processing error:", err);

  }

};

  /* ================================
     PIPELINE LOOP
  ================================ */

  const startPipeline = () => {

    pipelineInterval.current =
      setInterval(()=>{

        videoRefs.current.forEach(v=>{

          if(v && v.readyState>2)
            processFrame(v);

        });

      },40); // ~60fps

  };

  /* ================================
     CAMERA INIT
  ================================ */

const initCameras = async () => {

  let streams = [];

  try {

    if (warehouseMode) {

      // Warehouse: multiple cameras
      streams = await startWarehouseCameras(4);

    } else {

      // Get available cameras
      const devices = await navigator.mediaDevices.enumerateDevices();

      const cameras = devices.filter(d => d.kind === "videoinput");

      if (!cameras.length) {
        console.error("No camera found");
        return;
      }

      // Try cameras until one works
      let stream = null;

      for (const cam of cameras) {

        try {

          stream = await navigator.mediaDevices.getUserMedia({
            video: {
                 width: { ideal: 1280 },
                 height: { ideal: 720 },
                 frameRate: { ideal: 30, max: 60 },
                 facingMode: "environment",
                 focusMode: "continuous",
                 exposureMode: "continuous",
                 whiteBalanceMode: "continuous"
            },
            audio: false
          });

          console.log("Camera started:", cam.label);
          break;

        } catch (err) {

          console.warn("Camera failed:", cam.label, err);

        }

      }

      if (!stream) {
        console.error("All cameras failed to start");
        return;
      }

      streams = [stream];

    }

    streams.forEach((stream, i) => {

      const video = videoRefs.current[i];

      if (!video) {
        console.warn("Video element not ready", i);
        return;
      }

      video.srcObject = stream;

      video.onloadedmetadata = async () => {
        try {
          await video.play();
        } catch (err) {
          console.warn("Video play failed", err);
        }
      };

    });

  } catch (err) {

    console.error("Camera initialization failed:", err);

  }

};

  /* ================================
     INIT SYSTEM
  ================================ */

  useEffect(() => {
  const init = async () => {
    await loadAIDetector();
    await initFastBarcodeDetector();
    const shelfModel = null;
    await loadProductModel();

    gpuProcessor.current = new GPUProcessor(gpuCanvas.current);

    initWorkers();

    try {
      await initCameras();
    } catch (err) {
      console.warn("Camera initialization failed:", err);
    }

    startPipeline();

    // store whether shelf detection is enabled
    gpuProcessor.current.shelfDetectionEnabled = !!shelfModel;
  };

  init();
}, []);

  /* ================================
     HARDWARE LISTENER
  ================================ */

  useEffect(()=>{

    document.addEventListener(
      "keydown",
      handleHardwareScan
    );

    return ()=>{

      document.removeEventListener(
        "keydown",
        handleHardwareScan
      );

      clearInterval(pipelineInterval.current);

      workers.current.forEach(w=>w.terminate());

    };

  },[]);

  /* ================================
     UI
  ================================ */

  return(

    <div className={ warehouseMode ? "grid grid-cols-2 gap-2" : "flex justify-center"}>

      <canvas
        ref={gpuCanvas}
        style={{display:"none"}}
      />

      {(warehouseMode ? [0,1,2,3] : [0]).map((i)=>(

        <video
          key={i}
          ref={el=>videoRefs.current[i]=el}
          autoPlay
          playsInline
          className="w-full border rounded"
        />

      ))}

      <div className="col-span-2 text-center p-2 bg-gray-100 rounded">

        Warehouse scans:
        <strong>{scanCount}</strong>

      </div>

    </div>

  );

};

export default CameraScanner;