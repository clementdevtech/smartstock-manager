import { useEffect, useRef } from "react";
import Quagga from "quagga";

const CameraScanner = ({ onDetected }) => {
  const ref = useRef(null);

  useEffect(() => {
    Quagga.init(
      {
        inputStream: {
          type: "LiveStream",
          target: ref.current,
        },
        decoder: {
          readers: ["ean_reader", "code_128_reader"],
        },
      },
      (err) => {
        if (!err) Quagga.start();
      }
    );

    Quagga.onDetected((data) => {
      onDetected(data.codeResult.code);
    });

    return () => Quagga.stop();
  }, []);

  return <div ref={ref} className="w-full h-64 bg-black rounded" />;
};

export default CameraScanner;
