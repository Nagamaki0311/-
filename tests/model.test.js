import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyDocument,event,validateDocument,parseDocument,guideEvents,appendGuide,chartGeometry,sortedEvents,escapeXml,cleanText,pageCount,playbackPosition,playbackTime} from '../model.js';
import {exportSvg,chartSvg,drawVideoFrame} from '../export.js';

test('JSON backups round-trip Unicode and negative scores without mutation',()=>{
  const doc={...emptyDocument(),name:'はるか 🏔',negative:false,events:[event(25,'転機','ひと休み',-10,'気持ちを整えた。\n次の一歩へ。')]};
  const restored=parseDocument(JSON.stringify(doc));
  assert.deepEqual(restored,doc);restored.events[0].title='変更';assert.notEqual(restored.events[0].title,doc.events[0].title);
});
test('untrusted JSON rejects wrong versions, values, identities, and oversized input',()=>{
  const doc={...emptyDocument(),events:[event()]};
  for(const invalid of [null,[],{...doc,version:2},{...doc,layout:'huge'},{...doc,events:[{...doc.events[0],age:1.5}]},{...doc,events:[{...doc.events[0],age:121}]},{...doc,events:[{...doc.events[0],score:-11}]},{...doc,events:[{...doc.events[0],title:'x'.repeat(81)}]},{...doc,events:[doc.events[0],doc.events[0]]},{...doc,events:[{...doc.events[0],id:'a\rb'}]},{...doc,title:'a\0b'},{...doc,title:'\ud800'},{...doc,negative:'true'}]) assert.throws(()=>validateDocument(invalid));
  assert.throws(()=>parseDocument('{invalid}'));assert.throws(()=>parseDocument('x'.repeat(250001)));
  assert.equal(doc.events.length,1);
});
test('guide append preserves existing entries and skips only same age/label pairs',()=>{
  const original=event(6,'小学校1年生','大切な記録',-2),doc={...emptyDocument(),events:[original]};
  const result=appendGuide(doc,guideEvents('school',23,22));
  assert.equal(result.events[0],original);assert.equal(original.title,'大切な記録');
  assert.equal(result.events.filter(e=>e.age===6&&e.label==='小学校1年生').length,1);
  assert.equal(result.events.filter(e=>e.label.startsWith('小学校')).length,6);
  assert.equal(result.events.filter(e=>e.label.startsWith('中学校')).length,3);
  assert.equal(result.events.filter(e=>e.label.startsWith('高校')).length,3);
  assert.equal(result.events.filter(e=>e.label.startsWith('大学')).length,4);
  assert.equal(result.events.find(e=>e.label==='社会人2年目').age,23);
  assert.equal(appendGuide(result,guideEvents('school',23,22)).events.length,result.events.length);
  assert.throws(()=>appendGuide(emptyDocument(),guideEvents('age',120)));
  assert.equal(guideEvents('turning',20,200).length,1,'hidden work-start field must not block other guides');
  assert.throws(()=>guideEvents('school',20,200));
  assert.throws(()=>guideEvents('school',20.5));assert.throws(()=>guideEvents('other',20));
});
test('chart uses actual ages and stable ties; negative values expand y axis',()=>{
  const a=event(30,'','late',10),b=event(10,'','first',0),c=event(10,'','second',-10);
  const g=chartGeometry([a,b,c],{x:0,y:0,width:300,height:200});
  assert.deepEqual(g.list.map(e=>e.title),['first','second','late']);
  assert.equal(g.points[0].x,100);assert.equal(g.points[1].x,100);assert.equal(g.points[2].x,300);
  assert.equal(g.points[1].y,200);assert.equal(g.points[2].y,0);assert.equal(g.low,-10);
  assert.equal(chartGeometry([event(0)]).points[0].x,70);assert.deepEqual(sortedEvents([]),[]);
});
test('output escapes markup and XML-invalid live text; Japanese emoji remain intact',()=>{
  assert.equal(escapeXml('<script>"&\'\0\ud800🏔'), '&lt;script&gt;&quot;&amp;&apos;��🏔');
  assert.equal(cleanText('人生🏔\t\n\r'), '人生🏔\t\n\r');
  const doc={...emptyDocument(),title:'<script>alert("hi")</script>',events:[event(0,'<img>','<script>','5','x') ]};
  doc.events[0].score=5;
  const svg=exportSvg(doc);assert.ok(!svg.includes('<script>'));assert.ok(svg.includes('&lt;script&gt;'));
  assert.ok(!chartSvg([]).includes('NaN'));assert.ok(!chartSvg([event(0)]).includes('NaN'));
});
test('paged image output includes every event and comment without silent truncation',()=>{
  const doc={...emptyDocument(),layout:'portrait',title:'長い人生のタイトル'.repeat(5),events:Array.from({length:23},(_,i)=>event(i,`時期${i}`,`できごと${i}`,i%11,`${i}番目のコメント${'あ'.repeat(280)}`))};
  const pages=Array.from({length:pageCount(doc)},(_,i)=>exportSvg(doc,i));
  assert.equal(pages.length,3);
  for(const e of doc.events){assert.ok(pages.some(p=>p.includes(`できごと${e.age}`)));assert.ok(pages.some(p=>p.includes(`${e.age}番目のコメント`)));}
  assert.throws(()=>exportSvg(doc,-1));assert.throws(()=>exportSvg(doc,3));
  assert.ok(pages.every(p=>!p.includes('…')));
});
test('video text remains inside canvas when final card is reached',()=>{
  for(const layout of ['wide','square','portrait']){
    const sizes={wide:[1600,1000],square:[1200,1200],portrait:[1080,1920]},[width,height]=sizes[layout],texts=[];
    const ctx={canvas:{width,height},fillRect(){},strokeRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},arc(){},fill(){},measureText(t){return {width:Array.from(t).length*22};},fillText(t,x,y){texts.push({t:String(t),x,y});}};
    const doc={...emptyDocument(),layout,events:[event(0,'','はじまり',0),event(50,'最後','最後のできごと'.repeat(5),10,'とても長いコメント'.repeat(30))]};
    drawVideoFrame(ctx,doc,1);
    assert.ok(texts.some(t=>t.t.includes('最後')));
    assert.ok(texts.every(t=>t.y>=0&&t.y<height),`${layout}: all text baselines must stay in canvas`);
    const comments=texts.filter(t=>t.t.includes('コメント'));
    assert.ok(comments.every(t=>t.y<height-100),`${layout}: comments must remain above footer`);
  }
});


test('interactive chart exposes selectable points instead of hiding them inside an image role',()=>{
  const first=event(0),last=event(20);
  const interactive=chartSvg([first,last],{interactive:true,selectedId:first.id});
  assert.match(interactive,/role="group"/);
  assert.doesNotMatch(interactive,/role="img"/);
  assert.equal((interactive.match(/role="button"/g)||[]).length,2);
  assert.equal((interactive.match(/aria-pressed="true"/g)||[]).length,1);
  assert.match(chartSvg([first]),/role="img"/);
  assert.doesNotMatch(chartSvg([first]),/role="button"/);
});

test('playback shows the most recently reached event and holds the final state for 1.2 seconds',()=>{
  const first=event(0,'first','FIRST'),last=event(20,'last','LAST');
  const texts=[];
  const ctx={canvas:{width:1600,height:1000},fillRect(){},strokeRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},arc(){},fill(){},measureText(t){return {width:Array.from(t).length*22};},fillText(t){texts.push(String(t));}};
  drawVideoFrame(ctx,{...emptyDocument(),events:[first,last]},.75);
  assert.ok(texts.some(t=>t.includes('FIRST')));
  assert.ok(!texts.some(t=>t.includes('LAST')),'last event must not appear while the line is still approaching it');
  assert.equal(playbackPosition(6,.5).index,2);
  assert.equal(playbackPosition(0,1).index,-1);
  const {duration}=playbackTime(2,0);
  assert.equal(playbackTime(2,duration-1201).progress<1,true);
  assert.equal(playbackTime(2,duration-1200).progress,1);
  assert.equal(playbackTime(2,duration-1).complete,false);
  assert.equal(playbackTime(2,duration).complete,true);
  assert.ok(playbackTime(100,0).duration>playbackTime(6,0).duration);
});
