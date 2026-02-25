import { useEffect, useRef, useState, useCallback } from "react";
import Quagga from "@ericblade/quagga2";

const BEEP_URL =
  "https://actions.google.com/sounds/v1/alarms/beep_short.ogg";

const CameraScanner = ({ onDetected, onClose }) => {
  const scannerRef = useRef(null);
  const streamRef = useRef(null);
  const detectedRef = useRef(false);

  const [error, setError] = useState(null);
  const [initializing, setInitializing] = useState(true);
  const [cameraReady, setCameraReady] = useState(false);

  const [continuous, setContinuous] = useState(true);
  const [flash, setFlash] = useState(false);

  const [cameras, setCameras] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState(null);

  const [loadingProduct, setLoadingProduct] = useState(false);

  /* ===============================
     SAFE CLEANUP
  =============================== */
  const stopScanner = useCallback(() => {
    try {
      Quagga.stop();
    } catch {}

    try {
      Quagga.offDetected();
    } catch {}

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const closeScanner = useCallback(() => {
    stopScanner();
    onClose?.();
  }, [stopScanner, onClose]);

  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, [stopScanner]);

  /* ===============================
     SOUND
  =============================== */
  const playBeep = () => {
    const audio = new Audio(BEEP_URL);
    audio.play().catch(() => {});
  };

  /* ===============================
     CAMERA DETECTION
  =============================== */
  const checkCamera = async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) {
        throw new Error("Camera not supported on this browser.");
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(
        (d) => d.kind === "videoinput"
      );

      if (videoDevices.length === 0) {
        throw new Error("No camera detected.");
      }

      setCameras(videoDevices);
      setSelectedCamera(videoDevices[0].deviceId);
      setCameraReady(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setInitializing(false);
    }
  };

  /* ===============================
     OPTIONAL PRODUCT LOOKUP
  =============================== */
  const lookupProduct = async (barcode) => {
    try {
      setLoadingProduct(true);

      const res = await fetch(
        `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`
      );

      const data = await res.json();

      if (data.status === 1) {
        return {
          name: data.product.product_name || "",
          brand: data.product.brands || "",
        };
      }

      return null;
    } catch {
      return null;
    } finally {
      setLoadingProduct(false);
    }
  };

  /* ===============================
     INIT CAMERA LIST
  =============================== */
  useEffect(() => {
    checkCamera();
  }, []);

  /* ===============================
     INIT QUAGGA
  =============================== */
  useEffect(() => {
    if (!cameraReady || !scannerRef.current || !selectedCamera)
      return;

    detectedRef.current = false;

    Quagga.init(
      {
        inputStream: {
          type: "LiveStream",
          target: scannerRef.current,
          constraints: {
            deviceId: selectedCamera,
          },
        },
        decoder: {
          readers: [
            "ean_reader",
            "ean_8_reader",
            "code_128_reader",
            "upc_reader",
            "upc_e_reader",
            "code_39_reader",
            "codabar_reader",
          ],
        },
        locate: true,
      },
      (err) => {
        if (err) {
          setError(
            "Unable to access camera. Please allow permission."
          );
          return;
        }

        Quagga.start();

        const video =
          scannerRef.current.querySelector("video");
        if (video?.srcObject) {
          streamRef.current = video.srcObject;
        }
      }
    );

    const handleDetected = async (data) => {
      const code = data?.codeResult?.code;
      if (!code) return;

      if (!continuous && detectedRef.current) return;

      detectedRef.current = true;

      playBeep();

      setFlash(true);
      setTimeout(() => setFlash(false), 250);

      const product = await lookupProduct(code);

      onDetected?.(code, product);

      if (!continuous) {
        closeScanner();
      } else {
        setTimeout(() => {
          detectedRef.current = false;
        }, 800);
      }
    };

    Quagga.onDetected(handleDetected);

    return () => {
      Quagga.offDetected(handleDetected);
      stopScanner();
    };
  }, [
    cameraReady,
    selectedCamera,
    continuous,
    closeScanner,
    stopScanner,
    onDetected,
  ]);

  /* ===============================
     UI STATES
  =============================== */
  if (initializing) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center text-white">
        Checking camera...
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center text-white text-center p-6">
        <div>
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={closeScanner}
            className="bg-red-500 px-4 py-2 rounded"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Top Bar */}
      <div className="flex justify-between items-center p-3 bg-black/70 text-white gap-3">
        <button onClick={closeScanner}>Close</button>

        {/* Scan Mode Toggle */}
        <button
          onClick={() => setContinuous(!continuous)}
          className="bg-blue-600 px-3 py-1 rounded"
        >
          {continuous ? "Continuous" : "Single"}
        </button>

        {/* Multi Camera Selector */}
        {cameras.length > 1 && (
          <select
            value={selectedCamera}
            onChange={(e) =>
              setSelectedCamera(e.target.value)
            }
            className="bg-black text-white border px-2 py-1 rounded"
          >
            {cameras.map((cam) => (
              <option
                key={cam.deviceId}
                value={cam.deviceId}
              >
                {cam.label || "Camera"}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Scanner Area */}
      <div className="relative flex-1">
        <div ref={scannerRef} className="w-full h-full" />

        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div
            className={`w-72 h-40 border-2 rounded-lg shadow-lg transition-all duration-200 ${
              flash
                ? "border-green-500 scale-105"
                : "border-green-400"
            }`}
          />
        </div>
      </div>

      {/* Bottom Info */}
      <div className="p-3 text-center text-white bg-black/70">
        {loadingProduct
          ? "Looking up product..."
          : continuous
          ? "Continuous scan mode active"
          : "Align barcode inside the box"}
      </div>
    </div>
  );
};

export default CameraScanner;
