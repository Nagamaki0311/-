import {SCORE_TICKS,escapeXml as esc,layoutSpecs,timelineLayout,rasterPlan,playbackPosition,playbackTime} from './model.js';
const sans = 'system-ui, sans-serif';
const serif = 'Noto Serif CJK JP, Hiragino Mincho ProN, Yu Mincho, serif';
const designs = {
  A: {paper:'#ffffff', plot:'#ffffff', ink:'#14171c', line:'#2456d3', grid:'#dde2e7', edge:'#c9d2e0', muted:'#505a65', cards:['#f8fafd'], radius:4, font:sans, shadow:false, opacity:.10, weight:700},
  B: {paper:'#101824', plot:'#101824', ink:'#f5f7fa', line:'#ffce61', grid:'#34465c', edge:'#526680', muted:'#b9c6d8', cards:['#1c293a'], radius:6, font:sans, shadow:false, opacity:.11, weight:700},
  C: {paper:'#ecf4f2', plot:'#ecf4f2', ink:'#15302b', line:'#15785e', grid:'#bbccc6', edge:'#a2bfb3', muted:'#45635a', cards:['#fafffd'], radius:0, font:serif, shadow:false, opacity:.13, weight:700},
  D: {paper:'#eff5ff', plot:'#ffffff', ink:'#221344', line:'#db2169', grid:'#c5cfe3', edge:'#382567', muted:'#49376b', cards:['#fff36a','#9cefff','#ffc3eb','#bdf084'], radius:14, font:sans, shadow:true, opacity:0, weight:900},
  E: {paper:'#101719', plot:'#131e21', ink:'#e2f0ef', line:'#55df9a', down:'#ff7d86', grid:'#2e4547', edge:'#597377', muted:'#a7c0bf', cards:['#172528'], radius:0, font:'ui-monospace, monospace', shadow:false, opacity:0, weight:700}
};
function outputDesign(id) {return Object.hasOwn(designs,id) ? designs[id] : designs.A;}

function segmentColor(design, previous, next) {
  return design.down && next.y > previous.y ? design.down : design.line;
}

export function traceSegments(points, designId) {
  const design = outputDesign(designId);
  if (!design.down) return '';
  return points.slice(1).map((point, i) => {
    const previous = points[i];
    return `<path d="M${previous.x} ${previous.y} L${point.x} ${point.y}" stroke="${segmentColor(design,previous,point)}" stroke-width="6.5" stroke-linecap="round" fill="none"/>`;
  }).join('');
}
// ===== SECTION: Shared continuous panorama renderer =====
function textLines(lines,x,y,size,{weight=400,fill,lineHeight=size*1.5}={}) {
  return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}"${fill?` fill="${fill}"`:''}>${lines.map((line,i)=>`<tspan x="${x}" dy="${i?lineHeight:0}">${esc(line)}</tspan>`).join('')}</text>`;
}
export function traceGeometry(layout,progress=1) {
  const {index,visible:points}=tracePoints(layout.points,progress);
  const visible=points.map(point=>({...point}));
  const tip=visible.at(-1)||null,path=visible.map((point,i)=>`${i?'L':'M'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
  const zeroY=layout.box.y+10/(10-layout.low)*layout.box.height;
  const area=visible.length?`${path} L${tip.x} ${zeroY} L${visible[0].x} ${zeroY} Z`:'';
  return {path,area,tip,index,visible};
}
function tracePoints(points,progress) {
  const {index,fraction}=playbackPosition(points.length,progress);
  const visible=points.slice(0,index+1);
  if(points[index+1]){const a=points[index],b=points[index+1];visible.push({...b,x:a.x+(b.x-a.x)*fraction,y:a.y+(b.y-a.y)*fraction});}
  return {index,visible};
}
export function timelineSvg(doc,{layout=timelineLayout(doc),interactive=false,selectedId='',progress=1,showLine=true,maxVisibleIndex=Infinity,showGhost=true}={}) {
  const {width,height,pad,points,bubbles,low,box,minAge,maxAge}=layout,trace=traceGeometry(layout,progress);
  const design=outputDesign(doc.design), {ink:INK,line:RED,paper:PAPER,cards:COLORS}=design;
  const ticks=SCORE_TICKS;
  const ages=new Map(points.map(point=>[point.age,point.x]));
  const gapY=box.y+box.height+29;
  const gapMarkers=layout.breaks.map(({x,from,to})=>`<g data-age-break="" role="img" aria-label="${from}歳から${to}歳までの間隔を短縮"><rect x="${x-20}" y="${gapY-15}" width="40" height="22" fill="${PAPER}"/><path d="M${x-12} ${gapY+5}l9 -18m5 18l9 -18" stroke="${INK}" stroke-width="3"/></g>`).join('');
  const axes=`<g data-panorama-axis=""><text x="${pad}" y="${box.y-60}" font-size="18" font-weight="700" fill="${INK}">人生の調子</text><text x="${width-pad}" y="${box.y-60}" text-anchor="end" font-size="16" fill="${design.muted}">${minAge===maxAge?minAge+'歳':minAge+'〜'+maxAge+'歳'}</text><rect x="${box.x-25}" y="${box.y-12}" width="${box.width+50}" height="${box.height+52}" rx="6" fill="${design.plot}"/>${ticks.map(n=>{const y=box.y+(10-n)/(10-low)*box.height;return `<line x1="${box.x}" x2="${box.x+box.width}" y1="${y}" y2="${y}" stroke="${n===0?design.edge:design.grid}" stroke-width="${n===0?2:1}" stroke-dasharray="${n===0||design.down?'0':'5 8'}"/>`;}).join('')}${design.down?[...ages.values()].map(x=>`<line x1="${x}" x2="${x}" y1="${box.y}" y2="${box.y+box.height}" stroke="${design.grid}"/>`).join(''):''}${[...ages].map(([age,x])=>`<text x="${x}" y="${box.y+box.height+32}" text-anchor="middle" font-size="18" font-weight="700" fill="${INK}" stroke="${PAPER}" stroke-width="4" paint-order="stroke">${age}歳</text>`).join('')}${gapMarkers}</g>`;
  const visibleBubbles=bubbles.filter(b=>b.index<=maxVisibleIndex);
  const connectors=visibleBubbles.map(b=>`<path data-connector="${esc(b.id)}" data-point-x="${b.point.x}" data-point-y="${b.point.y}" d="${b.connector.map((point,i)=>`${i?'L':'M'}${point.x} ${point.y}`).join(' ')}" fill="none" stroke="${design.edge}" stroke-width="1.7" stroke-linejoin="round" opacity=".72"/>`).join('');
  const cards=visibleBubbles.map(b=>{
    const color=COLORS[b.index%COLORS.length],active=b.id===selectedId;
    const periodY=b.y+31,periodBottom=periodY+(b.periodLines.length-1)*24,titleY=periodBottom+36,commentY=b.titleLines.length?titleY+(b.titleLines.length-1)*30+38:periodBottom+32;
    const label=`節目${b.index+1} ${b.age}歳 ${b.label} ${b.title} スコア${b.score}${b.comment?' '+b.comment:''}`;
    return `<g class="timeline-event${active?' is-selected':''}" data-event-id="${esc(b.id)}" data-event-index="${b.index}" data-kind="bubble" ${interactive?`tabindex="0" role="button" aria-pressed="${active}" aria-label="${esc(label)}"`:''}>${design.shadow?`<rect x="${b.x+5}" y="${b.y+6}" width="${b.width}" height="${b.height}" rx="${design.radius}" fill="${INK}"/>`:''}<rect class="bubble-outline" x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" rx="${design.radius}" fill="${color}" data-border="${design.edge}" data-active-border="${RED}" stroke="${active?RED:design.edge}" stroke-width="${active?4:2}"/>${textLines(b.periodLines,b.x+20,periodY,16,{weight:700,lineHeight:24})}${b.titleLines.length?textLines(b.titleLines,b.x+20,titleY,21,{weight:700,lineHeight:30}):''}${b.commentLines.length?textLines(b.commentLines,b.x+20,commentY,18,{fill:design.muted,lineHeight:26}):''}</g>`;
  }).join('');
  const marks=points.filter((point,index)=>index<=maxVisibleIndex).map((point,index)=>{
    return `<g class="timeline-point${point.id===selectedId?' is-selected':''}" data-event-id="${esc(point.id)}" data-kind="point" ${interactive?`tabindex="0" role="button" aria-pressed="${point.id===selectedId}" aria-label="節目${index+1}、${point.age}歳、${esc(point.title||point.label||'未入力')}、スコア${point.score}"`:''}><circle cx="${point.x}" cy="${point.y}" r="22" fill="${INK}" fill-opacity="0"/><circle class="point-core" cx="${point.x}" cy="${point.y}" r="9" fill="${COLORS[index%COLORS.length]}" stroke="${INK}" stroke-width="3"/></g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="${interactive?'group':'img'}" aria-label="時期、出来事、コメントと折れ線が左から右につながる人生年表" font-family="${design.font}" fill="${INK}" data-design="${esc(doc.design||'A')}"><rect width="${width}" height="${height}" rx="8" fill="${PAPER}"/>${design.shadow?`<rect x="12" y="12" width="${width-24}" height="${height-24}" rx="6" fill="none" stroke="${INK}" stroke-width="3"/>`:''}${textLines(layout.titleLines,pad,66,38,{weight:design.weight,lineHeight:50})}${axes}${showGhost?`<path data-ghost-trace="" d="${traceGeometry(layout,1).path}" stroke="${RED}" stroke-width="6.5" opacity=".1" fill="none"/>`:''}<path data-area="" d="${showLine?trace.area:''}" fill="${RED}" opacity="${design.opacity}"/>${connectors}<path data-trace="" d="${showLine&&!design.down?trace.path:''}" stroke="${RED}" stroke-width="6.5" stroke-linejoin="round" stroke-linecap="round" fill="none"/><g data-trace-segments="">${showLine?traceSegments(trace.visible,doc.design):''}</g>${marks}${showLine&&trace.tip?`<circle data-trace-tip="" cx="${trace.tip.x}" cy="${trace.tip.y}" r="8" fill="${RED}" pointer-events="none"/>`:'<circle data-trace-tip="" cx="0" cy="0" r="0" fill="'+RED+'" pointer-events="none"/>'}${cards}${!points.length?textLines(['節目を追加すると年表が表示されます。'],pad,box.y+80,24,{fill:design.muted}):''}</svg>`;
}
export function exportSvg(doc) {return timelineSvg(doc);}
// ===== SECTION: Bounded browser-local PNG rasterization =====
export async function svgToCanvas(svg,{maxDimension=8192,maxPixels=16000000}={}) {
  const size=svg.match(/^<svg[^>]*\bwidth="([\d.]+)"[^>]*\bheight="([\d.]+)"/);
  if(!size)throw new Error('画像のサイズを読み取れませんでした。');
  const plan=rasterPlan(Number(size[1]),Number(size[2]),{maxDimension,maxPixels});
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
export function xImageLayout(width, height) {
  // Bound the entire panorama first, then add padding on its shorter axis.
  const scale = Math.min(1, 2048 / Math.max(width, height));
  const contentWidth = Math.max(1, Math.round(width * scale));
  const contentHeight = Math.max(1, Math.round(height * scale));
  const frameWidth = Math.max(contentWidth, Math.ceil(contentHeight / 3));
  const frameHeight = Math.max(contentHeight, Math.ceil(contentWidth / 3));
  return {
    width: frameWidth,
    height: frameHeight,
    contentWidth,
    contentHeight,
    x: Math.floor((frameWidth - contentWidth) / 2),
    y: Math.floor((frameHeight - contentHeight) / 2)
  };
}

export async function exportXImage(doc) {
  const source = await svgToCanvas(exportSvg(doc), {maxDimension: 2048, maxPixels: 2048 ** 2});
  const frame = xImageLayout(source.width, source.height);
  const canvas = document.createElement('canvas');
  canvas.width = frame.width;
  canvas.height = frame.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('画像を作成できませんでした。');
  ctx.fillStyle = outputDesign(doc.design).paper;
  ctx.fillRect(0, 0, frame.width, frame.height);
  ctx.drawImage(source, frame.x, frame.y, frame.contentWidth, frame.contentHeight);
  for (const quality of [0.92, 0.78, 0.6]) {
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (blob?.type === 'image/jpeg' && blob.size > 0 && blob.size < 5_000_000) return blob;
  }
  throw new Error('5MB未満のJPEGを作成できませんでした。');
}

function mediaRecorderMime() {
  if(typeof MediaRecorder==='undefined'||typeof HTMLCanvasElement==='undefined'||!HTMLCanvasElement.prototype.captureStream)return null;
  return ['video/mp4;codecs=avc1.42E01E','video/mp4','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(type=>MediaRecorder.isTypeSupported(type))||null;
}
function canUseWebCodecs(){return typeof VideoEncoder!=='undefined'&&typeof VideoFrame!=='undefined';}
export function videoSupport(){
  if(canUseWebCodecs())return 'MP4またはWebM';
  const mime=mediaRecorderMime();
  return mime?(mime.includes('mp4')?'MP4':'WebM'):null;
}
// ===== SECTION: Camera path and progressive event reveal shared by video and native frame previews =====
const ease=value=>value*value*(3-2*value);
export function cameraSchedule(layout){
  let start=0;
  const scenes=layout.bubbles.map((bubble,index)=>{
    const move=index?1100:700,hold=Math.max(2200,Math.min(18000,1700+bubble.title.length*24+bubble.comment.length*34+bubble.commentLines.length*80));
    const scene={index,start,move,hold,end:start+move+hold};start=scene.end;return scene;
  });
  const outro=scenes.length?{start,move:1200,hold:1400}:null;
  return {scenes,outro,duration:outro?start+outro.move+outro.hold:2200};
}
function fullBoardCamera(layout,aspect){
  const width=Math.max(layout.width,layout.height*aspect),height=width/aspect;
  return {x:(layout.width-width)/2,y:(layout.height-height)/2,width,height};
}
function cameraTarget(layout,index,aspect,pan=0,reading=false){
  const bubble=layout.bubbles[index],point=layout.points[index];
  if(!bubble||!point)return fullBoardCamera(layout,aspect);
  if(!reading){const height=650,width=height*aspect;return {x:Math.max(0,Math.min(layout.width-width,point.x-width/2)),y:Math.max(0,Math.min(layout.height-height,point.y-height/2)),width,height};}
  const height=Math.min(650,Math.max(400,bubble.height+140)),width=Math.max(bubble.width+100,height*aspect),actualHeight=width/aspect;
  const top=bubble.height+80<=actualHeight?bubble.y+bubble.height/2-actualHeight/2:bubble.y-40;
  const bottom=Math.max(top,bubble.y+bubble.height+40-actualHeight);
  return {x:bubble.x+bubble.width/2-width/2,y:top+(bottom-top)*pan,width,height:actualHeight};
}
function blendCamera(from,to,progress){const result={};for(const key of ['x','y','width','height'])result[key]=from[key]+(to[key]-from[key])*progress;return result;}
export function cameraState(layout,elapsed,aspect=1.6,{scenes,outro,duration}=cameraSchedule(layout)){
  if(!outro)return {camera:fullBoardCamera(layout,aspect),index:-1,revealed:-1,progress:1,complete:elapsed>=duration,duration};
  if(elapsed>=outro.start){
    const time=Math.min(1,(elapsed-outro.start)/outro.move),index=scenes.at(-1).index;
    const full=fullBoardCamera(layout,aspect);
    const camera=time===1?full:blendCamera(cameraTarget(layout,index,aspect,1,true),full,ease(time));
    return {camera,index,revealed:index,progress:1,complete:elapsed>=duration,duration,moving:time<1};
  }
  const scene=scenes.find(item=>elapsed<item.end),local=Math.max(0,elapsed-scene.start);
  const moving=local<scene.move,previous=Math.max(0,scene.index-1),travel=Math.min(1,local/scene.move);
  const previousPoint=cameraTarget(layout,previous,aspect),nextPoint=cameraTarget(layout,scene.index,aspect);
  let camera,position;
  if(moving){
    if(scene.index&&travel<.3){camera=blendCamera(cameraTarget(layout,previous,aspect,1,true),previousPoint,ease(travel/.3));position=previous;}
    else {const follow=ease(scene.index?(travel-.3)/.7:travel);camera=blendCamera(previousPoint,nextPoint,follow);position=previous+(scene.index-previous)*follow;}
  }else {
    const holdProgress=Math.max(0,Math.min(1,(local-scene.move)/scene.hold));
    if(holdProgress<.18)camera=blendCamera(nextPoint,cameraTarget(layout,scene.index,aspect,0,true),ease(holdProgress/.18));
    else camera=cameraTarget(layout,scene.index,aspect,(holdProgress-.18)/.82,true);
    position=scene.index;
  }
  return {camera,index:scene.index,revealed:moving&&scene.index?scene.index-1:scene.index,progress:layout.points.length<=1?1:position/(layout.points.length-1),complete:elapsed>=duration,duration,moving};
}
export function videoAssetPlan(layout,{maxPixels=32000000}={}){
  const base=rasterPlan(layout.width,layout.height,{maxDimension:4096,maxPixels:7000000});
  const cards=layout.bubbles.map(bubble=>rasterPlan(bubble.width+49,bubble.height+33,{maxDimension:4096,maxPixels:3000000}));
  const pixels=base.width*base.height+cards.reduce((sum,card)=>sum+card.width*card.height,0);
  return {pixels,maxPixels,allowed:pixels<=maxPixels,base,cards};
}
export function cameraFrameSvg(doc,elapsed,{aspect=1.6,width=1280,height=Math.round(width/aspect)}={}){
  const layout=timelineLayout(doc),state=cameraState(layout,elapsed,aspect),camera=state.camera;
  const PAPER=outputDesign(doc.design).paper;
  const board=timelineSvg(doc,{layout,progress:state.progress,maxVisibleIndex:state.revealed,showGhost:false});
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${camera.x} ${camera.y} ${camera.width} ${camera.height}"><rect x="${camera.x}" y="${camera.y}" width="${camera.width}" height="${camera.height}" fill="${PAPER}"/>${board}</svg>`;
}
export function drawVideoFrame(ctx,layout,assets,elapsed,schedule){
  const {width,height}=ctx.canvas,state=cameraState(layout,elapsed,width/height,schedule),camera=state.camera;
  const scale=width/camera.width;
  const design=outputDesign(layout.design),{ink:INK,line:RED,paper:PAPER,cards:COLORS}=design;
  ctx.fillStyle=PAPER;ctx.fillRect(0,0,width,height);ctx.save();ctx.scale(scale,scale);ctx.translate(-camera.x,-camera.y);
  // A clean, card-free board is cached once. Only reached events are drawn as individual cached cards.
  ctx.drawImage(assets.base,0,0,layout.width,layout.height);
  const {visible}=tracePoints(layout.points,state.progress),tip=visible.at(-1);
  if(tip&&design.opacity){
    const zeroY=layout.box.y+10/(10-layout.low)*layout.box.height;ctx.save();ctx.globalAlpha=design.opacity;ctx.fillStyle=RED;ctx.beginPath();
    visible.forEach((point,i)=>i?ctx.lineTo(point.x,point.y):ctx.moveTo(point.x,point.y));
    ctx.lineTo(tip.x,zeroY);ctx.lineTo(visible[0].x,zeroY);ctx.fill();ctx.restore();
  }
  for(let i=0;i<=state.revealed;i++){
    const bubble=layout.bubbles[i],image=assets.cards[i];if(!bubble||!image)continue;
    ctx.drawImage(image,bubble.x-23,bubble.y-27,bubble.width+49,bubble.height+33);
    ctx.beginPath();bubble.connector.forEach((point,j)=>j?ctx.lineTo(point.x,point.y):ctx.moveTo(point.x,point.y));ctx.strokeStyle=design.edge;ctx.lineWidth=1.7;ctx.stroke();
  }
  ctx.beginPath();
  for(const [i,point]of visible.entries()){if(!i)ctx.moveTo(point.x,point.y);else ctx.lineTo(point.x,point.y);}
  ctx.strokeStyle=RED;ctx.lineWidth=6.5;ctx.lineCap='round';ctx.lineJoin='round';if(!design.down)ctx.stroke();
  if(design.down) for(let i=1;i<visible.length;i++){
    const previous=visible[i-1], point=visible[i];
    ctx.beginPath();ctx.moveTo(previous.x,previous.y);ctx.lineTo(point.x,point.y);
    ctx.strokeStyle=segmentColor(design,previous,point);ctx.stroke();
  }
  if(tip){ctx.beginPath();ctx.arc(tip.x,tip.y,7,0,Math.PI*2);ctx.fillStyle=RED;ctx.fill();}
  for(let i=0;i<=state.revealed;i++){
    const point=layout.points[i];if(!point)continue;
    ctx.beginPath();ctx.arc(point.x,point.y,9,0,Math.PI*2);ctx.fillStyle=COLORS[i%COLORS.length];ctx.fill();ctx.strokeStyle=INK;ctx.lineWidth=3;ctx.stroke();
  }
  ctx.restore();return state;
}
// ===== SECTION: Video encoding with explicit frame timestamps =====
const VIDEO_FPS=24;
const VIDEO_BITRATE=5_000_000;
const videoError='動画の作成に失敗しました。画像保存をお試しください。';
const interruptedRecording='動画の描画が一時停止したため、作成を中断しました。この画面を表示したまま、もう一度お試しください。';
const videoAbort=()=>new DOMException('動画作成を中止しました。','AbortError');
function checkVideoAbort(signal){if(signal?.aborted)throw videoAbort();}

export async function writeVideoFrames(duration,writeFrame,onProgress,signal){
  const count=Math.ceil(duration*VIDEO_FPS/1000);
  for(let index=0;index<count;index++){
    checkVideoAbort(signal);
    const timestamp=index/VIDEO_FPS;
    await writeFrame(timestamp,1/VIDEO_FPS);
    if((index+1)%12===0){
      onProgress((index+1)/count);
      // Allow the dialog, progress bar and cancel action to update even on a fast encoder.
      await new Promise(resolve=>setTimeout(resolve,0));
    }
  }
  checkVideoAbort(signal);
  return count;
}

async function prepareTimedVideo(canvas){
  if(!canUseWebCodecs())return null;
  const {BufferTarget,CanvasSource,Mp4OutputFormat,Output,Quality,WebMOutputFormat,canEncodeVideo}=await import('./vendor/mediabunny.js');
  const quality=new Quality({bitrate:VIDEO_BITRATE});
  const settings={width:canvas.width,height:canvas.height,frameRate:VIDEO_FPS,quality,latencyMode:'quality'};
  for(const codec of ['avc','vp8']){
    if(!await canEncodeVideo(codec,settings))continue;
    const isMp4=codec==='avc',mime=isMp4?'video/mp4':'video/webm';
    const target=new BufferTarget();
    const output=new Output({format:isMp4?new Mp4OutputFormat():new WebMOutputFormat(),target});
    let encoded=0;
    const source=new CanvasSource(canvas,{codec,quality,latencyMode:settings.latencyMode,onEncodedPacket:()=>encoded++});
    output.addVideoTrack(source,{frameRate:VIDEO_FPS});
    return {output,target,source,mime,encodedCount:()=>encoded};
  }
  return null;
}

async function encodeTimedVideo(prepared,draw,duration,onProgress,signal){
  const {output,target,source,mime,encodedCount}=prepared;
  const cancel=()=>{void output.cancel().catch(()=>{});};
  signal?.addEventListener('abort',cancel,{once:true});
  try{
    checkVideoAbort(signal);
    await output.start();
    const count=await writeVideoFrames(duration,(timestamp,frameDuration)=>{
      draw(timestamp*1000);
      return source.add(timestamp,frameDuration);
    },onProgress,signal);
    await output.finalize();
    checkVideoAbort(signal);
    if(encodedCount()!==count||!target.buffer?.byteLength)throw new Error(videoError);
    onProgress(1);
    return new Blob([target.buffer],{type:mime});
  }catch(error){
    if(output.state!=='finalized')await output.cancel().catch(()=>{});
    checkVideoAbort(signal);
    throw new Error(videoError,{cause:error});
  }finally{
    signal?.removeEventListener('abort',cancel);
  }
}

// ponytail: MediaRecorder uses wall-clock timestamps. Browsers without WebCodecs
// must keep the tab visible and reject stalled recordings instead of saving damaged files.
function recordVideo(canvas,mime,draw,duration,onProgress,signal){
  checkVideoAbort(signal);
  if(document.hidden)throw new Error(interruptedRecording);
  draw(0);
  const stream=canvas.captureStream(VIDEO_FPS),chunks=[];
  const stopTracks=()=>stream.getTracks().forEach(track=>track.stop());
  return new Promise((resolve,reject)=>{
    let recorder,raf=0,finished=false;
    const abort=()=>fail(videoAbort());
    const visibilityChanged=()=>{if(document.hidden)fail(new Error(interruptedRecording));};
    const cleanup=()=>{
      cancelAnimationFrame(raf);
      stopTracks();
      signal?.removeEventListener('abort',abort);
      document.removeEventListener('visibilitychange',visibilityChanged);
    };
    const fail=error=>{
      if(finished)return;
      finished=true;
      cleanup();
      if(recorder&&recorder.state!=='inactive'){
        try{recorder.stop();}catch{}
      }
      reject(error);
    };
    try{
      recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:VIDEO_BITRATE});
      recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
      recorder.onerror=()=>fail(new Error(videoError));
      recorder.onstop=()=>{
        if(finished)return;
        if(!chunks.length){fail(new Error(videoError));return;}
        finished=true;
        cleanup();
        resolve(new Blob(chunks,{type:recorder.mimeType}));
      };
      signal?.addEventListener('abort',abort,{once:true});
      document.addEventListener('visibilitychange',visibilityChanged);
      recorder.start(250);
      const start=performance.now();
      let previous=start;
      const frame=()=>{
        const now=performance.now(),elapsed=now-start;
        if(document.hidden||now-previous>250){fail(new Error(interruptedRecording));return;}
        previous=now;
        try{
          draw(elapsed);
          onProgress(Math.min(1,elapsed/duration));
          if(elapsed<duration)raf=requestAnimationFrame(frame);
          else if(performance.now()-now>250)fail(new Error(interruptedRecording));
          else recorder.stop();
        }catch(error){fail(new Error(videoError,{cause:error}));}
      };
      raf=requestAnimationFrame(frame);
    }catch(error){fail(new Error(videoError,{cause:error}));}
  });
}

export async function createVideo(doc,onProgress,signal){
  if(!videoSupport())throw new Error('このブラウザは動画の作成に対応していません。PNGまたはSVGで保存してください。');
  checkVideoAbort(signal);
  const layout=timelineLayout(doc),spec=layoutSpecs[doc.layout];
  if(!videoAssetPlan(layout).allowed)throw new Error('この年表は動画生成用の画像が大きすぎます。記録はそのままです。PNGまたはSVGで保存するか、節目・文章を減らしてお試しください。');
  const base=await svgToCanvas(timelineSvg(doc,{layout,showLine:false,maxVisibleIndex:-1,showGhost:false}),{maxDimension:4096,maxPixels:7000000});
  const cards=[];
  for(const bubble of layout.bubbles){
    checkVideoAbort(signal);
    const svg=timelineSvg(doc,{layout,showLine:false,maxVisibleIndex:bubble.index,showGhost:false});
    // Extract using the unique group boundary rather than keeping a full board image per event.
    const at=svg.indexOf('data-event-index="'+bubble.index+'"'),groupStart=svg.lastIndexOf('<g ',at),groupEnd=svg.indexOf('</g>',at)+4;
    const fragment=svg.slice(groupStart,groupEnd),x=bubble.x-23,y=bubble.y-27,w=bubble.width+49,h=bubble.height+33;
    cards.push(await svgToCanvas(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${x} ${y} ${w} ${h}" font-family="${outputDesign(doc.design).font}" fill="${outputDesign(doc.design).ink}">${fragment}</svg>`,{maxDimension:4096,maxPixels:3000000}));
  }
  checkVideoAbort(signal);
  const canvas=document.createElement('canvas');canvas.width=spec.width;canvas.height=spec.height;
  const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)throw new Error('動画用の画像を作成できませんでした。');
  const assets={base,cards},schedule=cameraSchedule(layout);
  const draw=elapsed=>drawVideoFrame(ctx,layout,assets,elapsed,schedule);
  const timed=await prepareTimedVideo(canvas);
  if(timed)return encodeTimedVideo(timed,draw,schedule.duration,onProgress,signal);
  const mime=mediaRecorderMime();
  if(!mime)throw new Error('このブラウザで動画を作成できません。PNGまたはSVGで保存してください。');
  return recordVideo(canvas,mime,draw,schedule.duration,onProgress,signal);
}
