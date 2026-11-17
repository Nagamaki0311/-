import {chartGeometry,sortedEvents,escapeXml,layoutSpecs,pageCount} from './model.js';
const INK='#1b2940', RED='#e65943', YELLOW='#ffda55', PAPER='#fffef9';
// ===== SECTION: Shared chart and text rendering =====
export function chartSvg(events,{width=1000,height=400,selectedId='',progress=1,interactive=false}={}) {
  const box={x:65,y:38,width:width-100,height:height-112};
  const g=chartGeometry(events,box);
  const ticks=g.low<0?[10,5,0,-5,-10]:[10,8,6,4,2,0];
  const points=g.points;
  const end=points.length?Math.max(0,Math.min(points.length-1,progress*(points.length-1))):0;
  const complete=Math.floor(end);
  const visible=points.slice(0,complete+1);
  if(complete<points.length-1){const a=points[complete],b=points[complete+1],f=end-complete;visible.push({x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f});}
  const line=visible.map(p=>`${p.x},${p.y}`).join(' ');
  const bottom=box.y+box.height;
  const area=visible.length?`${visible[0].x},${bottom} ${line} ${visible.at(-1).x},${bottom}`:'';
  const scoreY=n=>box.y+(10-n)/(10-g.low)*box.height;
  const ageTicks=Array.from({length:6},(_,i)=>Math.round(g.maxAge*i/5)).filter((a,i,ar)=>ar.indexOf(a)===i);
  const active=points.find(p=>p.id===selectedId);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="人生の調子を年齢ごとに描いた折れ線グラフ" font-family="sans-serif"><defs><linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${YELLOW}" stop-opacity=".6"/><stop offset="100%" stop-color="${YELLOW}" stop-opacity=".04"/></linearGradient></defs>${ticks.map(t=>`<line x1="${box.x}" x2="${box.x+box.width}" y1="${scoreY(t)}" y2="${scoreY(t)}" stroke="${t===0?'#bdc4c0':'#e5e7dc'}" stroke-dasharray="${t===0?'0':'4 5'}"/><text x="${box.x-18}" y="${scoreY(t)+5}" text-anchor="end" font-size="${interactive?22:14}" fill="#8a908b">${t}</text>`).join('')}${ageTicks.map(t=>`<text x="${box.x+t/g.maxAge*box.width}" y="${bottom+32}" font-size="${interactive?22:14}" text-anchor="middle" fill="#8a908b">${t}歳</text>`).join('')}${points.length?`<polygon points="${area}" fill="url(#chart-fill)"/><polyline points="${line}" fill="none" stroke="${RED}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>`: `<text x="${width/2}" y="${height/2}" text-anchor="middle" font-size="19" fill="#8a908b">あなたの最初の節目を、ここに。</text>`}${active?`<line x1="${active.x}" x2="${active.x}" y1="${box.y}" y2="${bottom}" stroke="${INK}" stroke-dasharray="4 5" opacity=".3"/>`:''}${points.map((p,i)=>`<g ${interactive?`data-point="${escapeXml(p.id)}"`:''}><circle cx="${p.x}" cy="${p.y}" r="${interactive?38:9}" fill="transparent" ${interactive?`class="chart-point" tabindex="0" role="button" aria-label="${escapeXml(`${p.age}歳 ${p.title||p.label||'できごと'} スコア${p.score}`)}"`:''}/><circle cx="${p.x}" cy="${p.y}" r="${p.id===selectedId?10:6}" fill="${p.id===selectedId?INK:PAPER}" stroke="${p.id===selectedId?INK:RED}" stroke-width="3" pointer-events="none" opacity="${i<=end?1:.18}"/>${points.length<=12&&i<=end?`<text x="${p.x}" y="${p.y-18}" text-anchor="middle" font-size="${interactive?21:14}" font-weight="bold" fill="${INK}" pointer-events="none">${p.score}</text>`:''}</g>`).join('')}</svg>`;
}
function wrap(text,max,limit=Infinity) {
  const lines=[];
  for(const paragraph of String(text).split('\n')) {
    const chars=Array.from(paragraph);
    if(!chars.length) lines.push('');
    for(let i=0;i<chars.length;i+=max) lines.push(chars.slice(i,i+max).join(''));
  }
  return lines.slice(0,limit).map((l,i)=>i===limit-1&&lines.length>limit?l.slice(0,-1)+'…':l);
}
function textSvg(text,x,y,size,{max=70,lineHeight=size*1.55,weight=400,fill=INK,limit=Infinity}={}) {
  return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}">${wrap(text,max,limit).map((line,i)=>`<tspan x="${x}" dy="${i?lineHeight:0}">${escapeXml(line)}</tspan>`).join('')}</text>`;
}
export function exportSvg(doc,page=0) {
  const spec=layoutSpecs[doc.layout],{width,height,perPage}=spec;
  if(!Number.isInteger(page)||page<0||page>=pageCount(doc)) throw new Error('ページが見つかりません。');
  const events=sortedEvents(doc.events),rows=events.slice(page*perPage,(page+1)*perPage);
  const pad=Math.round(width*.055),inner=width-2*pad;
  const titleSize=doc.layout==='wide'?42:38;
  const titleMax=Math.floor(inner/titleSize)-1;
  const titleLines=wrap(doc.title||'わたしの人生年表',titleMax);
  const titleY=170, chartY=titleY+(titleLines.length-1)*titleSize*1.55+45;
  const chartH=doc.layout==='portrait'?480:doc.layout==='square'?320:290;
  const rowsY=chartY+chartH+40;
  // Each row grows with the actual comment length; paged art keeps every character.
  let nextY=rowsY;
  const rowArt=rows.map((e,i)=>{
    const heading=`${e.age}歳${e.label?' / '+e.label:''}　${e.title||'まだ名前のない、できごと'}`;
    const headingMax=Math.floor((inner-65)/23),commentMax=Math.floor((inner-65)/18);
    const hLines=wrap(heading,headingMax),cLines=wrap(e.comment,commentMax);
    const rowH=Math.max(81,hLines.length*35+(e.comment?cLines.length*28+12:0)+24);
    const y=nextY;nextY+=rowH;
    return `<line x1="${pad}" x2="${width-pad}" y1="${y-14}" y2="${y-14}" stroke="#dedfd5"/>${textSvg(String(page*perPage+i+1).padStart(2,'0'),pad,y+15,22,{weight:700,fill:RED})}${textSvg(heading,pad+55,y+15,23,{max:headingMax,weight:700})}${e.comment?textSvg(e.comment,pad+55,y+15+hLines.length*35+4,18,{max:commentMax,lineHeight:28,fill:'#666f73'}):''}`;
  }).join('');
  const actualHeight=Math.max(height,nextY+80);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${actualHeight}" viewBox="0 0 ${width} ${actualHeight}" font-family="sans-serif"><rect width="${width}" height="${actualHeight}" fill="${PAPER}"/><rect x="15" y="15" width="${width-30}" height="${actualHeight-30}" rx="3" fill="none" stroke="${INK}" stroke-width="4"/><rect x="${pad}" y="48" width="230" height="36" fill="${INK}"/>${textSvg('LIFE IS A SHOW!',pad+15,73,21,{weight:700,fill:'#fff'})}${textSvg(doc.name?doc.name+'の人生年表':'あなただけの人生年表',pad,112,18,{max:50})}${textSvg(doc.title||'わたしの人生年表',pad,titleY,titleSize,{max:titleMax,weight:900})}<svg x="${pad-20}" y="${chartY}" width="${inner+40}" height="${chartH}" viewBox="0 0 1000 400">${chartSvg(events).replace(/^<svg[^>]*>/,'').replace(/<\/svg>$/,'')}</svg>${rowArt}${!events.length?textSvg('最初の節目を追加して、物語をはじめよう。',pad,rowsY+20,24,{max:40,fill:'#7c8479'}):''}<line x1="${pad}" x2="${width-pad}" y1="${actualHeight-65}" y2="${actualHeight-65}" stroke="#dedfd5"/>${textSvg(`人生年表メーカー　｜　どんな道のりも、あなただけのストーリー。`,pad,actualHeight-35,14,{max:100})}<text x="${width-pad}" y="${actualHeight-35}" text-anchor="end" font-size="14" fill="${INK}">${page+1} / ${pageCount(doc)}</text></svg>`;
}
// ===== SECTION: Browser-local PNG and video =====
export async function svgToCanvas(svg) {
  const blob=new Blob([svg],{type:'image/svg+xml;charset=utf-8'}),url=URL.createObjectURL(blob);
  try {
    const img=new Image();img.src=url;
    await img.decode();
    if(img.width>8000||img.height>20000) throw new Error('画像が大きすぎます。コメントを短くするか、レイアウトを変更してください。');
    const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;
    const ctx=canvas.getContext('2d');if(!ctx) throw new Error('画像の作成に対応していないブラウザです。');ctx.drawImage(img,0,0);return canvas;
  } finally {URL.revokeObjectURL(url);}
}
export function canvasBlob(canvas,type='image/png') { return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('画像を作成できませんでした。SVG保存をお試しください。')),type)); }
export function videoMime() {
  if(typeof MediaRecorder==='undefined'||typeof HTMLCanvasElement==='undefined'||!HTMLCanvasElement.prototype.captureStream) return null;
  return ['video/mp4;codecs=avc1.42E01E','video/mp4','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(t=>MediaRecorder.isTypeSupported(t))||null;
}
function canvasText(ctx,text,x,y,maxWidth,size=28,weight=400,color=INK,maxLines=Infinity) {
  ctx.font=`${weight} ${size}px sans-serif`;ctx.fillStyle=color;
  const lines=[];
  for(const p of String(text).split('\n')){let line='';for(const c of Array.from(p)){if(ctx.measureText(line+c).width>maxWidth&&line){lines.push(line);line=c;}else line+=c;}lines.push(line);}
  lines.slice(0,maxLines).forEach((l,i)=>ctx.fillText(i===maxLines-1&&lines.length>maxLines?l.slice(0,-1)+'…':l,x,y+i*size*1.55));
}
export function drawVideoFrame(ctx,doc,progress) {
  const {width:w,height:h}=ctx.canvas;ctx.fillStyle=PAPER;ctx.fillRect(0,0,w,h);
  ctx.strokeStyle=INK;ctx.lineWidth=4;ctx.strokeRect(14,14,w-28,h-28);
  const pad=60;ctx.fillStyle=INK;ctx.fillRect(pad,55,240,42);canvasText(ctx,'LIFE IS A SHOW!',pad+14,84,220,23,700,'#fff');
  canvasText(ctx,doc.name?doc.name+'の人生年表':'あなただけの人生年表',pad,135,w-pad*2,20,400);
  canvasText(ctx,doc.title||'わたしの人生年表',pad,192,w-pad*2,doc.layout==='wide'?38:35,900,INK,3);
  const chartTop=doc.layout==='portrait'?390:doc.layout==='square'?350:330;
  const chartHeight=doc.layout==='portrait'?680:doc.layout==='square'?380:230;
  const box={x:pad+35,y:chartTop,width:w-pad*2-60,height:chartHeight};
  const g=chartGeometry(doc.events,box);
  ctx.font='18px sans-serif';
  for(const n of (g.low<0?[10,5,0,-5,-10]:[10,8,6,4,2,0])) {const y=box.y+(10-n)/(10-g.low)*box.height;ctx.strokeStyle='#dde1d6';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(box.x,y);ctx.lineTo(box.x+box.width,y);ctx.stroke();ctx.fillStyle='#858d83';ctx.fillText(n,box.x-35,y+6);}
  const end=Math.min(g.points.length-1,Math.max(0,progress*(g.points.length-1))),i=Math.floor(end),f=end-i;
  const visible=g.points.slice(0,i+1);if(g.points[i+1]){const a=g.points[i],b=g.points[i+1];visible.push({x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f});}
  if(visible.length){ctx.beginPath();visible.forEach((p,j)=>j?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.strokeStyle=RED;ctx.lineWidth=6;ctx.lineJoin='round';ctx.stroke();visible.slice(0,-1).forEach(p=>{ctx.beginPath();ctx.arc(p.x,p.y,7,0,Math.PI*2);ctx.fillStyle=RED;ctx.fill();});}
  for(let a=0;a<=5;a++){const age=Math.round(g.maxAge*a/5);canvasText(ctx,`${age}歳`,box.x+box.width*a/5-14,box.y+box.height+35,90,17,400,'#858d83');}
  const current=g.points[Math.min(g.points.length-1,Math.floor(progress*g.points.length))];
  const cardY=chartTop+chartHeight+75;
  ctx.fillStyle='#fff3c5';ctx.fillRect(pad,cardY,w-pad*2,h-cardY-100);
  if(current){
    const textWidth=w-pad*2-50,titleLines=doc.layout==='portrait'?3:2;
    canvasText(ctx,`${current.age}歳　${current.label}　/　スコア ${current.score}`,pad+25,cardY+38,textWidth,22,700,INK,1);
    canvasText(ctx,current.title||'まだ名前のない、できごと',pad+25,cardY+86,textWidth,33,900,INK,titleLines);
    const commentY=cardY+86+titleLines*33*1.55+15;
    const commentLines=Math.max(1,Math.floor((h-120-commentY)/(22*1.55))+1);
    canvasText(ctx,current.comment,pad+25,commentY,textWidth,22,400,'#636d70',commentLines);
  }
  canvasText(ctx,'人生年表メーカー　｜　あなたの人生に、いいね。',pad,h-40,w-pad*2,16,700);
}
export async function createVideo(doc,onProgress,signal) {
  const mime=videoMime();if(!mime) throw new Error('このブラウザは動画の作成に対応していません。PNGまたはSVGで保存してください。');
  const spec=layoutSpecs[doc.layout],canvas=document.createElement('canvas');canvas.width=spec.width;canvas.height=spec.height;
  const ctx=canvas.getContext('2d');if(!ctx) throw new Error('動画用の画像を作成できませんでした。');
  drawVideoFrame(ctx,doc,0);
  const stream=canvas.captureStream(24),chunks=[];
  let recorder;
  try {recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:4000000});}catch(e){stream.getTracks().forEach(t=>t.stop());throw e;}
  let raf=0;
  const duration=Math.max(8000,doc.events.length*1600+1200);
  return new Promise((resolve,reject)=>{
    let aborted=false;
    const abort=()=>{aborted=true;if(recorder.state!=='inactive')recorder.stop();};
    signal?.addEventListener('abort',abort,{once:true});
    const cleanup=()=>{cancelAnimationFrame(raf);stream.getTracks().forEach(t=>t.stop());signal?.removeEventListener('abort',abort);};
    recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
    recorder.onerror=()=>{cleanup();reject(new Error('動画の作成に失敗しました。画像保存をお試しください。'));};
    recorder.onstop=()=>{cleanup();if(aborted)reject(new DOMException('動画作成を中止しました。','AbortError'));else resolve(new Blob(chunks,{type:recorder.mimeType}));};
    recorder.start(250);const start=performance.now();
    const frame=now=>{const elapsed=now-start,p=Math.min(1,elapsed/duration),reveal=Math.min(1,elapsed/(duration-1200));drawVideoFrame(ctx,doc,reveal);onProgress(p);if(p<1)raf=requestAnimationFrame(frame);else recorder.stop();};
    raf=requestAnimationFrame(frame);
  });
}
