import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyDocument,event,validateDocument,parseDocument,guideEvents,appendGuide,chartGeometry,sortedEvents,escapeXml,cleanText,timelineLayout,wrapText,rasterPlan,playbackPosition,playbackTime} from '../model.js';
import {exportSvg,timelineSvg,traceGeometry,drawVideoFrame} from '../export.js';

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
  assert.ok(!exportSvg(emptyDocument()).includes('NaN'));
  assert.ok(!exportSvg({...emptyDocument(),events:[event(0)]}).includes('NaN'));
});

function intersects(a,b){return a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;}
function segmentEntersRect(a,b,rect){
  if(a.x===b.x)return a.x>rect.x&&a.x<rect.x+rect.width&&Math.max(a.y,b.y)>rect.y&&Math.min(a.y,b.y)<rect.y+rect.height;
  if(a.y===b.y)return a.y>rect.y&&a.y<rect.y+rect.height&&Math.max(a.x,b.x)>rect.x&&Math.min(a.x,b.x)<rect.x+rect.width;
  throw new Error('Connector must be orthogonal');
}
function assertBoardGeometry(doc){
  const board=timelineLayout(doc);
  assert.equal(board.bubbles.length,doc.events.length);assert.equal(board.points.length,doc.events.length);
  for(const b of board.bubbles){
    assert.ok(b.x>=0&&b.y>=0&&b.x+b.width<=board.width&&b.y+b.height<=board.height,'full bubble must be within board');
    assert.deepEqual(b.connector[0],{x:b.point.x,y:b.point.y},'connector must start at exact age/score point');
    for(const other of board.bubbles){
      if(b===other)continue;
      assert.ok(!intersects(b,other),'event bubbles must not overlap');
      const obstacles=[other,{x:other.x+4,y:other.y+5,width:other.width,height:other.height},{x:other.x-9,y:other.y-31,width:44,height:44},{x:other.x+other.width-67,y:other.y-15,width:58,height:32}];
      for(const obstacle of obstacles)for(let i=1;i<b.connector.length;i++)assert.ok(!segmentEntersRect(b.connector[i-1],b.connector[i],obstacle),'connector must not cross another event, including its number/score stamp');
    }
  }
  return board;
}

test('one integrated export contains every event and full comment, with no pagination or truncation',()=>{
  for(const layout of ['wide','square','portrait']){
    const doc={...emptyDocument(),layout,title:'長い人生のタイトル'.repeat(5),events:Array.from({length:23},(_,i)=>event(i,`時期${i}`,`できごと${i}`,i%11,`${i}番目のコメント${'あ'.repeat(260)}`))};
    const board=assertBoardGeometry(doc),svg=exportSvg(doc);
    assert.equal((svg.match(/data-connector=/g)||[]).length,23);
    assert.equal((svg.match(/data-kind="bubble"/g)||[]).length,23);
    for(const b of board.bubbles){
      assert.ok(svg.includes(`data-connector="${b.id}"`));
      assert.equal(b.titleLines.join(''),b.title||'まだ名前のない、できごと');
      assert.equal(b.commentLines.join(''),b.comment);
    }
    assert.ok(!svg.includes('…'));assert.ok(!svg.includes(' / 2</text>'));
    assert.ok(svg.includes(`width="${board.width}" height="${board.height}"`));
  }
});

test('same-age events keep true chart coordinates and distinct collision-free annotation routes',()=>{
  for(const layout of ['wide','square','portrait']){
    const doc={...emptyDocument(),layout,events:Array.from({length:12},(_,i)=>event(10,`同じ年齢の節目${i}`,`大切なできごと${i}`,i%3-1,'W'.repeat(150)))};
    const board=assertBoardGeometry(doc);
    assert.equal(new Set(board.points.map(p=>p.x)).size,1);
    assert.equal(new Set(board.bubbles.map(b=>JSON.stringify(b.connector))).size,12);
    assert.deepEqual(timelineLayout(doc),board,'layout must be deterministic');
  }
});

test('wide Latin glyphs and line breaks keep all content inside growing bubbles',()=>{
  const doc={...emptyDocument(),events:[event(0,'M'.repeat(40),'W'.repeat(80),5,'W'.repeat(300)),event(1,'時期','改行の多い思い出',6,'あ\n'.repeat(140))]};
  const board=assertBoardGeometry(doc);
  for(const b of board.bubbles){
    assert.ok(b.titleLines.every(line=>Array.from(line).length*22< b.width-30));
    assert.ok(b.commentLines.every(line=>Array.from(line).length*18< b.width-30));
    assert.equal(b.commentLines.join(''),b.comment.replaceAll('\n',''));
  }
  assert.equal(wrapText('\nW\n',10).join('\n'),'\nW\n');
});

test('interactive board exposes each bubble and exact point to keyboard users',()=>{
  const first=event(0),last=event(20),doc={...emptyDocument(),events:[first,last]};
  const interactive=timelineSvg(doc,{interactive:true,selectedId:first.id});
  assert.match(interactive,/role="group"/);assert.doesNotMatch(interactive,/role="img"/);
  assert.equal((interactive.match(/role="button"/g)||[]).length,4);
  assert.equal((interactive.match(/aria-pressed="true"/g)||[]).length,2);
  assert.match(exportSvg(doc),/role="img"/);assert.doesNotMatch(exportSvg(doc),/role="button"/);
});

test('PNG raster plan bounds both dimensions and memory while preserving complete vector viewBox',()=>{
  for(const [width,height] of [[1600,1300],[2800,70000],[100000,300000]]){
    const plan=rasterPlan(width,height);
    assert.ok(plan.width<=8192&&plan.height<=8192&&plan.width*plan.height<=16000000);
    assert.ok(plan.width>0&&plan.height>0);
    assert.ok(Math.abs(plan.width/width-plan.height/height)<1/Math.min(width,height));
  }
  assert.equal(rasterPlan(1600,1300).scaled,false);
  assert.equal(rasterPlan(2800,70000).scaled,true);
});

test('video reuses the complete board background and draws the same growing trace',()=>{
  const doc={...emptyDocument(),events:[event(0,'誕生','FIRST',0),event(20,'転機','LAST',10)]};
  const board=timelineLayout(doc),trace=traceGeometry(board,.75),lines=[],images=[],arcs=[];
  const background={};
  const ctx={canvas:{width:1600,height:1000},fillRect(){},drawImage(...args){images.push(args);},save(){},translate(){},scale(){},restore(){},beginPath(){},moveTo(x,y){lines.push([x,y]);},lineTo(x,y){lines.push([x,y]);},stroke(){},arc(...args){arcs.push(args);},fill(){}};
  drawVideoFrame(ctx,board,background,.75);
  assert.equal(images.length,1);assert.equal(images[0][0],background);
  assert.equal(lines.at(-1)[0],trace.tip.x);assert.equal(lines.at(-1)[1],trace.tip.y);
  assert.equal(arcs[0][0],trace.tip.x);assert.equal(arcs[0][1],trace.tip.y);
  const staticSvg=timelineSvg(doc,{layout:board,showLine:false});
  assert.ok(staticSvg.includes('FIRST')&&staticSvg.includes('LAST'),'all connected bubbles must stay in the cached video board');
  assert.ok(staticSvg.includes('data-trace="" d=""'));
});

test('playback follows the age-spaced line and holds final state for 1.2 seconds',()=>{
  assert.equal(playbackPosition(6,.5).index,2);assert.equal(playbackPosition(0,1).index,-1);
  const {duration}=playbackTime(2,0);
  assert.equal(playbackTime(2,duration-1201).progress<1,true);
  assert.equal(playbackTime(2,duration-1200).progress,1);
  assert.equal(playbackTime(2,duration-1).complete,false);assert.equal(playbackTime(2,duration).complete,true);
  assert.ok(playbackTime(100,0).duration>playbackTime(6,0).duration);
});
