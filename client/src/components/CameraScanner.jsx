import { useEffect, useRef, useState, useCallback } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { X, Camera, Zap, Flashlight } from "lucide-react";

/* ======================================================
   ENTERPRISE CAMERA SCANNER
   Retail | Warehouse | Pharmacy | Supermarket
====================================================== */

const CameraScanner = ({
  onDetected,
  onClose,
  storeId,
  continuous = false,
  enableHardware = true,
  autoLookup = true,
  supermarketMode = false,
  pharmacyMode = false,
  warehouseMode = false,
}) => {
  const scannerRef = useRef(null);
  const hardwareBuffer = useRef("");
  const lastKeyTime = useRef(0);
  const lastScanRef = useRef(null);
  const processingRef = useRef(false);
  const startedRef = useRef(false);
  const consecutiveHits = useRef(0);

  const [cameras, setCameras] = useState([]);
  const [activeCamera, setActiveCamera] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [mode, setMode] = useState("camera");

  const [scanCount, setScanCount] = useState(0);
  const [duplicates, setDuplicates] = useState([]);
  const [batchMap, setBatchMap] = useState({});

  /* ======================================================
     INDEXED DB (Offline Cache)
  ====================================================== */

  const openDB = () =>
    new Promise((resolve, reject) => {
      const request = indexedDB.open("smartstock-cache", 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("products");
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = reject;
    });

  const cacheProduct = async (code, data) => {
    const db = await openDB();
    const tx = db.transaction("products", "readwrite");
    tx.objectStore("products").put(data, code);
  };

  const getCachedProduct = async (code) => {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction("products", "readonly");
      const req = tx.objectStore("products").get(code);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  };

  /* ======================================================
     INIT
  ====================================================== */

  useEffect(() => {
    initCameras();
    if (enableHardware) startHardwareListener();
    return () => {
      stopScanner();
      stopHardwareListener();
    };
  }, []);

  const initCameras = async () => {
    try {
      if (startedRef.current) return;
      startedRef.current = true;

      const devices = await Html5Qrcode.getCameras();
      if (!devices?.length) throw new Error("No cameras found");

      setCameras(devices);

      const preferred =
        devices.find((d) =>
          d.label.toLowerCase().includes("back")
        ) || devices[0];

      setActiveCamera(preferred.id);
    } catch (err) {
      console.error("Camera init failed:", err);
    }
  };

  useEffect(() => {
    if (activeCamera && mode === "camera") {
      startScanner(activeCamera);
    }
  }, [activeCamera, mode]);

  /* ======================================================
     START SCANNER
  ====================================================== */

  const startScanner = async (cameraId) => {
    if (scanning || !cameraId) return;

    const scanner = new Html5Qrcode("reader");
    scannerRef.current = scanner;

    try {
      setScanning(true);

      await scanner.start(
        { deviceId: { exact: cameraId } },
        {
          fps: supermarketMode ? 20 : 12,
          qrbox: supermarketMode ? 200 : 250,
          aspectRatio: 1.0,
          experimentalFeatures: {
            useBarCodeDetectorIfSupported: true,
          },
        },
        async (decodedText, result) => {
          await handleDetected(
            decodedText,
            result?.result?.format?.formatName,
            { native: true }
          );
        }
      );
    } catch (err) {
      console.error("Scanner start failed:", err);
      setScanning(false);
    }
  };

  const stopScanner = async () => {
    if (!scannerRef.current) return;
    try {
      await scannerRef.current.stop();
      await scannerRef.current.clear();
    } catch {}
    scannerRef.current = null;
    setScanning(false);
  };

  /* ======================================================
     AI FALLBACK (Native BarcodeDetector)
  ====================================================== */

  const nativeDetector =
    "BarcodeDetector" in window
      ? new window.BarcodeDetector({
          formats: ["ean_13", "upc_a", "code_128", "qr_code"],
        })
      : null;

  const aiFallbackScan = async () => {
    if (!nativeDetector || !scannerRef.current) return null;
    const video = document.querySelector("#reader video");
    if (!video) return null;

    try {
      const results = await nativeDetector.detect(video);
      if (results.length) return results[0].rawValue;
    } catch {}
    return null;
  };

  /* ======================================================
     CONFIDENCE SCORING
  ====================================================== */

  const isValidEAN = (code) => /^\d{13}$/.test(code);

  const calculateConfidence = (code, metadata = {}) => {
    let score = 0;

    if (isValidEAN(code)) score += 40;
    if (metadata.native) score += 25;

    if (lastScanRef.current === code) score -= 30;

    if (consecutiveHits.current > 2) score += 20;

    if (pharmacyMode) score += 10;

    return Math.max(0, Math.min(100, score));
  };

  /* ======================================================
     PRODUCT LOOKUP (Offline First)
  ====================================================== */

  const lookupProduct = async (code) => {
    if (!autoLookup || !storeId) return null;

    const cached = await getCachedProduct(code);
    if (cached) return cached;

    try {
      const res = await fetch(
        `/api/items/lookup/${code}?storeId=${storeId}`
      );
      if (!res.ok) return null;
      const data = await res.json();
      cacheProduct(code, data);
      return data;
    } catch {
      return null;
    }
  };

  /* ======================================================
     HANDLE DETECT
  ====================================================== */

  const handleDetected = useCallback(
    async (code, format, metadata = {}) => {
      if (processingRef.current) return;
      processingRef.current = true;

      if (lastScanRef.current === code && supermarketMode) {
        processingRef.current = false;
        return;
      }

      consecutiveHits.current++;
      lastScanRef.current = code;

      const confidence = calculateConfidence(code, metadata);

      const threshold = pharmacyMode
        ? 80
        : warehouseMode
        ? 55
        : 65;

      if (confidence < threshold) {
        processingRef.current = false;
        return;
      }

      beep();
      setScanCount((p) => p + 1);

      let quantity = 1;

      setBatchMap((prev) => {
        const updated = { ...prev };
        updated[code] = (updated[code] || 0) + 1;
        quantity = updated[code];
        if (updated[code] > 1) {
          setDuplicates((d) =>
            d.includes(code) ? d : [...d, code]
          );
        }
        return updated;
      });

      const product = await lookupProduct(code);

      if (!continuous) await stopScanner();

      onDetected?.(code, {
        product,
        quantity,
        confidence,
        format,
      });

      if (!continuous) setTimeout(() => onClose?.(), 300);

      processingRef.current = false;
    },
    [continuous, supermarketMode, pharmacyMode, warehouseMode]
  );

  /* ======================================================
     HARDWARE WEDGE
  ====================================================== */

  const hardwareHandler = (e) => {
    const now = Date.now();
    if (now - lastKeyTime.current > 50)
      hardwareBuffer.current = "";
    lastKeyTime.current = now;

    if (e.key === "Enter") {
      if (hardwareBuffer.current.length > 5) {
        handleDetected(hardwareBuffer.current, "HARDWARE", {
          native: false,
        });
      }
      hardwareBuffer.current = "";
      return;
    }

    if (/^[\w\d]$/.test(e.key)) {
      hardwareBuffer.current += e.key;
    }
  };

  const startHardwareListener = () =>
    document.addEventListener("keydown", hardwareHandler);

  const stopHardwareListener = () =>
    document.removeEventListener("keydown", hardwareHandler);

  /* ======================================================
     BEEP
  ====================================================== */

  const beep = () => {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      osc.frequency.value = 1200;
      osc.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.06);
    } catch {}
  };

  /* ======================================================
     TORCH
  ====================================================== */

  const toggleTorch = async () => {
    if (!scannerRef.current) return;
    try {
      await scannerRef.current.applyVideoConstraints({
        advanced: [{ torch: !torchOn }],
      });
      setTorchOn((p) => !p);
    } catch {
      alert("Torch not supported.");
    }
  };

  /* ======================================================
     UI
  ====================================================== */

  return (
    <div className="bg-white dark:bg-gray-900 p-4 rounded-xl space-y-3 shadow-lg">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold flex items-center gap-2">
          <Zap size={18} /> Enterprise Scanner
        </h3>

        <div className="flex gap-3">
          <button onClick={() => setMode("camera")}>
            <Camera size={18} />
          </button>

          <button onClick={() => setMode("hardware")}>
            <Zap size={18} />
          </button>

          <button onClick={toggleTorch}>
            <Flashlight size={18} />
          </button>

          <button
            onClick={() => {
              stopScanner();
              onClose?.();
            }}
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {continuous && (
        <div className="text-sm bg-blue-100 p-2 rounded">
          📊 Scanned: <strong>{scanCount}</strong>
        </div>
      )}

      {duplicates.length > 0 && (
        <div className="text-sm bg-red-100 p-2 rounded">
          🧠 Duplicate SKUs: {duplicates.join(", ")}
        </div>
      )}

      {mode === "camera" && (
        <>
          {cameras.length > 1 && (
            <select
              className="w-full p-2 border rounded-md"
              value={activeCamera || ""}
              onChange={(e) => {
                stopScanner();
                setActiveCamera(e.target.value);
              }}
            >
              {cameras.map((cam) => (
                <option key={cam.id} value={cam.id}>
                  {cam.label || cam.id}
                </option>
              ))}
            </select>
          )}

          <div
            id="reader"
            className="rounded-lg overflow-hidden"
            style={{ width: "100%", minHeight: "300px" }}
          />
        </>
      )}

      {mode === "hardware" && (
        <div className="text-center p-6 text-gray-500">
          Waiting for hardware scanner input...
        </div>
      )}
    </div>
  );
};

export default CameraScanner;