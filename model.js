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
  if (!Number.isInteger(workStart) || workStart<0 || workStart>120) throw new Error('社会人の開始年齢を0〜120で入力してください。');
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
  wide: {width:1600,height:1000,perPage:6,label:'横長'},
  square: {width:1200,height:1200,perPage:6,label:'正方形'},
  portrait: {width:1080,height:1920,perPage:10,label:'縦長'}
};
export function pageCount(doc) { return Math.max(1, Math.ceil(doc.events.length/layoutSpecs[doc.layout].perPage)); }
