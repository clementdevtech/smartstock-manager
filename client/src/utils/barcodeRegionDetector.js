let canvas;
let ctx;

let prevFrame = null;
let motionMap = null;

/* ================================
   INIT
================================ */

export const initFastBarcodeDetector = () => {

  canvas = document.createElement("canvas");
  ctx = canvas.getContext("2d", { willReadFrequently: true });

};

/* ================================
   DETECT REGIONS
================================ */

export const detectBarcodeRegions = (video) => {

  if (!video.videoWidth) return [];

  const scale = 320 / video.videoWidth;

  const w = 320;
  const h = Math.floor(video.videoHeight * scale);

  canvas.width = w;
  canvas.height = h;

  ctx.drawImage(video, 0, 0, w, h);

  const img = ctx.getImageData(0, 0, w, h);
  const data = img.data;

  const edges = new Uint8Array(w * h);
  const freq = new Uint8Array(w * h);
  const motion = new Uint8Array(w * h);

  /* ================================
     EDGE DETECTION
  ================================ */

  for (let y = 1; y < h - 1; y++) {

    for (let x = 1; x < w - 1; x++) {

      const i = (y * w + x) * 4;

      const left = data[i - 4];
      const right = data[i + 4];

      const g = Math.abs(right - left);

      if (g > 40)
        edges[y * w + x] = 1;

    }

  }

  /* ================================
     FREQUENCY ANALYSIS
  ================================ */

  for (let y = 0; y < h; y++) {

    let transitions = 0;

    for (let x = 1; x < w; x++) {

      const a = edges[y * w + x];
      const b = edges[y * w + x - 1];

      if (a !== b)
        transitions++;

    }

    if (transitions > 20) {

      for (let x = 0; x < w; x++)
        freq[y * w + x] = 1;

    }

  }

  /* ================================
     MOTION DETECTION
  ================================ */

  if (prevFrame) {

    for (let i = 0; i < data.length; i += 4) {

      const diff =
        Math.abs(data[i] - prevFrame[i]);

      if (diff > 25)
        motion[i / 4] = 1;

    }

  }

  prevFrame = data.slice();

  /* ================================
     COMBINE SIGNALS
  ================================ */

  const regions = [];

  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < h; y++) {

    for (let x = 0; x < w; x++) {

      const idx = y * w + x;

      if (
        edges[idx] &&
        freq[idx] &&
        motion[idx]
      ) {

        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);

      }

    }

  }

  if (maxX > minX && maxY > minY) {

    regions.push({

      x: minX * (video.videoWidth / w),
      y: minY * (video.videoHeight / h),

      width: (maxX - minX) *
        (video.videoWidth / w),

      height: (maxY - minY) *
        (video.videoHeight / h),

      confidence: 0.95

    });

  }

  return regions;

};