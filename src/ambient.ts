/** Cache soft color fields at a small intrinsic resolution, then composite them.
 * No full-viewport gradient rasterization or canvas drawing occurs per frame. */
export function prepareAmbient(field:HTMLElement,colors:string[]){
 if(field.dataset.paint==='canvas')return;
 const layers:HTMLCanvasElement[]=[];
 for(const [index,color]of colors.slice(0,2).entries()){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;canvas.className='ambient-blob '+(index===0?'ambient-blue':'ambient-plum');canvas.setAttribute('aria-hidden','true');
  const context=canvas.getContext('2d');if(!context)return;
  const gradient=context.createRadialGradient(128,128,0,128,128,128);gradient.addColorStop(0,color);gradient.addColorStop(1,color+'00');context.fillStyle=gradient;context.fillRect(0,0,256,256);layers.push(canvas);
 }
 field.append(...layers);field.dataset.paint='canvas';
}
