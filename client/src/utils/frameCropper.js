export const cropRegions = async (bitmap, regions) => {

  const crops = [];

  for (const r of regions) {

    const crop =
      await createImageBitmap(
        bitmap,
        r.x,
        r.y,
        r.w,
        r.h
      );

    crops.push(crop);

  }

  return crops;
};