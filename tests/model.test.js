import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyDocument,event,validateDocument,parseDocument,guideEvents,appendGuide,chartGeometry,sortedEvents,escapeXml,cleanText,timelineLayout,wrapText,rasterPlan,playbackPosition,playbackTime,documentHeading,periodLabel,removeEvents,restoreEvents,layoutSpecs} from '../model.js';
import {exportSvg,timelineSvg,traceGeometry,drawVideoFrame,cameraState,cameraSchedule,cameraFrameSvg,videoAssetPlan} from '../export.js';

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
      const obstacles=[other,{x:other.x+4,y:other.y+5,width:other.width,height:other.height},{x:other.x-7,y:other.y-27,width:38,height:38},{x:other.x+other.width-62,y:other.y-14,width:53,height:29}];
      for(const obstacle of obstacles)for(let i=1;i<b.connector.length;i++)assert.ok(!segmentEntersRect(b.connector[i-1],b.connector[i],obstacle),'connector must not cross another event, including its number/score stamp');
    }
  }
  return board;
}

test('dense guides fold into a readable single canvas at the selected aspect ratio',()=>{
  for(const layout of ['wide','square','portrait']){
    for(const amount of [0,1,6,27,100]){
      const doc={...emptyDocument(),layout,events:Array.from({length:amount},(_,i)=>event(i,`${i}歳`,`できごと${i}`,i%11,'コメントを残します。'))};
      const board=assertBoardGeometry(doc),svg=exportSvg(doc);
      assert.ok(Math.abs(board.width/board.height-layoutSpecs[layout].ratio)<.002);
      assert.equal((svg.match(/data-kind="bubble"/g)||[]).length,amount);
      for(const row of board.rows){
        const points=board.points.filter(point=>point.row===row.index);
        assert.ok(points.length<=9,'each local chart must stay readable');
        for(let i=1;i<points.length;i++)if(points[i].age>points[i-1].age)assert.ok(points[i].x-points[i-1].x>=67.9);
      }
      for(const bubble of board.bubbles){assert.equal(bubble.titleLines.join(''),bubble.title);assert.equal(bubble.commentLines.join(''),bubble.comment);}
      assert.ok(!svg.includes('NaN'));
      if(amount===27){assert.ok(board.rows.length>=3);assert.ok(board.width/board.height>layoutSpecs[layout].ratio*.99);}
    }
  }
});
test('each folded row declares a truthful local age axis and never draws diagonal chart data across folds',()=>{
  const doc={...emptyDocument(),events:[event(0),event(6),event(7),event(8),event(30),event(32),event(35)]};
  const board=assertBoardGeometry(doc),svg=exportSvg(doc);
  assert.ok(board.rows.length>1);
  for(const row of board.rows){
    const points=board.points.filter(point=>point.row===row.index);
    for(const point of points){const expected=row.minAge===row.maxAge?row.box.x+row.box.width/2:row.box.x+(point.age-row.minAge)/(row.maxAge-row.minAge)*row.box.width;assert.equal(point.x,expected);}
    assert.ok(svg.includes(`${row.minAge}〜${row.maxAge}歳`)||svg.includes(`${row.minAge}歳`));
  }
  assert.equal((traceGeometry(board,1).path.match(/M/g)||[]).length,board.rows.filter(row=>row.eventIds.length).length);
  assert.ok(svg.includes('次の段へ'));
});
test('same-age records remain distinct, with local non-overlapping cards and safe connectors',()=>{
  for(const layout of ['wide','square','portrait']){
    const doc={...emptyDocument(),layout,events:Array.from({length:27},(_,i)=>event(10,`同年齢${i}`,`出来事${i}`,i%3-1,'同じ時期の記録'))};
    const board=assertBoardGeometry(doc);
    for(const row of board.rows)assert.equal(new Set(board.points.filter(point=>point.row===row.index).map(point=>point.x)).size,1);
    assert.equal(new Set(board.bubbles.map(bubble=>bubble.id)).size,27);
    assert.deepEqual(timelineLayout(doc),board);
  }
});
test('long comments, wide Latin glyphs and names are retained without title-field duplication',()=>{
  const doc={...emptyDocument(),name:'名'.repeat(40),title:'以前の自由タイトル',events:[event(0,'M'.repeat(40),'W'.repeat(80),5,'W'.repeat(300)),event(1,'1歳','改行の多い記録',6,'あ\n'.repeat(140))]};
  const board=assertBoardGeometry(doc),svg=exportSvg(doc);
  assert.equal(documentHeading(doc),'名'.repeat(40)+'の人生年表');
  assert.equal(documentHeading({...doc,name:'  '}),'わたしの人生年表');
  assert.equal(periodLabel(doc.events[1]),'1歳');
  assert.equal(periodLabel(event(6,'小学校1年生')),'6歳 / 小学校1年生');
  assert.ok(!svg.includes('以前の自由タイトル'));
  assert.equal(parseDocument(JSON.stringify(doc)).title,'以前の自由タイトル','legacy backup field is preserved');
  assert.ok(board.rows[0].y>=72+board.titleLines.length*50);
  for(const bubble of board.bubbles){assert.ok(bubble.titleLines.every(line=>Array.from(line).length*21<bubble.width-30));assert.equal(bubble.commentLines.join(''),bubble.comment.replaceAll('\n',''));}
  assert.equal(wrapText('\nW\n',10).join('\n'),'\nW\n');
});
test('blank guide entries do not export repeated editor instructions or invented titles',()=>{
  const doc={...emptyDocument(),events:guideEvents('school',27)};
  const board=timelineLayout(doc),svg=exportSvg(doc);
  assert.ok(board.bubbles.every(bubble=>bubble.titleLines.length===0));
  assert.ok(!svg.includes('できごとを入力'));
  assert.ok(!cameraFrameSvg(doc,0).includes('できごとを入力'));
  const withComment={...doc,events:[{...doc.events[0],comment:'コメントだけを残します。'}]};
  assert.ok(exportSvg(withComment).includes('コメントだけを'));
  assert.equal(parseDocument(JSON.stringify(doc)).events[0].title,'');
});
test('bulk delete and undo preserve records, original order and intervening additions',()=>{
  const records=[event(10),event(0),event(5),event(5)],doc={...emptyDocument(),events:records};
  const result=removeEvents(doc,[records[0].id,records[2].id]);
  assert.deepEqual(result.document.events,[records[1],records[3]]);assert.equal(doc.events.length,4);
  assert.deepEqual(restoreEvents(result.document,result.removed).events,records);
  const extra=event(30);assert.deepEqual(restoreEvents({...result.document,events:[...result.document.events,extra]},result.removed).events,[...records,extra]);
  assert.deepEqual(restoreEvents(restoreEvents(result.document,result.removed),result.removed).events,records,'undo is idempotent by ID');
  const all=removeEvents(doc,doc.events.map(record=>record.id));assert.equal(all.document.events.length,0);assert.deepEqual(restoreEvents(all.document,all.removed).events,records);
  assert.equal(removeEvents(doc,[]).removed.length,0);
  assert.throws(()=>restoreEvents({...doc,events:Array.from({length:100},()=>event())},result.removed));
});
test('interactive board exposes point and card controls, while export stays noninteractive',()=>{
  const doc={...emptyDocument(),events:[event(0),event(20)]},svg=timelineSvg(doc,{interactive:true,selectedId:doc.events[0].id});
  assert.match(svg,/role="group"/);assert.equal((svg.match(/role="button"/g)||[]).length,4);assert.equal((svg.match(/aria-pressed="true"/g)||[]).length,2);
  assert.match(exportSvg(doc),/role="img"/);assert.doesNotMatch(exportSvg(doc),/role="button"/);
});
test('PNG rasterization bounds memory without cropping the whole one-canvas export',()=>{
  for(const [width,height]of[[1600,1000],[100000,300000]]){const plan=rasterPlan(width,height);assert.ok(plan.width<=8192&&plan.height<=8192&&plan.width*plan.height<=16000000);assert.ok(Math.abs(plan.width/width-plan.height/height)<1/Math.min(width,height));}
});
test('video camera follows chronological point positions, then reveals and reads the current card',()=>{
  const doc={...emptyDocument(),events:[event(0,'','FIRST',0,'最初の記録'),event(1,'','SECOND',10,'次の記録'),event(2,'','THIRD',2,'最後の記録')]};
  const board=timelineLayout(doc),schedule=cameraSchedule(board);
  const first=cameraState(board,0);assert.equal(first.index,0);assert.equal(first.revealed,0);assert.ok(first.camera.x<=board.points[0].x&&first.camera.x+first.camera.width>=board.points[0].x);assert.ok(first.camera.x>=0);
  for(const scene of schedule.scenes){
    const hold=cameraState(board,scene.start+scene.move+scene.hold*.5);
    assert.equal(hold.revealed,scene.index);assert.equal(hold.progress,scene.index/(board.points.length-1));
    const bubble=board.bubbles[scene.index];assert.ok(bubble.x>=hold.camera.x&&bubble.x+bubble.width<=hold.camera.x+hold.camera.width);
    assert.ok(18*1600/hold.camera.width>=18,'held card text must remain legible');
    const svg=cameraFrameSvg(doc,scene.start+scene.move+scene.hold*.5);
    assert.equal((svg.match(/data-kind="bubble"/g)||[]).length,scene.index+1,'future comments must not be revealed');
  }
  const moving=cameraState(board,schedule.scenes[1].start+schedule.scenes[1].move*.65);assert.equal(moving.revealed,0);assert.ok(moving.progress>0&&moving.progress<.5);
  assert.equal(cameraState(board,schedule.duration-1).complete,false);assert.equal(cameraState(board,schedule.duration).complete,true);
});
test('same-age camera holds remain readable and very long comments pan to their end',()=>{
  for(const layout of ['wide','square','portrait']){
    const doc={...emptyDocument(),layout,events:Array.from({length:100},(_,i)=>event(10,'','出来事'+i,5,'コメント'))},board=timelineLayout(doc),scene=cameraSchedule(board).scenes[0];
    const state=cameraState(board,scene.move+scene.hold*.5,layoutSpecs[layout].ratio);assert.ok(18*layoutSpecs[layout].width/state.camera.width>=18);
  }
  const doc={...emptyDocument(),events:[event(0,'','長文',5,'あ\n'.repeat(140))]},board=timelineLayout(doc),scene=cameraSchedule(board).scenes[0];
  const start=cameraState(board,scene.move+scene.hold*.2),end=cameraState(board,scene.end);
  assert.ok(end.camera.y>start.camera.y);assert.ok(end.camera.y+end.camera.height>=board.bubbles[0].y+board.bubbles[0].height);
});
test('video prepares bounded cached assets and uses the same camera transform as frame previews',()=>{
  const doc={...emptyDocument(),events:[event(0,'','FIRST',0),event(20,'','LAST',10)]},board=timelineLayout(doc),scene=cameraSchedule(board).scenes[1],elapsed=scene.start+scene.move+scene.hold*.5;
  const images=[],transforms=[],ctx={canvas:{width:1600,height:1000},fillRect(){},drawImage(...args){images.push(args);},save(){},translate(...args){transforms.push(args);},scale(){},restore(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},arc(){},fill(){},strokeText(){},fillText(){}};
  const assets={base:{},cards:board.bubbles.map(()=>({}))},state=drawVideoFrame(ctx,board,assets,elapsed),expected=cameraState(board,elapsed,1.6);
  assert.deepEqual(state.camera,expected.camera);assert.deepEqual(transforms[0],[-expected.camera.x,-expected.camera.y]);assert.equal(images.length,3);
  assert.ok(videoAssetPlan(board).allowed);
  const huge=timelineLayout({...emptyDocument(),events:Array.from({length:100},()=>event(10,'','長文',5,'\n'.repeat(150)))});
  assert.equal(videoAssetPlan(huge).allowed,false);assert.equal(videoAssetPlan(board,{maxPixels:1}).allowed,false);
});
test('preview playback still retains its final hold independently of camera video duration',()=>{
  assert.equal(playbackPosition(6,.5).index,2);assert.equal(playbackPosition(0,1).index,-1);
  const {duration}=playbackTime(2,0);assert.equal(playbackTime(2,duration-1200).progress,1);assert.equal(playbackTime(2,duration-1).complete,false);assert.equal(playbackTime(2,duration).complete,true);
});
