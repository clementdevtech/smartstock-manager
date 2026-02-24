import { useEffect, useRef, useState, useCallback } from "react";
import Quagga from "@ericblade/quagga2";

const BEEP_URL =
  "https://actions.google.com/sounds/v1/alarms/beep_short.ogg";

const CameraScanner = ({ onDetected, onClose }) => {
  const scannerRef = useRef(null);
  const detectedRef = useRef(false);
  const streamRef = useRef(null);
  const isMountedRef = useRef(true);

  const [loadingProduct, setLoadingProduct] = useState(false);
  const [error, setError] = useState(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [initializing, setInitializing] = useState(true);

  /* ===============================
     SAFE CLEANUP
  =============================== */
  const stopScanner = useCallback(() => {
    try {
      Quagga.offDetected();
      Quagga.stop();
    } catch {}

    // Stop actual media stream tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, []);

  const closeScanner = useCallback(() => {
    stopScanner();
    onClose?.();
  }, [stopScanner, onClose]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      stopScanner();
    };
  }, [stopScanner]);

  /* ===============================
     PLAY BEEP
  =============================== */
  const playBeep = () => {
    const audio = new Audio(BEEP_URL);
    audio.play().catch(() => {});
  };

  /* ===============================
     CAMERA CHECK
  =============================== */
  const checkCamera = async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) {
        throw new Error("Camera not supported on this browser.");
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter(d => d.kind === "videoinput");

      if (cameras.length === 0) {
        throw new Error("No camera detected on this device.");
      }

      setCameraReady(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setInitializing(false);
    }
  };

  /* ===============================
     PRODUCT LOOKUP
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
     INIT
  =============================== */
  useEffect(() => {
    checkCamera();
  }, []);

  useEffect(() => {
    if (!cameraReady || !scannerRef.current) return;

    detectedRef.current = false;

    Quagga.init(
      {
        inputStream: {
          type: "LiveStream",
          target: scannerRef.current,
          constraints: {
            facingMode: "environment",
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
      async (err) => {
        if (err) {
          setError("Unable to access camera. Please allow permission.");
          return;
        }

        Quagga.start();

        // Capture underlying stream for proper shutdown
        const video = scannerRef.current.querySelector("video");
        if (video?.srcObject) {
          streamRef.current = video.srcObject;
        }
      }
    );

    const handleDetected = async (data) => {
      if (detectedRef.current) return;

      detectedRef.current = true;

      const code = data?.codeResult?.code;
      if (!code) return;

      playBeep();

      const product = await lookupProduct(code);

      onDetected?.(code, product);

      closeScanner();
    };

    Quagga.onDetected(handleDetected);

    return () => {
      Quagga.offDetected(handleDetected);
      stopScanner();
    };
  }, [cameraReady, closeScanner, stopScanner, onDetected]);

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
      <div className="fixed inset-0 bg-black flex items-center justify-center text-white p-6 text-center">
        <div>
          <p className="mb-4 text-red-400">{error}</p>
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
      <div className="flex justify-between items-center p-3 bg-black/70 text-white">
        <button onClick={closeScanner}>Close</button>
      </div>

      {/* Scanner */}
      <div className="relative flex-1">
        <div ref={scannerRef} className="w-full h-full" />

        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-72 h-40 border-2 border-green-400 rounded-lg shadow-lg" />
        </div>
      </div>

      {/* Bottom Info */}
      <div className="p-3 text-center text-white bg-black/70">
        {loadingProduct
          ? "Looking up product..."
          : "Align barcode inside the box"}
      </div>
    </div>
  );
};

export default CameraScanner;
