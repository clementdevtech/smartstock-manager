export class GPUProcessor{

  constructor(canvas){

    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", {
      willReadFrequently: true
      });

  }

  process(video){

    this.canvas.width = video.videoWidth;
    this.canvas.height = video.videoHeight;

    this.ctx.drawImage(
      video,
      0,
      0,
      this.canvas.width,
      this.canvas.height
    );

    const img =
      this.ctx.getImageData(
        0,
        0,
        this.canvas.width,
        this.canvas.height
      );

    const d = img.data;

    for(let i=0;i<d.length;i+=4){

      const g =
        d[i]*0.299 +
        d[i+1]*0.587 +
        d[i+2]*0.114;

      d[i]=d[i+1]=d[i+2]=
        g>120 ? 255 : 0;
    }

    this.ctx.putImageData(img,0,0);

    return this.canvas;
  }

}