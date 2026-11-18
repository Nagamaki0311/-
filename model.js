// ===== SECTION: Data model and trust boundary =====
export const VERSION = 1;
export const MAX_EVENTS = 100;
export const STORAGE_KEY = 'jinsei-timeline-v1';
export function uid() { return globalThis.crypto?.randomUUID?.() ?? `e-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
export function event(age = 0, label = '', title = '', score = 5, comment = '') {
  return { id: uid(), age, label, title, score, comment };
}
export function emptyDocument() {
  return { version: VERSION, name: '', title: 'わたしの人生年表', layout: 'wide', negative: false, events: [] };
}
export function sampleDocument() {
  return { ...emptyDocument(), name: 'サンプル', title: 'ここまでの人生、なかなかいい感じ。', events: [
    event(0, '誕生', '人生、はじまりました！', 7, 'たくさんの愛情に囲まれて、すくすく。'),
    event(6, '小学校1年生', 'ランドセルと、大きな一歩', 8, '毎日が発見。親友にも出会えた。'),
    event(13, '中学校2年生', 'はじめての挫折…', 3, '部活も勉強もうまくいかない。でも、今につながる時間。'),
    event(18, '大学1年生', '世界がぐっと広がった！', 9, '新しい街、新しい仲間。やりたいことが見つかった。'),
    event(22, '社会人1年目', '社会の荒波に、もまれる', 4, '慣れない仕事に四苦八苦。少しずつ自分のペースで。'),
    event(27, '新しい挑戦', '好きなことを仕事に！', 10, '遠回りも、ぜんぶ自分のストーリー。')
  ] };
}
export function sortedEvents(events) { return events.map((e,i)=>({e,i})).sort((a,b)=>a.e.age-b.e.age || a.i-b.i).map(x=>x.e); }
const invalidXml = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uD800-\uDFFF\uFFFE\uFFFF]/u;
export function cleanText(value) { return String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uD800-\uDFFF\uFFFE\uFFFF]/gu, '\uFFFD'); }
function string(value, max, field) {
  if (typeof value !== 'string' || value.length > max || invalidXml.test(value)) throw new Error(`${field}の形式が正しくありません。`);
  return value;
}
export function validateDocument(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || input.version !== VERSION) throw new Error('対応していないデータ形式です。バージョン1の年表JSONを選んでください。');
  if (!Array.isArray(input.events) || input.events.length > MAX_EVENTS) throw new Error(`節目は${MAX_EVENTS}件までです。`);
  if (!['wide','square','portrait'].includes(input.layout) || typeof input.negative !== 'boolean') throw new Error('表示設定の形式が正しくありません。');
  const ids = new Set();
  const events = input.events.map(e=>{
    if (!e || typeof e !== 'object' || !Number.isInteger(e.age) || e.age<0 || e.age>120 || !Number.isInteger(e.score) || e.score< -10 || e.score>10) throw new Error('年齢は0〜120、スコアは-10〜10の整数にしてください。');
    const id = string(e.id,100,'ID');
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(id) || ids.has(id)) throw new Error('節目のIDが重複しているか、空になっています。');
    ids.add(id);
    return { id, age:e.age, label:string(e.label,40,'区分'), title:string(e.title,80,'できごと'), comment:string(e.comment,300,'コメント'), score:e.score };
  });
  return {version:VERSION, name:string(input.name,40,'名前'), title:string(input.title,80,'タイトル'), layout:input.layout, negative:input.negative, events};
}
export function parseDocument(text) {
  if (typeof text !== 'string' || text.length > 250000) throw new Error('ファイルが大きすぎます（250KBまで）。');
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error('JSONを読み取れませんでした。年表データのJSONファイルを選んでください。'); }
  return validateDocument(parsed);
}
// ===== SECTION: Guides and chart coordinates =====
export function guideEvents(mode, age, workStart = 22) {
  if (!Number.isInteger(age) || age<0 || age>120) throw new Error('現在の年齢を0〜120の整数で入力してください。');
  if (mode === 'school' && (!Number.isInteger(workStart) || workStart<0 || workStart>120)) throw new Error('社会人の開始年齢を0〜120で入力してください。');
  if(mode === 'age') return Array.from({length:age+1},(_,i)=>event(i, `${i}歳`));
  if(mode === 'turning') return [event(age, '転機')];
  if(mode !== 'school') throw new Error('ガイドを選択してください。');
  const result = [event(0,'誕生')];
  for(const [start,count,name] of [[6,6,'小学校'],[12,3,'中学校'],[15,3,'高校'],[18,4,'大学']]) {
    for(let i=0;i<count && start+i<=age;i++) result.push(event(start+i,`${name}${i+1}年生`));
  }
  for(let a=workStart;a<=age;a++) result.push(event(a,`社会人${a-workStart+1}年目`));
  return sortedEvents(result);
}
export function appendGuide(doc, generated) {
  const keys = new Set(doc.events.map(e=>`${e.age}\0${e.label}`));
  const added = generated.filter(e=>!keys.has(`${e.age}\0${e.label}`));
  if(doc.events.length + added.length > MAX_EVENTS) throw new Error(`追加すると${MAX_EVENTS}件を超えます。年齢の範囲を短くするか、転機ごとに追加してください。`);
  return {...doc, events:[...doc.events,...added]};
}
export function chartGeometry(events, box={x:70,y:45,width:910,height:280}) {
  const list = sortedEvents(events);
  const low = list.some(e=>e.score<0) ? -10 : 0;
  const minAge = Math.min(0,...list.map(e=>e.age));
  const maxAge = Math.max(1,...list.map(e=>e.age));
  return {list, low, minAge, maxAge, points:list.map(e=>({ ...e, x:box.x+(e.age-minAge)/(maxAge-minAge)*box.width, y:box.y+(10-e.score)/(10-low)*box.height })), box};
}
export function escapeXml(value) { return cleanText(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c])); }
export const layoutSpecs = {
  wide: {width:1600,height:1000,ratio:1.6,cardWidth:276,plotHeight:172,label:'横長'},
  square: {width:1200,height:1200,ratio:1,cardWidth:260,plotHeight:172,label:'正方形'},
  portrait: {width:1080,height:1600,ratio:0.675,cardWidth:248,plotHeight:172,label:'縦長'}
};
export function periodLabel(record){return `${record.age}歳${record.label&&record.label.trim()!==record.age+'歳'?' / '+record.label:''}`;}
export function documentHeading(doc) { const name=cleanText(doc.name||'').trim();return name?name+'の人生年表':'わたしの人生年表'; }
// Legacy version-1 title is retained in JSON backups, but no longer drives displayed headings.
export function removeEvents(doc, ids) {
  const selected=new Set(ids);
  const removed=doc.events.map((record,index)=>({record,index})).filter(item=>selected.has(item.record.id));
  return {document:{...doc,events:doc.events.filter(record=>!selected.has(record.id))},removed};
}
export function restoreEvents(doc, removed) {
  const ids=new Set(doc.events.map(record=>record.id));
  const restoring=removed.filter(item=>!ids.has(item.record.id)).sort((a,b)=>a.index-b.index);
  if(doc.events.length+restoring.length>MAX_EVENTS)throw new Error('節目が上限に達しています。空きを作ってからお試しください。');
  const events=[...doc.events];for(const {record,index} of restoring)events.splice(Math.min(index,events.length),0,record);
  return {...doc,events};
}
// ===== SECTION: Readable folded timeline, one canvas with a declared local age axis per row =====
export function wrapText(text, maxUnits) {
  const lines=[];
  for(const paragraph of String(text).split('\n')) {
    let line='',units=0;
    for(const char of Array.from(paragraph)) {
      const size=1.08;
      if(line&&units+size>maxUnits){lines.push(line);line='';units=0;}
      line+=char;units+=size;
    }
    lines.push(line);
  }
  return lines;
}
function eventCard(record,index,cardWidth) {
  const periodLines=wrapText(periodLabel(record),(cardWidth-44)/16);
  const titleLines=record.title?wrapText(record.title,(cardWidth-40)/21):[];
  const commentLines=record.comment?wrapText(record.comment,(cardWidth-40)/18):[];
  const height=24+periodLines.length*24+(titleLines.length?14+titleLines.length*30:0)+(commentLines.length?12+commentLines.length*26:0)+20;
  return {...record,index,width:cardWidth,height,periodLines,titleLines,commentLines};
}
function partitionTimeline(cards,columns) {
  const rows=[];let row=[];
  for(const card of cards){
    const previous=row.at(-1);
    // A large unrecorded age gap starts a new, labelled local time range rather than compressing recent events.
    if(row.length>=columns||(previous&&card.age-previous.age>12)){rows.push(row);row=[];}
    row.push(card);
  }
  if(row.length)rows.push(row);
  return rows.length?rows:[[]];
}
export function timelineLayout(doc) {
  const spec=layoutSpecs[doc.layout],list=sortedEvents(doc.events),pad=52,rowGap=38;
  const headerHeight=72+wrapText(documentHeading(doc),(spec.width-pad*2)/38).length*50;
  const cards=list.map((record,index)=>eventCard(record,index,spec.cardWidth));
  const low=list.some(record=>record.score<0)?-10:0;
  let best;
  for(let columns=1;columns<=Math.min(9,Math.max(1,cards.length));columns++){
    const groups=partitionTimeline(cards,columns);
    const rowHeights=groups.map(group=>50+spec.plotHeight+72+Math.max(110,...group.map(card=>card.height))+24);
    let width=Math.max(spec.width,...groups.map(group=>{
      const ages=[...new Set(group.map(card=>card.age))];
      const span=(ages.at(-1)??0)-(ages[0]??0),deltas=ages.slice(1).map((age,i)=>age-ages[i]);
      const temporal=span?span/Math.min(...deltas)*68:0;
      return Math.max(group.length*(spec.cardWidth+26)-26+pad*2,temporal+spec.cardWidth+pad*2);
    }));
    const naturalHeight=headerHeight+rowHeights.reduce((sum,h)=>sum+h,0)+rowGap*Math.max(0,groups.length-1)+50;
    width=Math.max(width,naturalHeight*spec.ratio);
    const height=Math.max(naturalHeight,width/spec.ratio,spec.height);
    width=Math.max(width,height*spec.ratio);
    const paddingFraction=Math.max(0,height-naturalHeight)/height;
    const cost=width*height*(1+groups.length*.006+paddingFraction*.8);
    if(!best||cost<best.cost)best={width:Math.ceil(width),height:Math.ceil(height),groups,rowHeights,cost,columns};
  }
  const {width,height,groups,rowHeights}=best,rows=[],points=[],bubbles=[];
  const extra=Math.max(0,height-headerHeight-50-rowHeights.reduce((sum,h)=>sum+h,0)-rowGap*Math.max(0,groups.length-1));
  let y=headerHeight;
  groups.forEach((group,rowIndex)=>{
    const rowHeight=rowHeights[rowIndex]+extra/groups.length;
    const minAge=group[0]?.age??0,maxAge=group.at(-1)?.age??1;
    const plotHeight=spec.plotHeight+Math.min(180,extra/groups.length*.7);
    const box={x:pad+spec.cardWidth/2,y:y+44,width:width-pad*2-spec.cardWidth,height:plotHeight};
    const row={index:rowIndex,y,height:rowHeight,minAge,maxAge,box,eventIds:group.map(card=>card.id)};rows.push(row);
    group.forEach((card,slot)=>{
      const x=minAge===maxAge?box.x+box.width/2:box.x+(card.age-minAge)/(maxAge-minAge)*box.width;
      const point={...card,x,y:box.y+(10-card.score)/(10-low)*box.height,row:rowIndex};points.push(point);
      const slotWidth=(width-pad*2)/Math.max(1,group.length);
      const bubble={...card,x:pad+slotWidth*(slot+.5)-card.width/2,y:box.y+box.height+72,width:card.width,point,row:rowIndex,slot};
      // Each event owns a separate horizontal channel in the whitespace between plot and cards.
      const channelY=box.y+box.height+38+slot*.75;
      bubble.connector=[{x:point.x,y:point.y},{x:point.x,y:channelY},{x:bubble.x+bubble.width/2,y:channelY},{x:bubble.x+bubble.width/2,y:bubble.y}];
      bubbles.push(bubble);
    });
    y+=rowHeight+rowGap;
  });
  const byAge=new Map();for(const point of points){const key=point.row+':'+point.age+':'+point.score;byAge.set(key,(byAge.get(key)||0)+1);}
  for(const point of points)point.coincident=byAge.get(point.row+':'+point.age+':'+point.score);
  return {width,height,pad,headerHeight,heading:documentHeading(doc),titleLines:wrapText(documentHeading(doc),(width-pad*2)/38),nameLines:[],rows,points,bubbles,low,maxAge:Math.max(1,...list.map(record=>record.age)),box:rows[0].box,columns:best.columns,folded:rows.length>1,targetRatio:spec.ratio};
}
export function rasterPlan(width,height,{maxDimension=8192,maxPixels=16000000}={}) {
  const scale=Math.min(1,maxDimension/width,maxDimension/height,Math.sqrt(maxPixels/(width*height)));
  return {width:Math.max(1,Math.floor(width*scale)),height:Math.max(1,Math.floor(height*scale)),scale,scaled:scale<1};
}

// ===== SECTION: Playback position and final hold =====
export function playbackPosition(count, progress) {
  const position = Math.max(0, Math.min(1, progress)) * Math.max(0, count - 1);
  const index = count ? Math.floor(position) : -1;
  return { position, index, fraction: position - Math.floor(position) };
}
export function playbackTime(count, elapsed) {
  const duration = Math.max(8000, count * 1600 + 1200);
  return { duration, progress: Math.max(0, Math.min(1, elapsed / (duration - 1200))), complete: elapsed >= duration };
}
