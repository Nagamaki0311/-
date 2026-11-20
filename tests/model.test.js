import test from 'node:test';
import assert from 'node:assert/strict';
import {BIRTH_ANCHOR_ID,NORMAL_EVENT_LIMIT,MAX_EVENTS,AGE_GUIDE_WARNING,emptyDocument,event,validateDocument,parseDocument,guideEvents,appendGuide,chartGeometry,sortedEvents,escapeXml,cleanText,timelineLayout,wrapText,rasterPlan,playbackPosition,playbackTime,documentHeading,periodLabel,removeEvents,restoreEvents,layoutSpecs} from '../model.js';
import {exportSvg,timelineSvg,traceGeometry,drawVideoFrame,cameraState,cameraSchedule,cameraFrameSvg,videoAssetPlan,xImageLayout,writeVideoFrames} from '../export.js';

test('JSON backups round-trip Unicode and negative scores without mutation',()=>{
  const doc={...emptyDocument(),name:'はるか 🏔',events:[event(25,'転機','ひと休み',-10,'気持ちを整えた。\n次の一歩へ。')]};
  const restored=parseDocument(JSON.stringify(doc));
  assert.deepEqual(restored,doc);restored.events[0].title='変更';assert.notEqual(restored.events[0].title,doc.events[0].title);
});
test('untrusted JSON rejects wrong versions, values, identities, and oversized input',()=>{
  const doc={...emptyDocument(),events:[event()]};
  for(const invalid of [null,[],{...doc,version:2},{...doc,layout:'huge'},{...doc,events:[{...doc.events[0],age:1.5}]},{...doc,events:[{...doc.events[0],age:121}]},{...doc,events:[{...doc.events[0],score:-11}]},{...doc,events:[{...doc.events[0],title:'x'.repeat(81)}]},{...doc,events:[doc.events[0],doc.events[0]]},{...doc,events:[{...doc.events[0],id:'a\rb'}]},{...doc,title:'a\0b'},{...doc,title:'\ud800'},{...doc,birth:{...doc.birth,score:-11}},{...doc,birth:{...doc.birth,age:1}},{...doc,birth:{...doc.birth,id:'other'}}]) assert.throws(()=>validateDocument(invalid));
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
test('chart uses actual ages and stable ties; fixed −10 to 10 y axis',()=>{
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
  const displayCount=doc.events.length+1;
  assert.equal(board.bubbles.length,displayCount);assert.equal(board.points.length,displayCount);
  for(const b of board.bubbles){
    assert.ok(b.x>=0&&b.y>=0&&b.x+b.width<=board.width&&b.y+b.height<=board.height,'full bubble must be within board');
    assert.deepEqual(b.connector[0],{x:b.point.x,y:b.point.y},'connector must start at exact age/score point');
    for(const other of board.bubbles){
      if(b===other)continue;
      assert.ok(!intersects(b,other),'event bubbles must not overlap');
      const obstacles=[other,{x:other.x+4,y:other.y+5,width:other.width,height:other.height}];
      for(const obstacle of obstacles)for(let i=1;i<b.connector.length;i++)assert.ok(!segmentEntersRect(b.connector[i-1],b.connector[i],obstacle),'connector must not cross another event, including its shadow');
    }
  }
  return board;
}

test('all image formats preserve a single readable panorama, even with 121 age events',()=>{
  for(const amount of [0,1,6,30,121]){
    const doc={...emptyDocument(),events:Array.from({length:amount},(_,i)=>event(Math.min(120,i+1),`${Math.min(120,i+1)}歳`,`出来事${i}`,i%11,'コメントを残します。'))};
    const board=assertBoardGeometry(doc),svg=exportSvg(doc);
    for(const value of [board.width,board.height,board.box.x,board.box.y,board.box.width,board.box.height])assert.ok(Number.isFinite(value)&&value>0,'empty and populated board dimensions must be finite and positive');
    assert.equal(board.rows.length,1);assert.equal(board.folded,false);assert.equal(board.panorama,true);
    assert.equal((svg.match(/data-panorama-axis=/g)||[]).length,1);
    assert.doesNotMatch(svg,/次の段へ|data-timeline-row|NaN|Infinity/);
    assert.equal((svg.match(/data-kind="bubble"/g)||[]).length,amount+1);
    assert.ok(board.box.height>=560,'the fixed score range has enough vertical room to show rises and falls');
    for(let i=1;i<board.points.length;i++)if(board.points[i].age>board.points[i-1].age)assert.ok(board.points[i].x-board.points[i-1].x>=327.9,'normal yearly points must have readable separation');
    for(const bubble of board.bubbles){assert.equal(bubble.titleLines.join(''),bubble.title);assert.equal(bubble.commentLines.join(''),bubble.comment);}
    if(amount)assert.equal((traceGeometry(board,1).path.match(/M/g)||[]).length,1);
    for(const layout of ['square','portrait'])assert.deepEqual(timelineLayout({...doc,layout}),board,'video aspect choices must not alter image layout');
  }
});
test('age gaps of three years or more are marked and shortened on one linear score axis',()=>{
  const doc={...emptyDocument(),events:[event(1,'','one',-10),event(3,'','three',0),event(6,'','six',10),event(60,'','last',5)]};
  const board=assertBoardGeometry(doc),svg=exportSvg(doc);
  const [birth,one,three,six,last]=board.points;
  assert.deepEqual(board.breaks.map(({from,to})=>[from,to]),[[3,6],[6,60]]);
  assert.equal(three.x-one.x,2*(one.x-birth.x));
  assert.ok(six.x-three.x<2*(one.x-birth.x));
  assert.equal(last.x-six.x,six.x-three.x);
  assert.equal(one.y,board.box.y+board.box.height);
  assert.equal(six.y,board.box.y);
  assert.equal(three.y,board.box.y+board.box.height/2);
  assert.equal((svg.match(/data-age-break=/g)||[]).length,2);
  assert.match(cameraFrameSvg(doc,0),/data-age-break/);
  assert.match(svg,/0〜60歳/);
  assert.match(svg,/stroke-width="6.5"/);
});
test('normal additions stop at 30 and the age guide can add all 120 editable years',()=>{
  assert.equal(NORMAL_EVENT_LIMIT,30);assert.equal(MAX_EVENTS,121);assert.match(AGE_GUIDE_WARNING,/正常に表示・出力できない/);
  let doc=emptyDocument();
  for(let i=0;i<30;i++)doc=appendGuide(doc,[event(0)],{mode:'manual'});
  assert.equal(doc.events.length,30,'same age and blank label manual entries are distinct records');
  assert.equal(new Set(doc.events.map(record=>record.id)).size,30);
  for(const mode of ['manual','turning','school'])assert.throws(()=>appendGuide(doc,[event(1,'new')],{mode}),/30/);
  assert.throws(()=>appendGuide(emptyDocument(),guideEvents('school',40),{mode:'school'}),/30/);
  const ages=appendGuide(emptyDocument(),guideEvents('age',120),{mode:'age'});
  assert.equal(ages.events.length,120);assert.equal(parseDocument(JSON.stringify(ages)).events.length,120);
  assert.ok(ages.events.every(record=>record.age>0));
  assert.equal(timelineLayout(ages).points.length,121);
  const atLimit=appendGuide({...emptyDocument(),events:[event(0,'birth legacy')]},guideEvents('age',120),{mode:'age'});
  assert.equal(atLimit.events.length,121);
  assert.throws(()=>appendGuide(atLimit,[event(0,'new')],{mode:'age'}),/121/);
  const legacy={...emptyDocument(),events:Array.from({length:100},(_,i)=>event(i))};
  const restored=parseDocument(JSON.stringify(legacy));assert.deepEqual(restored,legacy);
  const removed=removeEvents(restored,restored.events.slice(0,80).map(record=>record.id));
  assert.deepEqual(restoreEvents(removed.document,removed.removed),legacy,'undo restores legacy records above normal addition limit');
  assert.throws(()=>appendGuide(restored,[event(100)],{mode:'manual'}),/30/);
  assert.throws(()=>validateDocument({...legacy,events:Array.from({length:122},()=>event())}),/121/);
});
test('new and fully deleted documents retain a fixed editable birth origin',()=>{
  const before={...emptyDocument(),events:[event(0)]};
  for(const doc of [emptyDocument(),removeEvents(before,[before.events[0].id]).document]){
    const board=timelineLayout(doc),svg=exportSvg(doc),state=cameraState(board,0);
    assert.equal(board.width,1600);assert.ok(board.box.width>1000);assert.match(svg,/width="1600"/);assert.doesNotMatch(svg,/NaN|Infinity/);
    for(const number of [state.camera.x,state.camera.y,state.camera.width,state.camera.height])assert.ok(Number.isFinite(number));
    assert.equal(state.index,0);assert.equal(state.revealed,0);assert.doesNotMatch(cameraFrameSvg(doc,0),/NaN|Infinity/);
    assert.equal(board.points[0].id,BIRTH_ANCHOR_ID);
    assert.equal(board.points[0].age,0);assert.equal(board.points[0].score,0);assert.equal(board.low,-10);assert.match(svg,/0歳 \/ 誕生/);
    assert.equal(doc.events.length,0);
  }
});
test('same-age records remain distinct, with local non-overlapping cards and safe connectors',()=>{
  for(const layout of ['wide','square','portrait']){
    const doc={...emptyDocument(),layout,events:Array.from({length:27},(_,i)=>event(10,`同年齢${i}`,`出来事${i}`,i%3-1,'同じ時期の記録'))};
    const board=assertBoardGeometry(doc);
    for(const row of board.rows)assert.equal(new Set(board.points.filter(point=>point.row===row.index&&point.age===10).map(point=>point.x)).size,1);
    assert.equal(new Set(board.bubbles.map(bubble=>bubble.id)).size,28);
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
  assert.ok(board.headerHeight>=64+board.titleLines.length*50);
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
  assert.throws(()=>restoreEvents({...doc,events:Array.from({length:121},()=>event())},result.removed));
});
test('interactive board exposes point and card controls, while export stays noninteractive',()=>{
  const doc={...emptyDocument(),events:[event(0),event(20)]},svg=timelineSvg(doc,{interactive:true,selectedId:doc.birth.id});
  assert.match(svg,/role="group"/);assert.equal((svg.match(/role="button"/g)||[]).length,6);assert.equal((svg.match(/aria-pressed="true"/g)||[]).length,2);
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
  const doc={...emptyDocument(),birth:{...emptyDocument().birth,title:'長文',score:5,comment:'あ\n'.repeat(140)}},board=timelineLayout(doc),scene=cameraSchedule(board).scenes[0];
  const start=cameraState(board,scene.move+scene.hold*.2),end=cameraState(board,scene.end);
  assert.ok(end.camera.y>start.camera.y);assert.ok(end.camera.y+end.camera.height>=board.bubbles[0].y+board.bubbles[0].height);
});
test('video pulls back from the final comment and holds the entire centered timeline in every format',()=>{
  const doc={...emptyDocument(),events:[event(6),event(9),event(16,'','最後の節目',-6,'長文\n'.repeat(85))]};
  const board=timelineLayout(doc),schedule=cameraSchedule(board),{outro,duration}=schedule;
  const finalScene=schedule.scenes.at(-1),lastBubble=board.bubbles.at(-1);
  assert.equal(outro.start,finalScene.end);
  assert.equal(duration,outro.start+outro.move+outro.hold);
  assert.equal(outro.hold,1400);
  const lastFrame=(Math.ceil(duration*24/1000)-1)*1000/24;
  for(const {ratio,width,height} of Object.values(layoutSpecs)){
    const reading=cameraState(board,outro.start-.01,ratio,schedule);
    const first=cameraState(board,outro.start,ratio,schedule);
    const middle=cameraState(board,outro.start+outro.move/2,ratio,schedule);
    const end=cameraState(board,outro.start+outro.move,ratio,schedule);
    const last=cameraState(board,lastFrame,ratio,schedule);
    assert.ok(reading.camera.y+reading.camera.height>=lastBubble.y+lastBubble.height);
    for(const key of ['x','y','width','height'])assert.ok(Math.abs(reading.camera[key]-first.camera[key])<.01);
    assert.ok(first.camera.width<middle.camera.width&&middle.camera.width<end.camera.width);
    assert.ok(middle.moving&&!end.moving);
    assert.ok(end.camera.x<=0&&end.camera.y<=0);
    assert.ok(end.camera.x+end.camera.width>=board.width-.01&&end.camera.y+end.camera.height>=board.height-.01);
    assert.ok(Math.abs(end.camera.x+end.camera.width/2-board.width/2)<.01);
    assert.ok(Math.abs(end.camera.y+end.camera.height/2-board.height/2)<.01);
    for(const state of [first,middle,end,last]){
      assert.ok(Math.abs(state.camera.width/state.camera.height-ratio)<.000001);
      assert.equal(state.revealed,lastBubble.index);
      assert.equal(state.progress,1);
    }
    assert.deepEqual(last.camera,end.camera);
    const svg=cameraFrameSvg(doc,lastFrame,{aspect:ratio,width,height});
    assert.equal((svg.match(/data-kind="bubble"/g)||[]).length,board.bubbles.length);
  }
});
test('video prepares bounded cached assets and uses the same camera transform as frame previews',()=>{
  const doc={...emptyDocument(),events:[event(0,'','FIRST',0),event(20,'','LAST',10)]},board=timelineLayout(doc),scene=cameraSchedule(board).scenes[1],elapsed=scene.start+scene.move+scene.hold*.5;
  const images=[],transforms=[],ctx={canvas:{width:1600,height:1000},fillRect(){},drawImage(...args){images.push(args);},save(){},translate(...args){transforms.push(args);},scale(){},restore(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},arc(){},fill(){},strokeText(){assert.fail("Video must not draw score labels");},fillText(){assert.fail("Video must not draw score labels");}};
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

test('video keeps 24 fps and visits every frame when writing pauses',async()=>{
  const frames=[];
  const count=await writeVideoFrames(1040,async(timestamp,duration)=>{
    if(frames.length===1)await new Promise(resolve=>setTimeout(resolve,50));
    frames.push({timestamp,duration});
  },()=>{});
  assert.equal(count,25);
  assert.deepEqual(frames,Array.from({length:25},(_,index)=>({timestamp:index/24,duration:1/24})));

  const controller=new AbortController();
  let writes=0;
  await assert.rejects(writeVideoFrames(1040,()=>{
    writes++;
    controller.abort();
  },()=>{},controller.signal),{name:'AbortError'});
  assert.equal(writes,1);
});

test('legacy age-zero records migrate to editable birth without losing data, and cards omit number and score badges',()=>{
  const legacy=event(0,'乳児期','生まれた',4,'実際の記録');
  const old={...emptyDocument(),events:[legacy,event(0,'別の記録')],negative:false};
  delete old.birth;
  const doc=parseDocument(JSON.stringify(old));
  assert.deepEqual(doc.birth,{...legacy,id:BIRTH_ANCHOR_ID});
  assert.equal(doc.events[0].id,old.events[1].id);
  const next=appendGuide(doc,guideEvents('age',2),{mode:'age'});
  assert.equal(next.events.length,3);
  assert.equal(next.birth,doc.birth);
  const svg=exportSvg(next);
  const card=svg.match(/<g [^>]*data-kind="bubble"[^>]*>[\s\S]*?<\/g>/)[0];
  assert.match(card,/0歳 \/ 誕生 \/ 乳児期/);
  assert.doesNotMatch(card,/<circle|\+4|>01</);
  assert.doesNotMatch(svg,/>[+−-]?\d+<|−10〜10/);
});

test('age and school guide imports do not consume a slot for the fixed birth origin',()=>{
  for(const mode of ['age','school']){
    const result=appendGuide(emptyDocument(),guideEvents(mode,12),{mode});
    assert.ok(result.events.every(record=>record.age>0));
    assert.equal(timelineLayout(result).points[0].id,BIRTH_ANCHOR_ID);
  }
  for(const mode of ['turning','manual']){
    const record=event(0,'転機','家族の記録');
    assert.equal(appendGuide(emptyDocument(),[record],{mode}).events[0],record);
  }
});

test('design selection survives backup; older backups default to A',()=>{
  const source=emptyDocument();
  delete source.design;
  assert.equal(validateDocument(source).design,'A');
  for(const design of 'ABCDE'){
    assert.equal(parseDocument(JSON.stringify({...source,design})).design,design);
  }
  assert.throws(()=>validateDocument({...source,design:'F'}),/出力デザイン/);
});

test('five design palettes apply to image exports and video frame previews',()=>{
  const events=[event(0,'誕生','',2),event(4,'','入学',9),event(8,'','卒業',3)];
  for(const [design,paper] of Object.entries({A:'#ffffff',B:'#101824',C:'#ecf4f2',D:'#eff5ff',E:'#101719'})){
    const doc={...emptyDocument(),design,events};
    const image=exportSvg(doc);
    const video=cameraFrameSvg(doc,cameraSchedule(timelineLayout(doc)).duration);
    for(const svg of [image,video]){
      assert.ok(svg.includes(`data-design="${design}"`));
      assert.ok(svg.includes(`fill="${paper}"`));
      if(design==='E')for(const color of ['#55df9a','#ff7d86'])assert.ok(svg.includes(`stroke="${color}"`));
    }
  }
});

test('birth edits persist, stay fixed through deletion, and do not use an ordinary event slot',()=>{
  const edited={...emptyDocument(),birth:{...emptyDocument().birth,title:'出生',comment:'家族の記録',score:-10}};
  let doc=edited;
  for(let i=0;i<NORMAL_EVENT_LIMIT;i++)doc=appendGuide(doc,[event(0,'別の記録')],{mode:'manual'});
  assert.equal(timelineLayout(doc).points[0].id,BIRTH_ANCHOR_ID);
  const deleted=removeEvents(doc,[BIRTH_ANCHOR_ID,...doc.events.map(record=>record.id)]).document;
  assert.equal(deleted.events.length,0);
  const restored=parseDocument(JSON.stringify(deleted));
  assert.deepEqual(restored.birth,edited.birth);
  assert.match(exportSvg(restored),/家族の記録/);
});


test('X JPEG fits the whole panorama into bounded dimensions with centered padding',()=>{
  assert.deepEqual(xImageLayout(8192,1024),{
    width:2048,height:683,contentWidth:2048,contentHeight:256,x:0,y:213
  });
  assert.deepEqual(xImageLayout(1024,8192),{
    width:683,height:2048,contentWidth:256,contentHeight:2048,x:213,y:0
  });
  assert.deepEqual(xImageLayout(1200,630),{
    width:1200,height:630,contentWidth:1200,contentHeight:630,x:0,y:0
  });
  for(const [width,height] of [[8192,1],[1,8192],[2049,2049]]){
    const frame=xImageLayout(width,height);
    assert.ok(frame.width <= 2048 && frame.height <= 2048);
    assert.ok(frame.width <= frame.height*3 && frame.height <= frame.width*3);
    assert.ok(frame.x+frame.contentWidth <= frame.width && frame.y+frame.contentHeight <= frame.height);
  }
});
