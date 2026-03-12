import * as tf from "@tensorflow/tfjs";
import * as mobilenet from "@tensorflow-models/mobilenet";

let model;

export const loadProductModel = async () => {

  await tf.ready();

  model = await mobilenet.load();

};

export const recognizeProduct = async (video) => {

  if (!model) return null;

  const predictions =
    await model.classify(video);

  if (!predictions.length) return null;

  return {
    product: predictions[0].className,
    confidence: predictions[0].probability
  };
};