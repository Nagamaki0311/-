import {escapeXml as esc,layoutSpecs,timelineLayout,rasterPlan,playbackPosition,playbackTime} from './model.js';
const INK='#172f44',RED='#f26654',PAPER='#fff9ec';
const COLORS=['#ffe36c','#b9e6cb','#bddff6','#ffd0bc'];
// ===== SECTION: Shared integrated board renderer =====
function textLines(lines,x,y,size,{weight=400,fill=INK,lineHeight=size*1.5}={}) {
  return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}">${lines.map((line,i)=>`<tspan x="${x}" dy="${i?lineHeight:0}">${esc(line)}</tspan>`).join('')}</text>`;
}
export function traceGeometry(layout,progress=1) {
  const {points}=layout,{index,fraction}=playbackPosition(points.length,progress);
  const visible=points.slice(0,index+1);
  if(points[index+1]){const a=points[index],b=points[index+1];visible.push({x:a.x+(b.x-a.x)*fraction,y:a.y+(b.y-a.y)*fraction});}
  const tip=visible.at(-1)||null;
  return {path:visible.map((p,i)=>`${i?'L':'M'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' '),tip,index};
}
export function timelineSvg(doc,{layout=timelineLayout(doc),interactive=false,selectedId='',progress=1,showLine=true}={}) {
  const {width,height,pad,box,points,bubbles,low,maxAge}=layout;
  const trace=traceGeometry(layout,progress);
  const ticks=low<0?[10,5,0,-5,-10]:[10,8,6,4,2,0];
  const ageTicks=Array.from({length:7},(_,i)=>Math.round(maxAge*i/6)).filter((a,i,ar)=>ar.indexOf(a)===i);
  const axis=ticks.map(n=>{const y=box.y+(10-n)/(10-low)*box.height;return `<line x1="${box.x}" x2="${box.x+box.width}" y1="${y}" y2="${y}" stroke="${n===0?'#a9b8af':'#dddccf'}" stroke-width="${n===0?2:1}" stroke-dasharray="${n===0?'0':'6 7'}"/><text x="${box.x-20}" y="${y+7}" text-anchor="end" font-size="19" fill="#6f7d76">${n}</text>`;}).join('')+ageTicks.map(age=>`<text x="${box.x+age/maxAge*box.width}" y="${box.y+box.height+37}" text-anchor="middle" font-size="19" font-weight="700" fill="${INK}">${age}歳</text>`).join('');
  const connectors=bubbles.map(b=>`<path data-connector="${esc(b.id)}" data-point-x="${b.point.x}" data-point-y="${b.point.y}" d="${b.connector.map((p,i)=>`${i?'L':'M'}${p.x} ${p.y}`).join(' ')}" fill="none" stroke="${['#947318','#467c65','#4b7c99','#ad614b'][b.index%4]}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity=".78"/>`).join('');
  const cards=bubbles.map(b=>{
    const color=COLORS[b.index%COLORS.length],active=b.id===selectedId;
    const periodY=b.y+35,titleY=periodY+(b.periodLines.length-1)*24+39;
    const commentY=titleY+(b.titleLines.length-1)*31+43;
    const label=`${b.index+1}番目 ${b.age}歳 ${b.label} ${b.title||'できごと'} スコア${b.score}${b.comment?' '+b.comment:''}`;
    return `<g class="timeline-event${active?' is-selected':''}" data-event-id="${esc(b.id)}" data-kind="bubble" ${interactive?`tabindex="0" role="button" aria-pressed="${active}" aria-label="${esc(label)}"`:''}><rect x="${b.x+4}" y="${b.y+5}" width="${b.width}" height="${b.height}" rx="13" fill="${INK}" opacity=".12"/><rect class="bubble-outline" x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" rx="13" fill="${color}" stroke="${active?RED:INK}" stroke-width="${active?4:2.5}"/>${textLines(b.periodLines,b.x+24,periodY,16,{weight:700,lineHeight:24})}${textLines(b.titleLines,b.x+20,titleY,22,{weight:900,lineHeight:31})}${b.commentLines.length?textLines(b.commentLines,b.x+20,commentY,18,{fill:'#314c56',lineHeight:27}):''}<circle cx="${b.x+13}" cy="${b.y-9}" r="20" fill="${INK}" stroke="${PAPER}" stroke-width="4"/><text x="${b.x+13}" y="${b.y-2}" text-anchor="middle" font-size="16" font-weight="900" fill="#fff">${String(b.index+1).padStart(2,'0')}</text><rect x="${b.x+b.width-65}" y="${b.y-13}" width="54" height="28" rx="7" fill="${RED}" stroke="${PAPER}" stroke-width="3"/><text x="${b.x+b.width-38}" y="${b.y+7}" text-anchor="middle" font-size="15" font-weight="900" fill="#fff">${b.score>0?'+':''}${b.score}</text></g>`;
  }).join('');
  const marks=points.map((p,i)=>`<g class="timeline-point${p.id===selectedId?' is-selected':''}" data-event-id="${esc(p.id)}" data-kind="point" ${interactive?`tabindex="0" role="button" aria-pressed="${p.id===selectedId}" aria-label="節目${i+1}、${p.age}歳、${esc(p.title||p.label||'できごと')}、スコア${p.score}"`:''}><circle cx="${p.x}" cy="${p.y}" r="21" fill="#172f44" fill-opacity="0"/><circle class="point-core" cx="${p.x}" cy="${p.y}" r="9" fill="${COLORS[i%COLORS.length]}" stroke="${INK}" stroke-width="3"/><text x="${p.x+14}" y="${p.y-12-(i%2)*17}" font-size="14" font-weight="900" fill="${INK}" stroke="${PAPER}" stroke-width="4" paint-order="stroke">${String(i+1).padStart(2,'0')}</text></g>`).join('');
  const headerNameY=112,headerTitleY=headerNameY+layout.nameLines.length*29+38;
  const chartLabelY=box.y-18;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="${interactive?'group':'img'}" aria-label="人生の時期、できごと、コメントと調子をひとつにつないだ人生年表" font-family="sans-serif"><rect width="${width}" height="${height}" rx="12" fill="${PAPER}"/><rect x="14" y="14" width="${width-28}" height="${height-28}" rx="10" fill="none" stroke="${INK}" stroke-width="4"/><path d="M${width-115} 44l6 13 14 3-11 10 2 15-13-7-13 7 3-15-11-10 15-3Z" fill="#ffe36c" stroke="${INK}" stroke-width="2"/><path d="M${width-67} 85l4 9 10 2-8 7 2 10-9-5-9 5 2-10-8-7 10-2Z" fill="${RED}"/><rect x="${pad}" y="46" width="242" height="39" rx="4" fill="${INK}" transform="rotate(-1 ${pad} 46)"/>${textLines(['LIFE IS A SHOW!'],pad+15,73,22,{weight:900,fill:'#fff'})}<text x="${width-pad-90}" y="${height-43}" text-anchor="end" font-size="16" fill="#65796d">人生年表メーカー</text><text x="${width-pad}" y="${height-43}" text-anchor="end" font-size="25" font-weight="900" fill="${RED}">↗</text>${textLines(layout.nameLines,pad,headerNameY,20,{weight:700,lineHeight:29})}${textLines(layout.titleLines,pad,headerTitleY,42,{weight:900,lineHeight:58})}<rect x="${box.x-18}" y="${box.y-10}" width="${box.width+36}" height="${box.height+66}" rx="14" fill="#fffdf6"/>${axis}${textLines(['人生の調子 ↑'],box.x,chartLabelY,15,{weight:700,fill:'#65796d'})}${connectors}<path data-ghost-trace="" d="${traceGeometry(layout,1).path}" stroke="${RED}" stroke-width="5" opacity=".14" stroke-linejoin="round" stroke-linecap="round" fill="none"/><path data-trace="" d="${showLine?trace.path:''}" stroke="${RED}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round" fill="none"/>${marks}${showLine&&trace.tip?`<circle data-trace-tip="" cx="${trace.tip.x}" cy="${trace.tip.y}" r="8" fill="${RED}" pointer-events="none"/>`:'<circle data-trace-tip="" cx="0" cy="0" r="0" fill="'+RED+'" pointer-events="none"/>'}${cards}${!points.length?textLines(['最初の思い出をひとつ、ここに。','節目を追加すると、あなたの物語がつながります。'],pad,box.y+box.height/2,25,{fill:'#718477',lineHeight:43}):''}<text x="${pad}" y="${height-43}" font-size="16" font-weight="700" fill="${INK}">山も、谷も、ぜんぶ見どころ！</text></svg>`;
}
export function exportSvg(doc) { return timelineSvg(doc); }
// ===== SECTION: Bounded browser-local PNG rasterization =====
export async function svgToCanvas(svg,{maxDimension=8192,maxPixels=16000000}={}) {
  const size=svg.match(/^<svg[^>]*\bwidth="([\d.]+)"[^>]*\bheight="([\d.]+)"/);
  if(!size)throw new Error('画像のサイズを読み取れませんでした。');
  const plan=rasterPlan(Number(size[1]),Number(size[2]),{maxDimension,maxPixels});
  // Set the SVG raster dimensions before decoding, retaining its complete vector viewBox.
  const scaled=svg.replace(/^(<svg[^>]*\bwidth=")[^"]+("[^>]*\bheight=")[^"]+/,(match,prefix,middle)=>prefix+plan.width+middle+plan.height);
  const blob=new Blob([scaled],{type:'image/svg+xml;charset=utf-8'}),url=URL.createObjectURL(blob);
  try {
    const img=new Image();img.src=url;await img.decode();
    const canvas=document.createElement('canvas');canvas.width=plan.width;canvas.height=plan.height;
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('画像作成に対応していないブラウザです。SVGで保存してください。');
    ctx.drawImage(img,0,0,plan.width,plan.height);return canvas;
  }finally{URL.revokeObjectURL(url);}
}
export function canvasBlob(canvas,type='image/png') {return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('画像を作成できませんでした。SVG保存をお試しください。')),type));}
export function videoMime() {
  if(typeof MediaRecorder==='undefined'||typeof HTMLCanvasElement==='undefined'||!HTMLCanvasElement.prototype.captureStream)return null;
  return ['video/mp4;codecs=avc1.42E01E','video/mp4','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(t=>MediaRecorder.isTypeSupported(t))||null;
}
// ===== SECTION: Same board in video, with one cached background and a growing line =====
export function drawVideoFrame(ctx,layout,background,progress) {
  const {width,height}=ctx.canvas,scale=Math.min((width-32)/layout.width,(height-32)/layout.height);
  const dx=(width-layout.width*scale)/2,dy=(height-layout.height*scale)/2;
  ctx.fillStyle=PAPER;ctx.fillRect(0,0,width,height);ctx.drawImage(background,dx,dy,layout.width*scale,layout.height*scale);
  ctx.save();ctx.translate(dx,dy);ctx.scale(scale,scale);
  const trace=traceGeometry(layout,progress);
  const {index,fraction}=playbackPosition(layout.points.length,progress),visible=layout.points.slice(0,index+1);
  if(layout.points[index+1]){const a=layout.points[index],b=layout.points[index+1];visible.push({x:a.x+(b.x-a.x)*fraction,y:a.y+(b.y-a.y)*fraction});}
  if(visible.length){ctx.beginPath();visible.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.strokeStyle=RED;ctx.lineWidth=6;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke();ctx.beginPath();ctx.arc(trace.tip.x,trace.tip.y,9,0,Math.PI*2);ctx.fillStyle=RED;ctx.fill();}
  ctx.restore();
}
export async function createVideo(doc,onProgress,signal) {
  const mime=videoMime();if(!mime)throw new Error('このブラウザは動画の作成に対応していません。PNGまたはSVGで保存してください。');
  const layout=timelineLayout(doc),background=await svgToCanvas(timelineSvg(doc,{layout,showLine:false}),{maxDimension:4096,maxPixels:8000000});
  if(signal?.aborted)throw new DOMException('動画作成を中止しました。','AbortError');
  const spec=layoutSpecs[doc.layout],canvas=document.createElement('canvas');canvas.width=spec.width;canvas.height=spec.height;
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('動画用の画像を作成できませんでした。');
  drawVideoFrame(ctx,layout,background,0);
  const stream=canvas.captureStream(24),chunks=[];let recorder;
  try{recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:4000000});}catch(e){stream.getTracks().forEach(t=>t.stop());throw e;}
  let raf=0;const {duration}=playbackTime(doc.events.length,0);
  return new Promise((resolve,reject)=>{
    let aborted=false;
    const abort=()=>{aborted=true;if(recorder.state!=='inactive')recorder.stop();};
    signal?.addEventListener('abort',abort,{once:true});
    const cleanup=()=>{cancelAnimationFrame(raf);stream.getTracks().forEach(t=>t.stop());signal?.removeEventListener('abort',abort);};
    recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
    recorder.onerror=()=>{cleanup();reject(new Error('動画の作成に失敗しました。画像保存をお試しください。'));};
    recorder.onstop=()=>{cleanup();if(aborted)reject(new DOMException('動画作成を中止しました。','AbortError'));else resolve(new Blob(chunks,{type:recorder.mimeType}));};
    recorder.start(250);const start=performance.now();
    const frame=now=>{const elapsed=now-start,{progress,complete}=playbackTime(doc.events.length,elapsed);drawVideoFrame(ctx,layout,background,progress);onProgress(Math.min(1,elapsed/duration));if(!complete)raf=requestAnimationFrame(frame);else recorder.stop();};
    raf=requestAnimationFrame(frame);
  });
}
