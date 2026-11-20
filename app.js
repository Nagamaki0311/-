import {BIRTH_ANCHOR_ID,MIN_SCORE,timelineEvents,NORMAL_EVENT_LIMIT,AGE_GUIDE_WARNING,STORAGE_KEY,emptyDocument,sampleDocument,event,sortedEvents,parseDocument,guideEvents,appendGuide,escapeXml,cleanText,timelineLayout,rasterPlan,playbackPosition,playbackTime,documentHeading,periodLabel,removeEvents,restoreEvents} from './model.js';
import {timelineSvg,traceGeometry,traceSegments,exportSvg,svgToCanvas,canvasBlob,videoMime,createVideo,cameraSchedule} from './export.js';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)], esc=escapeXml;
let doc=emptyDocument(),sample=sampleDocument(),showingSample=true,selectedId=null,guide='turning',toastTimer,undo=null;
let playRaf=0,playStart=0,playElapsed=0,playing=false,playProgress=1;
let exportDoc=null,pngPromise=null,pngBlob=null,pngPreviewUrl=null,videoBlob=null,videoUrl=null,videoKey=null,videoController=null;
let previewLayout=null,previewKey='',highlightedId='',boardZoom=.85;
let checkedIds=new Set(),pendingDeleteIds=[];
// ===== SECTION: Persistence and user feedback =====
function toast(message,action=null) {
  clearTimeout(toastTimer);const box=$('#toast');box.replaceChildren(document.createTextNode(message));
  if(action){const button=document.createElement('button');button.textContent=action.label;button.addEventListener('click',action.run,{once:true});box.append(button);}
  box.classList.add('visible');toastTimer=setTimeout(()=>box.classList.remove('visible'),action?12000:6000);
}
function persist() {
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(doc));$('#save-status').textContent='✓ 端末内に保存済み';$('#save-status').style.color='';}
  catch{$('#save-status').textContent='自動保存できません';$('#save-status').style.color='#a33b2c';toast('このブラウザに保存できません。編集データをJSONで保存してください。');}
}
try{const stored=localStorage.getItem(STORAGE_KEY);if(stored){doc=parseDocument(stored);showingSample=false;}}
catch{toast('保存データを読み込めませんでした。元のデータは上書きせず保持しています。必要ならJSONから読み込んでください。');}
function currentDoc(){return showingSample?sample:doc;}
function ensureOwn(){if(showingSample){showingSample=false;selectedId=null;stopPlayback(true);$('#sample-notice').hidden=true;$('#sample-badge').hidden=true;$('#json-save').textContent='↓ 編集データを保存';}}
function commit(){ensureOwn();persist();renderPreview();}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
function filename(ext,page=''){return `人生年表${page?'_'+page:''}.${ext}`;}
function setMobileView(view){document.body.dataset.mobileView=view;$('#tab-edit').classList.toggle('active',view==='edit');$('#tab-preview').classList.toggle('active',view==='preview');$('#tab-edit').setAttribute('aria-pressed',view==='edit');$('#tab-preview').setAttribute('aria-pressed',view==='preview');}
$('#tab-edit').onclick=()=>setMobileView('edit');$('#tab-preview').onclick=()=>setMobileView('preview');
// ===== SECTION: Editor and guides =====
function renderEditor(){
  $('#name').value=doc.name;
  checkedIds=new Set([...checkedIds].filter(id=>doc.events.some(e=>e.id===id)));
  $('#sample-notice').hidden=!showingSample;$('#event-count').textContent=doc.events.length;
  $$('#sample-badge').forEach(e=>e.hidden=!showingSample);
  const list=timelineEvents(doc);
  if(selectedId&&!list.some(e=>e.id===selectedId)&&!showingSample)selectedId=null;
  $('#event-list').innerHTML=list.map((e,i)=>{
    const open=e.id===selectedId;
    const fixed=e.id===BIRTH_ANCHOR_ID;
    const selection=fixed?'':`<label class="event-select-label"><input class="event-select" type="checkbox" aria-label="節目${i}を選択" ${checkedIds.has(e.id)?'checked':''}><span class="visually-hidden">選択</span></label>`;
    const timing=fixed?'':`<div class="event-two-fields"><label>年齢<input type="number" data-field="age" min="0" max="120" step="1" required value="${e.age}" aria-label="節目${i}の年齢"></label><label>区分・時期<input data-field="label" maxlength="40" value="${esc(e.label)}" placeholder="例：高校3年生"></label></div>`;
    const remove=fixed?'':'<button class="delete-event" type="button">この節目を削除</button>';
    return `<article class="event-item${open?' selected':''}" data-id="${esc(e.id)}">
      <div class="event-row">${selection}<button class="event-toggle" aria-expanded="${open}" aria-controls="event-${i}"><span class="event-index">${fixed?'':String(i).padStart(2,'0')}</span><span class="event-toggle-body"><small>${esc(periodLabel(e,fixed))}</small><b>${esc(e.title||'未入力')}</b></span><span class="event-score">${e.score}</span><span class="chevron" aria-hidden="true">${open?'−':'＋'}</span></button></div>
      <div class="event-fields" id="event-${i}" ${open?'':'hidden'}>${timing}
        <label>できごと<input data-field="title" maxlength="80" value="${esc(e.title)}" placeholder="例：はじめての一人暮らし"></label>
        <label>コメント <textarea data-field="comment" maxlength="300" rows="2" placeholder="コメントを入力">${esc(e.comment)}</textarea></label>
        <div><div class="score-label"><label for="score-${i}">人生の調子</label><output id="score-output-${i}">${e.score}</output></div><input id="score-${i}" type="range" data-field="score" min="${MIN_SCORE}" max="10" step="1" value="${e.score}" aria-describedby="score-output-${i}"><div class="range-ends"><span>−10 低い</span><span>10 高い</span></div></div>${remove}
      </div></article>`;
  }).join('');
  $('#add-event').disabled=doc.events.length>=NORMAL_EVENT_LIMIT;
  updateBulkControls();updateGuideNotice();
  $('#json-save').textContent=showingSample?'↓ サンプルの編集データを保存':'↓ 編集データを保存';
  updateLayoutButtons();
}
function updateGuideNotice(){
  const warning=$('#age-warning');warning.hidden=guide!=='age'&&doc.events.length<=NORMAL_EVENT_LIMIT;
  warning.textContent=guide==='age'?AGE_GUIDE_WARNING:'30件を超える年表は、正常に表示・出力できない場合があります。';
}
function updateLayoutButtons(){const layout=currentDoc().layout;$$('[data-layout]').forEach(b=>{b.classList.toggle('selected',b.dataset.layout===layout);b.setAttribute('aria-pressed',b.dataset.layout===layout);});}
$('#name').addEventListener('input',e=>{ensureOwn();doc.name=cleanText(e.target.value);commit();});
$('#start-own').onclick=()=>{ensureOwn();persist();renderEditor();renderPreview();$('#name').focus();};
$$('[data-guide]').forEach(b=>b.onclick=()=>{
  guide=b.dataset.guide;
  $$('[data-guide]').forEach(x=>{x.classList.toggle('selected',x===b);x.setAttribute('aria-pressed',x===b);});
  $('#work-start-label').hidden=guide!=='school';
  $('#guide-hint').textContent=guide==='age'?'1歳から現在まで1歳ずつ追加します。0歳／誕生は固定です。':guide==='school'?'学校の学年と社会人の年数を追加します。':'指定した年齢の節目を追加します。';updateGuideNotice();
});
$('#apply-guide').onclick=()=>{
  try{
    const ageInput=$('#current-age'),workInput=$('#work-start');
    if(!ageInput.reportValidity()||(guide==='school'&&!workInput.reportValidity()))return;
    const generated=guideEvents(guide,Number(ageInput.value),Number(workInput.value));
    const next=appendGuide(doc,generated,{mode:guide}),added=next.events.length-doc.events.length;
    ensureOwn();doc=next;if(added)selectedId=doc.events.at(-added).id;persist();renderEditor();renderPreview();toast(added?`${added}件の節目を追加しました。`:'同じ年齢・区分の節目は、すでに追加されています。');
  }catch(e){toast(e.message);}
};
$('#add-event').onclick=()=>{
  if(doc.events.length>=NORMAL_EVENT_LIMIT){toast(`節目は${NORMAL_EVENT_LIMIT}件までです。`);return;}
  ensureOwn();const e=event(sortedEvents(doc.events).at(-1)?.age??0);doc=appendGuide(doc,[e],{mode:'manual'});selectedId=e.id;persist();renderEditor();renderPreview();
  const target=[...$('#event-list').children].find(el=>el.dataset.id===e.id);target?.querySelector('[data-field=title]')?.focus();
};
$('#event-list').addEventListener('click',e=>{
  const item=e.target.closest('.event-item');if(!item)return;
  if(e.target.closest('.event-toggle')){const id=item.dataset.id;selectedId=selectedId===id?null:id;renderEditor();renderPreview();if(selectedId)revealEvent(selectedId);[...$('#event-list').children].find(el=>el.dataset.id===id)?.querySelector('.event-toggle')?.focus({preventScroll:true});return;}
  if(e.target.closest('.delete-event'))deleteRecords([item.dataset.id]);
});
function updateBulkControls(){
  $('#bulk-count').textContent=`${checkedIds.size}件選択`;
  $('#bulk-delete').disabled=!checkedIds.size;$('#delete-all').disabled=!doc.events.length;
  const all=$('#bulk-select-all');all.checked=doc.events.length>0&&checkedIds.size===doc.events.length;all.indeterminate=checkedIds.size>0&&checkedIds.size<doc.events.length;all.disabled=!doc.events.length;
}
function deleteRecords(ids){
  const result=removeEvents(doc,ids);if(!result.removed.length)return;
  ensureOwn();stopPlayback(true);doc=result.document;undo=result.removed;checkedIds.clear();selectedId=null;persist();renderEditor();renderPreview();
  toast(`${result.removed.length}件の節目を削除しました。`,{label:'元に戻す',run:()=>{
    if(!undo)return;try{doc=restoreEvents(doc,undo);selectedId=undo[0]?.record.id||null;undo=null;persist();renderEditor();renderPreview();toast('削除した節目を元の順序で戻しました。');}catch(error){toast(error.message);}
  }});
  $('#add-event').focus({preventScroll:true});
}
function confirmBulkDelete(ids){
  if(!ids.length)return;pendingImport=null;pendingDeleteIds=[...ids];
  $('#confirm-title').textContent=`${ids.length}件の節目を削除しますか？`;
  $('#confirm-message').textContent='選択した節目をまとめて削除します。0歳／誕生は残ります。削除後は「元に戻す」で取り消せます。';
  $('#confirm-yes').textContent='削除する';$('#confirm-dialog').showModal();
}
$('#bulk-select-all').onchange=e=>{checkedIds=e.target.checked?new Set(doc.events.map(record=>record.id)):new Set();renderEditor();};
$('#bulk-delete').onclick=()=>confirmBulkDelete([...checkedIds]);
$('#delete-all').onclick=()=>confirmBulkDelete(doc.events.map(record=>record.id));
$('#event-list').addEventListener('change',e=>{if(!e.target.classList.contains('event-select'))return;const id=e.target.closest('.event-item').dataset.id;if(e.target.checked)checkedIds.add(id);else checkedIds.delete(id);updateBulkControls();});
$('#event-list').addEventListener('input',e=>{
  const field=e.target.dataset.field;if(!field)return;
  const item=e.target.closest('.event-item');
  const fixed=item.dataset.id===BIRTH_ANCHOR_ID;
  const record=fixed?doc.birth:doc.events.find(x=>x.id===item.dataset.id);
  if(!record)return;
  if(showingSample){
    ensureOwn();
    selectedId=record.id;
  }
  if(field==='age'||field==='score'){
    if(!e.target.validity.valid||e.target.value==='')return;
    record[field]=Number(e.target.value);
  }else record[field]=cleanText(e.target.value);
  item.querySelector('.event-toggle-body small').textContent=periodLabel(record,fixed);
  item.querySelector('.event-toggle-body b').textContent=record.title||'未入力';
  item.querySelector('.event-score').textContent=record.score;
  item.querySelector('output').value=record.score;
  stopPlayback(true);commit();
});
$('#event-list').addEventListener('change',e=>{if(e.target.dataset.field==='age'){if(e.target.value===''||!e.target.validity.valid){const record=doc.events.find(x=>x.id===e.target.closest('.event-item').dataset.id);e.target.value=record?.age??0;toast('年齢は0〜120の整数で入力してください。元の年齢を保持しました。');return;}renderEditor();}});
$$('[data-layout]').forEach(b=>b.onclick=()=>{if(showingSample)sample.layout=b.dataset.layout;else{doc.layout=b.dataset.layout;persist();}updateLayoutButtons();renderPreview();});
// ===== SECTION: Preview and playback =====
function activePreviewId(list){
  if(playing||playProgress<1)return list[playbackPosition(list.length,playProgress).index]?.id||'';
  return list.find(e=>e.id===selectedId)?.id||list.at(-1)?.id||'';
}
function updateBoardProgress(progress,activeId){
  if(!previewLayout)return;
  const root=$('#chart'),trace=traceGeometry(previewLayout,progress),area=root.querySelector('[data-area]'),path=root.querySelector('[data-trace]'),tip=root.querySelector('[data-trace-tip]');
  const segments=root.querySelector('[data-trace-segments]');
  const design=previewLayout.design;
  path?.setAttribute('d',design==='E'?'':trace.path);area?.setAttribute('d',trace.area);
  if(segments&&design==='E')segments.innerHTML=traceSegments(trace.visible,design);
  if(tip){tip.setAttribute('r',trace.tip?'8':'0');if(trace.tip){tip.setAttribute('cx',trace.tip.x);tip.setAttribute('cy',trace.tip.y);}}
  if(highlightedId!==activeId){
    root.querySelectorAll('[data-event-id][role=button]').forEach(el=>{
      const active=el.dataset.eventId===activeId;el.classList.toggle('is-selected',active);el.setAttribute('aria-pressed',active);
      const outline=el.querySelector('.bubble-outline');if(outline){outline.setAttribute('stroke',active?outline.dataset.activeBorder:outline.dataset.border);outline.setAttribute('stroke-width',active?'4':'2.5');}
    });
    highlightedId=activeId;
  }
}
function applyZoom(preserveCenter=true){
  if(!previewLayout)return;
  const viewport=$('#board-viewport'),board=$('#chart'),oldWidth=board.getBoundingClientRect().width||previewLayout.width*boardZoom;
  const ratio=previewLayout.width*boardZoom/oldWidth,cx=viewport.scrollLeft+viewport.clientWidth/2,cy=viewport.scrollTop+viewport.clientHeight/2;
  board.style.width=`${previewLayout.width*boardZoom}px`;
  $('#zoom-value').value=`${Math.round(boardZoom*100)}%`;
  if(preserveCenter){viewport.scrollLeft=cx*ratio-viewport.clientWidth/2;viewport.scrollTop=cy*ratio-viewport.clientHeight/2;}
}
let jumpEventsKey='';
function renderPreview(){
  const d=currentDoc(),key=JSON.stringify(d);
  if(key!==previewKey)previewLayout=timelineLayout(d);
  const active=activePreviewId(previewLayout.points);
  $('#sample-badge').hidden=!showingSample;
  if(key!==previewKey){
    previewKey=key;
    for(const button of $$('[data-output-design]')){
      button.setAttribute('aria-pressed',String(button.dataset.outputDesign===(d.design||'A')));
    }
    $('#chart').innerHTML=timelineSvg(d,{layout:previewLayout,selectedId:active,progress:playProgress,interactive:true});
    const jump=$('#milestone-jump');
    const eventsKey=JSON.stringify([d.birth,d.events]);
    if(jumpEventsKey!==eventsKey){
      const previous=jump.value;
      jump.replaceChildren(new Option('節目を選択',''));
      for(const bubble of previewLayout.bubbles){
        jump.add(new Option(bubble.periodLines.join('')+(bubble.title?' — '+bubble.title:''),bubble.id));
      }
      jump.value=[...jump.options].some(option=>option.value===previous)?previous:'';
      jumpEventsKey=eventsKey;
    }
    highlightedId=active;$('#board-summary').textContent=`${previewLayout.points.length}件 / ${previewLayout.width}×${previewLayout.height}px`;applyZoom(false);
  }
  updateBoardProgress(playProgress,active);
}
for(const button of $$('[data-output-design]')){
  button.onclick=()=>{
    const current=currentDoc();
    if(current.design===button.dataset.outputDesign)return;
    current.design=button.dataset.outputDesign;
    if(!showingSample)persist();
    renderPreview();
  };
}
function revealEvent(id){
  const bubble=previewLayout?.bubbles.find(b=>b.id===id);if(!bubble)return;
  const viewport=$('#board-viewport');viewport.scrollTo({left:Math.max(0,(bubble.x+bubble.width/2)*boardZoom-viewport.clientWidth/2),top:Math.max(0,bubble.y*boardZoom-30),behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
}
$('#milestone-jump').onchange=e=>{
  if(!e.target.value)return;
  stopPlayback(true);
  selectedId=e.target.value;
  if(!showingSample)renderEditor();
  renderPreview();
  revealEvent(e.target.value);
};
function selectPoint(target){
  const point=target.closest('[data-event-id]');if(!point)return;
  const keepFocus=point.contains(document.activeElement),kind=point.dataset.kind;
  stopPlayback(true);selectedId=point.dataset.eventId;if(!showingSample)renderEditor();renderPreview();
  if(keepFocus)[...$('#chart').querySelectorAll('[data-event-id]')].find(el=>el.dataset.eventId===selectedId&&el.dataset.kind===kind)?.focus({preventScroll:true});
}
$('#chart').addEventListener('click',e=>selectPoint(e.target));
$('#chart').addEventListener('focusin',()=>{if(playing){stopPlayback();$('#play-label').textContent='一時停止';}});
$('#chart').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectPoint(e.target);}});
$('#zoom-in').onclick=()=>{boardZoom=Math.min(1.8,boardZoom*1.25);applyZoom();};
$('#zoom-out').onclick=()=>{boardZoom=Math.max(.08,boardZoom/1.25);applyZoom();};
$('#zoom-readable').onclick=()=>{boardZoom=.85;applyZoom();};
$('#zoom-fit').onclick=()=>{if(!previewLayout)return;const v=$('#board-viewport');boardZoom=Math.max(.001,Math.min(1,v.clientWidth/previewLayout.width,v.clientHeight/previewLayout.height));applyZoom();v.scrollTop=0;v.scrollLeft=0;};
function stopPlayback(reset=false){cancelAnimationFrame(playRaf);playing=false;$('#play').textContent='▶';$('#play').setAttribute('aria-label','年表を再生');if(reset){playElapsed=0;playProgress=1;$('#play-label').textContent='年表を再生';$('#play-hint').textContent='';}}
function frame(now){playElapsed=now-playStart;const state=playbackTime(previewLayout.points.length,playElapsed);playProgress=state.progress;updateBoardProgress(playProgress,previewLayout?.points[playbackPosition(previewLayout.points.length,playProgress).index]?.id||'');if(!state.complete){playRaf=requestAnimationFrame(frame);}else{selectedId=previewLayout?.points.at(-1)?.id||null;stopPlayback();playElapsed=0;$('#play-label').textContent='再生が終了しました';$('#play-hint').textContent='';}}
$('#play').onclick=()=>{
  if(playing){stopPlayback();$('#play-label').textContent='一時停止';return;}
  playing=true;playStart=performance.now()-playElapsed;$('#play').textContent='Ⅱ';$('#play').setAttribute('aria-label','再生を一時停止');$('#play-label').textContent='再生中';$('#play-hint').textContent='点を選ぶと停止します。';playRaf=requestAnimationFrame(frame);
};
$('#reset-play').onclick=()=>{stopPlayback(true);renderPreview();};
// ===== SECTION: Backups and modal lifecycle =====
$('#json-save').onclick=()=>{download(new Blob([JSON.stringify(currentDoc(),null,2)],{type:'application/json'}),filename('json',showingSample?'サンプル':''));toast(showingSample?'サンプルの編集データを保存しました。あなたの下書きはそのままです。':'再編集用のデータを保存しました。');};
$('#json-open').onclick=()=>$('#json-file').click();
let pendingImport=null;
$('#json-file').onchange=async e=>{
  const file=e.target.files[0];e.target.value='';if(!file)return;
  try{if(file.size>250000)throw new Error('ファイルが大きすぎます（250KBまで）。');pendingImport=parseDocument(await file.text());pendingDeleteIds=[];$('#confirm-yes').textContent='読み込む';$('#confirm-title').textContent='年表データを読み込みますか？';$('#confirm-message').textContent=`${pendingImport.events.length+1}件の節目を読み込みます。現在の年表は置き換わります。必要なら先に「編集データを保存」でバックアップしてください。`;$('#confirm-dialog').showModal();}
  catch(error){pendingImport=null;toast(error.message);}
};
$('#confirm-yes').onclick=()=>{if(pendingDeleteIds.length){const ids=[...pendingDeleteIds];pendingDeleteIds=[];$('#confirm-dialog').close();deleteRecords(ids);return;}if(!pendingImport)return;ensureOwn();stopPlayback(true);doc=pendingImport;pendingImport=null;selectedId=null;undo=null;checkedIds.clear();persist();renderEditor();renderPreview();$('#confirm-dialog').close();toast('年表を読み込みました。');};
$$('.close-dialog').forEach(b=>b.onclick=()=>b.closest('dialog').close());
$('#help-open').onclick=$('#privacy-open').onclick=()=>$('#help-dialog').showModal();
$$('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
$('#confirm-dialog').addEventListener('close',()=>{pendingImport=null;pendingDeleteIds=[];});
// ===== SECTION: Image export and native file sharing =====
function clearPngPreview(){
  if(pngPreviewUrl)URL.revokeObjectURL(pngPreviewUrl);
  pngPreviewUrl=null;
  pngBlob=null;
  $('#export-preview').replaceChildren();
  $('#export-preview').classList.remove('actual-size');
  $('#png-preview-size').setAttribute('aria-pressed','false');
  $('#png-preview-size').textContent='原寸で確認';
}
function refreshExport(){
  clearPngPreview();
  const layout=timelineLayout(exportDoc),svg=exportSvg(exportDoc),plan=rasterPlan(layout.width,layout.height);
  $('#raster-notice').textContent=`PNG：${plan.width} × ${plan.height} px${plan.scaled?'（縮小）':''} / SVG：${layout.width} × ${layout.height} px`;
  const status=$('#png-preview-status'),size=$('#png-preview-size');
  status.textContent='PNGを作成中…';
  size.disabled=$('#png-save').disabled=$('#share').disabled=true;
  const request=svgToCanvas(svg).then(canvasBlob);
  pngPromise=request;
  request.then(blob=>{
    if(pngPromise!==request)return;
    pngBlob=blob;
    pngPreviewUrl=URL.createObjectURL(blob);
    const image=document.createElement('img');
    image.alt='保存されるPNG画像';
    image.width=plan.width;
    image.height=plan.height;
    image.onload=()=>{if(pngPromise===request){status.textContent='PNGプレビュー';size.disabled=false;}};
    image.onerror=()=>{if(pngPromise===request)status.textContent='PNGプレビューを表示できませんでした。';};
    image.src=pngPreviewUrl;
    $('#export-preview').append(image);
    $('#png-save').disabled=$('#share').disabled=false;
  }).catch(()=>{
    if(pngPromise===request)status.textContent='PNGを作成できませんでした。SVGで保存してください。';
  });
}
$('#export-open').onclick=()=>{exportDoc=structuredClone(currentDoc());$('#export-dialog').showModal();refreshExport();};
$('#export-dialog').addEventListener('close',()=>{
  if($('#export-dialog').open)return;
  pngPromise=null;
  clearPngPreview();
});
$('#png-preview-size').onclick=()=>{
  const actual=$('#export-preview').classList.toggle('actual-size');
  $('#png-preview-size').setAttribute('aria-pressed',String(actual));
  $('#png-preview-size').textContent=actual?'全体を表示':'原寸で確認';
};
$('#png-save').onclick=()=>{
  if(!pngBlob)return;
  download(pngBlob,filename('png'));
  toast('PNG画像を保存しました。');
};
$('#svg-save').onclick=()=>{download(new Blob([exportSvg(exportDoc)],{type:'image/svg+xml'}),filename('svg'));toast('SVG画像を保存しました。');};
$('#share').onclick=async()=>{
  try{
    if(!pngBlob)return;
    const file=new File([pngBlob],filename('png'),{type:'image/png'});
    if(navigator.canShare?.({files:[file]})&&navigator.share){await navigator.share({files:[file],title:documentHeading(exportDoc)});toast('共有画面に画像を渡しました。');}
    else{download(pngBlob,file.name);toast('この端末は直接共有に非対応です。保存した画像をSNSに添付してください。');}
  }catch(e){if(e.name!=='AbortError')toast('共有できませんでした。「PNGで保存」から画像を保存してSNSに添付してください。');}
};
// ===== SECTION: Video creation and cleanup =====
$('#video-open').onclick=()=>{
  if(videoKey!==JSON.stringify(currentDoc())){
    if(videoUrl)URL.revokeObjectURL(videoUrl);
    videoBlob=null;videoUrl=null;
    $('#video-result').removeAttribute('src');$('#video-result').hidden=true;$('#video-save').hidden=true;
  }
  const mime=videoMime(),duration=Math.ceil(cameraSchedule(timelineLayout(currentDoc())).duration/1000);$('#video-duration').textContent=`約${duration}秒。コメントの長さに合わせて各節目で停止します。`; $('#video-support').textContent=mime?`このブラウザで作成する形式：${mime.includes('mp4')?'MP4':'WebM'}。${showingSample?'現在はサンプルの年表です。':''}`:'このブラウザでは動画作成に対応していません。PNGまたはSVGで保存できます。';$('#video-create').disabled=!mime;$('#video-dialog').showModal();};
$('#video-create').onclick=async()=>{
  const snapshot=structuredClone(currentDoc());$('#video-create').disabled=true;$('#video-create').textContent='動画を作成しています…';$('#video-progress').hidden=false;$('#video-progress').value=0;$('#video-save').hidden=true;
  const controller=new AbortController();
  videoController=controller;
  try{
    const blob=await createVideo(snapshot,p=>{if(videoController===controller)$('#video-progress').value=p;},controller.signal);
    if(controller.signal.aborted||videoController!==controller)return;
    if(videoUrl)URL.revokeObjectURL(videoUrl);videoKey=JSON.stringify(snapshot);videoBlob=blob;videoUrl=URL.createObjectURL(blob);$('#video-result').src=videoUrl;$('#video-result').hidden=false;$('#video-save').hidden=false;toast('動画を作成しました。');
  }catch(e){if(e.name!=='AbortError')toast(e.message);}
  finally{if(videoController===controller){videoController=null;$('#video-create').disabled=!videoMime();$('#video-create').textContent='動画を作成する';$('#video-progress').hidden=true;}}
};
$('#video-save').onclick=()=>{if(videoBlob)download(videoBlob,filename(videoBlob.type.includes('mp4')?'mp4':'webm'));};
$('#video-dialog').addEventListener('close',()=>{videoController?.abort();$('#video-result').pause();});
window.addEventListener('pagehide',()=>{stopPlayback();videoController?.abort();if(videoUrl)URL.revokeObjectURL(videoUrl);});
$('#migration-note').hidden=location.hostname!=='jinsei-yama-tani-maker.nk-pr.com';
renderEditor();renderPreview();
