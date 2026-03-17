export const cropRegions = async (bitmap, regions) => {

  const crops = [];

  for (const r of regions) {

    // Validate crop region
    if (
      !r ||
      r.w <= 0 ||
      r.h <= 0 ||
      r.x < 0 ||
      r.y < 0 ||
      r.x + r.w > bitmap.width ||
      r.y + r.h > bitmap.height
    ) {
      continue;
    }

    try {

      const crop = await createImageBitmap(
        bitmap,
        r.x,
        r.y,
        r.w,
        r.h
      );

      crops.push(crop);

    } catch (err) {

      console.warn("Crop failed:", r, err);

    }

  }

  return crops;

};