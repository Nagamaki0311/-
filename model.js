// ===== SECTION: Data model and trust boundary =====
export const VERSION = 1;
export const NORMAL_EVENT_LIMIT = 30;
export const MAX_EVENTS = 121;
export const AGE_GUIDE_WARNING = '年齢ごとは30件を超えて追加できます。件数によっては正常に表示・出力できない場合があります。';
export const BIRTH_ANCHOR_ID = 'fixed:birth';
export const STORAGE_KEY = 'jinsei-timeline-v1';
export function uid() { return globalThis.crypto?.randomUUID?.() ?? `e-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
export function event(age = 0, label = '', title = '', score = 5, comment = '') {
  return { id: uid(), age, label, title, score, comment };
}
export function emptyDocument() {
  return { version: VERSION, name: '', title: 'わたしの人生年表', layout: 'wide', negative: false, events: [] };
}
export function sampleDocument() {
  return { ...emptyDocument(), name: 'サンプル', title: 'わたしの人生年表', events: [
    event(0, '誕生', '誕生', 7, '家族と過ごす。'),
    event(6, '小学校1年生', '小学校に入学', 8, '友人ができ、学校生活に慣れた。'),
    event(13, '中学校2年生', '部活動で悩む', 3, '練習と勉強の両立が難しかった。'),
    event(18, '大学1年生', '大学に進学', 9, '一人暮らしを始め、新しい友人もできた。'),
    event(22, '社会人1年目', '就職', 4, '初めての仕事に慣れるまで時間がかかった。'),
    event(27, '転職', '希望する職種に転職', 10, '仕事の選択肢が増え、生活も落ち着いた。')
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
  if(mode === 'age') return Array.from({length:age+1},(_,i)=>event(i, i===0?'誕生':`${i}歳`));
  if(mode === 'turning') return [event(age, '転機')];
  if(mode !== 'school') throw new Error('ガイドを選択してください。');
  const result = [event(0,'誕生')];
  for(const [start,count,name] of [[6,6,'小学校'],[12,3,'中学校'],[15,3,'高校'],[18,4,'大学']]) {
    for(let i=0;i<count && start+i<=age;i++) result.push(event(start+i,`${name}${i+1}年生`));
  }
  for(let a=workStart;a<=age;a++) result.push(event(a,`社会人${a-workStart+1}年目`));
  return sortedEvents(result);
}
export function appendGuide(doc, generated, { mode = 'turning' } = {}) {
  const keys = new Set(doc.events.map(e=>`${e.age}\0${e.label}`));
  const usesFixedBirth = mode==='age'||mode==='school';
  const added = mode==='manual' ? generated : generated.filter(record=>{
    if(usesFixedBirth&&record.age===0&&record.label==='誕生')return false;
    return !keys.has(`${record.age}\0${record.label}`);
  });
  const limit=mode==='age'?MAX_EVENTS:NORMAL_EVENT_LIMIT;
  if(added.length&&doc.events.length + added.length > limit) throw new Error(mode==='age'?`年齢ごとの節目は${MAX_EVENTS}件までです。`:`通常の節目は${NORMAL_EVENT_LIMIT}件までです。不要な節目を削除してください。`);
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
  wide: {width:1600,height:1000,ratio:1.6,label:'横長'},
  square: {width:1200,height:1200,ratio:1,label:'正方形'},
  portrait: {width:1080,height:1600,ratio:0.675,label:'縦長'}
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
// ===== SECTION: Continuous panorama with a truthful age axis and local annotations =====
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
export function timelineLayout(doc) {
  const list=sortedEvents(doc.events),pad=64,cardWidth=280,cardGap=24,plotHeight=560;
  // The fixed origin is derived for display. It never consumes a slot or changes saved records.
  if(list[0]?.age!==0)list.unshift({id:BIRTH_ANCHOR_ID,age:0,label:'誕生',title:'',comment:'',score:5});
  const cards=list.map((record,index)=>{
    const card=eventCard(record,index,cardWidth);
    if(index===0&&record.label.trim()!=='誕生'){
      const label=record.label.trim();
      card.periodLines=wrapText('0歳 / 誕生'+(label&&label!=='0歳'?' / '+label:''),(cardWidth-44)/16);
      const extraLines=card.periodLines.length-wrapText(periodLabel(record),(cardWidth-44)/16).length;
      card.height+=extraLines*24;
    }
    return card;
  });
  const groups=[];
  for(const card of cards){
    let group=groups.at(-1);
    if(!group||group.age!==card.age){group={age:card.age,cards:[]};groups.push(group);}
    group.cards.push(card);
  }
  for(const group of groups)group.width=group.cards.length*(cardWidth+cardGap)-cardGap;
  const minAge=0,maxAge=groups.at(-1).age;
  const ageScale=cardWidth+64,breaks=[];
  let span=0;
  groups[0].offset=0;
  for(let i=1;i<groups.length;i++){
    const previous=groups[i-1],current=groups[i],gap=current.age-previous.age;
    const distance=Math.max(ageScale*(gap>=3?1.5:gap),(previous.width+current.width)/2+64);
    if(gap>=3)breaks.push({from:previous.age,to:current.age,offset:span+distance/2});
    span+=distance;
    current.offset=span;
  }
  const left=groups[0].width/2,right=groups.at(-1).width/2;
  const naturalWidth=pad*2+left+span+right,width=Math.ceil(Math.max(1600,naturalWidth));
  const inset=(width-naturalWidth)/2,firstX=pad+left+inset;
  const titleLines=wrapText(documentHeading(doc),(width-pad*2-64)/38),headerHeight=64+titleLines.length*50;
  const box={x:span&&groups.length?firstX:pad+60,y:headerHeight+40,width:span&&groups.length?span:width-pad*2-120,height:plotHeight};
  const low=list.some(record=>record.score<0)?-10:0,points=[],bubbles=[];
  for(const group of groups){
    const x=span?firstX+group.offset:width/2;
    group.cards.forEach((card,slot)=>{
      const point={...card,x,y:box.y+(10-card.score)/(10-low)*plotHeight,row:0};points.push(point);
      const bubble={...card,x:x-group.width/2+slot*(cardWidth+cardGap),y:box.y+plotHeight+100,point,row:0,slot};
      const channelY=box.y+plotHeight+42+card.index*20/Math.max(1,cards.length-1);
      bubble.connector=[{x:point.x,y:point.y},{x:point.x,y:channelY},{x:bubble.x+bubble.width/2,y:channelY},{x:bubble.x+bubble.width/2,y:bubble.y}];
      bubbles.push(bubble);
    });
  }
  const height=Math.ceil(box.y+plotHeight+100+Math.max(100,...bubbles.map(bubble=>bubble.height))+48);
  const byPoint=new Map();for(const point of points){const key=point.age+':'+point.score;byPoint.set(key,(byPoint.get(key)||0)+1);}
  for(const point of points)point.coincident=byPoint.get(point.age+':'+point.score);
  const row={index:0,y:headerHeight,height:height-headerHeight-48,minAge,maxAge,box,eventIds:list.map(record=>record.id)};
  return {width,height,pad,headerHeight,heading:documentHeading(doc),titleLines,nameLines:[],rows:[row],points,bubbles,low,minAge,maxAge,box,ageScale,breaks:breaks.map(gap=>({...gap,x:firstX+gap.offset})),panorama:true,folded:false};
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
