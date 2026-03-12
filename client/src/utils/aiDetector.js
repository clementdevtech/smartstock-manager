import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-backend-webgl";
import "@tensorflow/tfjs-backend-wasm";
import { setWasmPaths } from "@tensorflow/tfjs-backend-wasm";

import * as coco from "@tensorflow-models/coco-ssd";

let model = null;
let backendUsed = null;
let lastRun = 0;

/* ============================================
   CONFIGURE WASM PATH (VITE / ELECTRON SAFE)
============================================ */

setWasmPaths("/wasm/");

/* ============================================
   SMART BACKEND SELECTION
============================================ */

async function selectBackend() {
  // Force CPU in Electron to avoid WebGL errors
  const preferedBackends = ["wasm", "cpu"];

  for (const backend of preferedBackends) {
    try {
      await tf.setBackend(backend);
      await tf.ready();

      backendUsed = backend;
      console.log("AI backend selected:", backend);

      if (backend === "webgl") {
        tf.env().set("WEBGL_FORCE_F16_TEXTURES", true);
        tf.env().set("WEBGL_PACK", true);
      }

      return backend;
    } catch (err) {
      console.warn(`Backend ${backend} failed`, err);
    }
  }

  // Fallback CPU always
  await tf.setBackend("cpu");
  await tf.ready();
  backendUsed = "cpu";
  console.log("AI backend forced to CPU");
  return "cpu";
}

/* ============================================
   LOAD DETECTOR
============================================ */

export const loadAIDetector = async () => {

  if (model) return model;

  await selectBackend();

  model = await coco.load({
    base: "lite_mobilenet_v2"
  });

  console.log("COCO-SSD model loaded using:", backendUsed);

  return model;

};

/* ============================================
   OBJECT DETECTION
============================================ */

export const detectObjects = async (video) => {

  if (!model) return [];

  /* Throttle detection (max ~10 FPS) */

  const now = Date.now();

  if (now - lastRun < 100)
    return [];

  lastRun = now;

  try {

    const predictions = await model.detect(video);

    return predictions.filter(p => p.score > 0.6);

  } catch (err) {

    console.warn("Detection error:", err);
    return [];

  }

};