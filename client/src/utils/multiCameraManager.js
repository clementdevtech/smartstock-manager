export const startWarehouseCameras = async (max = 4) => {

  try {

    const devices =
      await navigator.mediaDevices.enumerateDevices();

    const cams =
      devices.filter(d => d.kind === "videoinput");

    if (!cams.length) {
      console.warn("No cameras detected");
      return [];
    }

    const streams = [];

    for (const cam of cams.slice(0, max)) {

      try {

        const stream =
          await navigator.mediaDevices.getUserMedia({
            video: {
              deviceId: { exact: cam.deviceId },

              width: { ideal: 1280 },
              height: { ideal: 720 },

              frameRate: { ideal: 30, max: 60 },

              focusMode: "continuous",
              exposureMode: "continuous",
              whiteBalanceMode: "continuous"
            },
            audio: false
          });

        console.log("Camera connected:", cam.label || cam.deviceId);

        streams.push(stream);

      } catch (err) {

        console.warn(
          "Camera failed:",
          cam.label || cam.deviceId,
          err
        );

      }

    }

    return streams;

  } catch (err) {

    console.error("Camera initialization failed:", err);
    return [];

  }

};