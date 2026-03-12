import * as tf from "@tensorflow/tfjs";

let model = null;

/**
 * Attempts to load the shelf model.
 * If the model is missing, it just logs a warning.
 */
export const loadShelfModel = async () => {
  try {
    await tf.ready();
    model = await tf.loadGraphModel("/models/shelf_detector/model.json");
    console.log("Shelf model loaded successfully");
  } catch (err) {
    console.warn("Shelf model not found. Shelf detection will be skipped.", err);
    model = null;
  }
  return model;
};

/**
 * Detects shelves in the video frame.
 * Returns empty array if model is missing.
 */
export const detectShelves = async (video) => {
  if (!model) return [];

  try {
    const tensor = tf.browser.fromPixels(video)
      .resizeBilinear([320, 320])
      .expandDims(0)
      .div(255);

    const result = await model.executeAsync(tensor);

    const boxes = result[0].arraySync()[0];

    tf.dispose(tensor);
    tf.dispose(result);

    return boxes.map(b => ({
      x: b[0],
      y: b[1],
      w: b[2],
      h: b[3]
    }));

  } catch (err) {
    console.warn("Shelf detection failed:", err);
    return [];
  }
};