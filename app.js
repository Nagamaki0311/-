import {MAX_EVENTS,STORAGE_KEY,emptyDocument,sampleDocument,event,sortedEvents,parseDocument,guideEvents,appendGuide,escapeXml,cleanText,timelineLayout,rasterPlan,playbackPosition,playbackTime} from './model.js';
import {timelineSvg,traceGeometry,exportSvg,svgToCanvas,canvasBlob,videoMime,createVideo} from './export.js';
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)], esc=escapeXml;
let doc=emptyDocument(),sample=sampleDocument(),showingSample=true,selectedId=null,guide='turning',toastTimer,undo=null;
let playRaf=0,playStart=0,playElapsed=0,playing=false,playProgress=1;
let exportDoc=null,pngPromise=null,videoBlob=null,videoUrl=null,videoController=null;
let previewLayout=null,previewKey='',highlightedId='',boardZoom=.85;
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
  $('#name').value=doc.name;$('#timeline-title').value=doc.title;$('#negative').checked=doc.negative;
  $('#sample-notice').hidden=!showingSample;$('#event-count').textContent=doc.events.length;
  $$('#sample-badge').forEach(e=>e.hidden=!showingSample);
  const list=sortedEvents(doc.events);
  if(selectedId&&!list.some(e=>e.id===selectedId)&&!showingSample)selectedId=null;
  $('#event-list').innerHTML=list.length?list.map((e,i)=>{
    const open=e.id===selectedId;
    return `<article class="event-item${open?' selected':''}" data-id="${esc(e.id)}"><button class="event-toggle" aria-expanded="${open}" aria-controls="event-${i}"><span class="event-index">${String(i+1).padStart(2,'0')}</span><span class="event-toggle-body"><small>${e.age}歳${e.label?' / '+esc(e.label):''}</small><b>${esc(e.title||'どんなことがありましたか？')}</b></span><span class="event-score">${e.score}</span><span class="chevron" aria-hidden="true">${open?'−':'＋'}</span></button><div class="event-fields" id="event-${i}" ${open?'':'hidden'}><div class="event-two-fields"><label>年齢<input type="number" data-field="age" min="0" max="120" step="1" required value="${e.age}" aria-label="節目${i+1}の年齢"></label><label>区分・時期<input data-field="label" maxlength="40" value="${esc(e.label)}" placeholder="例：高校3年生"></label></div><label>できごと<input data-field="title" maxlength="80" value="${esc(e.title)}" placeholder="例：はじめての一人暮らし"></label><label>ひとことコメント <textarea data-field="comment" maxlength="300" rows="2" placeholder="そのとき、どんな気持ちだった？">${esc(e.comment)}</textarea></label><div><div class="score-label"><label for="score-${i}">この時期の、人生の調子</label><output id="score-output-${i}">${e.score}</output></div><input id="score-${i}" type="range" data-field="score" min="${doc.negative||e.score<0?-10:0}" max="10" step="1" value="${e.score}" aria-describedby="score-output-${i}"><div class="range-ends"><span>${doc.negative||e.score<0?'−10 どん底':'0 しょんぼり'}</span><span>10 絶好調！</span></div></div><button class="delete-event" type="button">この節目を削除</button></div></article>`;
  }).join(''):'<div class="empty-state"><span aria-hidden="true">✎</span><b>最初の一歩は、思い出ひとつ。</b><p>上のガイドで節目を追加するか、<br>下のボタンから自由に書いてみよう。</p></div>';
  $('#add-event').disabled=doc.events.length>=MAX_EVENTS;
  $('#json-save').textContent=showingSample?'↓ サンプルの編集データを保存':'↓ 編集データを保存';
  updateLayoutButtons();
}
function updateLayoutButtons(){const layout=currentDoc().layout;$$('[data-layout]').forEach(b=>{b.classList.toggle('selected',b.dataset.layout===layout);b.setAttribute('aria-pressed',b.dataset.layout===layout);});}
$('#name').addEventListener('input',e=>{ensureOwn();doc.name=cleanText(e.target.value);commit();});
$('#timeline-title').addEventListener('input',e=>{ensureOwn();doc.title=cleanText(e.target.value);commit();});
$('#start-own').onclick=()=>{ensureOwn();persist();renderEditor();renderPreview();$('#name').focus();};
$$('[data-guide]').forEach(b=>b.onclick=()=>{
  guide=b.dataset.guide;
  $$('[data-guide]').forEach(x=>{x.classList.toggle('selected',x===b);x.setAttribute('aria-pressed',x===b);});
  $('#work-start-label').hidden=guide!=='school';
  $('#guide-hint').textContent=guide==='age'?'0歳から現在までを1歳ずつ追加します。入力済みの記録はそのまま。':guide==='school'?'一般的な入学年齢が目安です。学年・年齢はあとで自由に直せます。':'人生が動いた、その瞬間から。あとで自由に追加できます。';
});
$('#apply-guide').onclick=()=>{
  try{
    const ageInput=$('#current-age'),workInput=$('#work-start');
    if(!ageInput.reportValidity()||(guide==='school'&&!workInput.reportValidity()))return;
    const generated=guideEvents(guide,Number(ageInput.value),Number(workInput.value));
    const next=appendGuide(doc,generated),added=next.events.length-doc.events.length;
    ensureOwn();doc=next;if(added)selectedId=doc.events.at(-added).id;persist();renderEditor();renderPreview();toast(added?`${added}件の節目を追加しました。できごとを書いてみましょう。`:'同じ年齢・区分の節目は、すでに追加されています。');
  }catch(e){toast(e.message);}
};
$('#add-event').onclick=()=>{
  if(doc.events.length>=MAX_EVENTS){toast(`節目は${MAX_EVENTS}件まで追加できます。`);return;}
  ensureOwn();const e=event(sortedEvents(doc.events).at(-1)?.age??0);doc.events.push(e);selectedId=e.id;persist();renderEditor();renderPreview();
  const target=[...$('#event-list').children].find(el=>el.dataset.id===e.id);target?.querySelector('[data-field=title]')?.focus();
};
$('#event-list').addEventListener('click',e=>{
  const item=e.target.closest('.event-item');if(!item)return;
  if(e.target.closest('.event-toggle')){const id=item.dataset.id;selectedId=selectedId===id?null:id;renderEditor();renderPreview();if(selectedId)revealEvent(selectedId);[...$('#event-list').children].find(el=>el.dataset.id===id)?.querySelector('.event-toggle')?.focus({preventScroll:true});return;}
  if(e.target.closest('.delete-event')){
    const index=doc.events.findIndex(x=>x.id===item.dataset.id),removed=doc.events[index];doc.events.splice(index,1);undo={removed,index};selectedId=sortedEvents(doc.events).at(-1)?.id||null;persist();renderEditor();renderPreview();const next=[...$('#event-list').children].find(el=>el.dataset.id===selectedId)?.querySelector('.event-toggle')||$('#add-event');next.focus({preventScroll:true});
    toast('節目を削除しました。',{label:'元に戻す',run:()=>{
      if(!undo)return;if(doc.events.length>=MAX_EVENTS){toast('節目が上限に達しています。空きを作ってからお試しください。');return;}
      const {removed,index}=undo;doc.events.splice(index,0,removed);selectedId=removed.id;undo=null;persist();renderEditor();renderPreview();toast('節目を元に戻しました。');
    }});
  }
});
$('#event-list').addEventListener('input',e=>{
  const field=e.target.dataset.field;if(!field)return;
  const item=e.target.closest('.event-item'),record=doc.events.find(x=>x.id===item.dataset.id);if(!record)return;
  if(field==='age'||field==='score'){
    if(!e.target.validity.valid||e.target.value==='')return;
    record[field]=Number(e.target.value);
  }else record[field]=cleanText(e.target.value);
  item.querySelector('.event-toggle-body small').textContent=`${record.age}歳${record.label?' / '+record.label:''}`;
  item.querySelector('.event-toggle-body b').textContent=record.title||'どんなことがありましたか？';
  item.querySelector('.event-score').textContent=record.score;
  item.querySelector('output').value=record.score;
  stopPlayback(true);commit();
});
$('#event-list').addEventListener('change',e=>{if(e.target.dataset.field==='age'){if(e.target.value===''||!e.target.validity.valid){const record=doc.events.find(x=>x.id===e.target.closest('.event-item').dataset.id);e.target.value=record?.age??0;toast('年齢は0〜120の整数で入力してください。元の年齢を保持しました。');return;}renderEditor();}});
$('#negative').onchange=e=>{ensureOwn();doc.negative=e.target.checked;persist();renderEditor();renderPreview();};
$$('[data-layout]').forEach(b=>b.onclick=()=>{if(showingSample)sample.layout=b.dataset.layout;else{doc.layout=b.dataset.layout;persist();}updateLayoutButtons();renderPreview();});
// ===== SECTION: Preview and playback =====
function activePreviewId(list){
  if(playing||playProgress<1)return list[playbackPosition(list.length,playProgress).index]?.id||'';
  return list.find(e=>e.id===selectedId)?.id||list.at(-1)?.id||'';
}
function updateBoardProgress(progress,activeId){
  if(!previewLayout)return;
  const root=$('#chart'),trace=traceGeometry(previewLayout,progress),path=root.querySelector('[data-trace]'),tip=root.querySelector('[data-trace-tip]');
  path?.setAttribute('d',trace.path);
  if(tip){tip.setAttribute('r',trace.tip?'8':'0');if(trace.tip){tip.setAttribute('cx',trace.tip.x);tip.setAttribute('cy',trace.tip.y);}}
  if(highlightedId!==activeId){
    root.querySelectorAll('[data-event-id]').forEach(el=>{
      const active=el.dataset.eventId===activeId;el.classList.toggle('is-selected',active);el.setAttribute('aria-pressed',active);
      const outline=el.querySelector('.bubble-outline');if(outline){outline.setAttribute('stroke',active?'#f26654':'#172f44');outline.setAttribute('stroke-width',active?'4':'2.5');}
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
function renderPreview(){
  const d=currentDoc(),key=JSON.stringify(d),list=sortedEvents(d.events),active=activePreviewId(list);
  $('#sample-badge').hidden=!showingSample;
  if(key!==previewKey){
    previewLayout=timelineLayout(d);previewKey=key;
    $('#chart').innerHTML=timelineSvg(d,{layout:previewLayout,selectedId:active,progress:playProgress,interactive:true});
    highlightedId=active;applyZoom(false);
  }
  updateBoardProgress(playProgress,active);$('#play').disabled=!list.length;
}
function revealEvent(id){
  const bubble=previewLayout?.bubbles.find(b=>b.id===id);if(!bubble)return;
  const viewport=$('#board-viewport');viewport.scrollTo({left:Math.max(0,(bubble.x+bubble.width/2)*boardZoom-viewport.clientWidth/2),top:Math.max(0,bubble.y*boardZoom-30),behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
}
function selectPoint(target){
  const point=target.closest('[data-event-id]');if(!point)return;
  const keepFocus=point.contains(document.activeElement),kind=point.dataset.kind;
  stopPlayback(true);selectedId=point.dataset.eventId;if(!showingSample)renderEditor();renderPreview();
  if(keepFocus)[...$('#chart').querySelectorAll('[data-event-id]')].find(el=>el.dataset.eventId===selectedId&&el.dataset.kind===kind)?.focus({preventScroll:true});
}
$('#chart').addEventListener('click',e=>selectPoint(e.target));
$('#chart').addEventListener('focusin',()=>{if(playing){stopPlayback();$('#play-label').textContent='ちょっと、ひと休み。';}});
$('#chart').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectPoint(e.target);}});
$('#zoom-in').onclick=()=>{boardZoom=Math.min(1.8,boardZoom*1.25);applyZoom();};
$('#zoom-out').onclick=()=>{boardZoom=Math.max(.08,boardZoom/1.25);applyZoom();};
$('#zoom-readable').onclick=()=>{boardZoom=.85;applyZoom();};
$('#zoom-fit').onclick=()=>{if(!previewLayout)return;const v=$('#board-viewport');boardZoom=Math.max(.001,Math.min(1,v.clientWidth/previewLayout.width,v.clientHeight/previewLayout.height));applyZoom();v.scrollTop=0;v.scrollLeft=0;};
function stopPlayback(reset=false){cancelAnimationFrame(playRaf);playing=false;$('#play').textContent='▶';$('#play').setAttribute('aria-label','人生を再生');if(reset){playElapsed=0;playProgress=1;$('#play-label').textContent='人生を、再生してみる。';$('#play-hint').textContent='あの日から今まで、時系列で振り返ろう。';}}
function frame(now){playElapsed=now-playStart;const state=playbackTime(currentDoc().events.length,playElapsed);playProgress=state.progress;updateBoardProgress(playProgress,previewLayout?.points[playbackPosition(previewLayout.points.length,playProgress).index]?.id||'');if(!state.complete){playRaf=requestAnimationFrame(frame);}else{selectedId=previewLayout?.points.at(-1)?.id||null;stopPlayback();playElapsed=0;$('#play-label').textContent='ここまで、よく歩いてきたね。';$('#play-hint').textContent='もう一度再生して、あなたの物語を振り返ろう。';}}
$('#play').onclick=()=>{
  if(playing){stopPlayback();$('#play-label').textContent='ちょっと、ひと休み。';return;}
  if(!currentDoc().events.length)return;
  playing=true;playStart=performance.now()-playElapsed;$('#play').textContent='Ⅱ';$('#play').setAttribute('aria-label','再生を一時停止');$('#play-label').textContent='あの日から、今のあなたへ。';$('#play-hint').textContent='グラフの点を押すと、その日の思い出が見られます。';playRaf=requestAnimationFrame(frame);
};
$('#reset-play').onclick=()=>{stopPlayback(true);renderPreview();};
// ===== SECTION: Backups and modal lifecycle =====
$('#json-save').onclick=()=>{download(new Blob([JSON.stringify(currentDoc(),null,2)],{type:'application/json'}),filename('json',showingSample?'サンプル':''));toast(showingSample?'サンプルの編集データを保存しました。あなたの下書きはそのままです。':'再編集用のデータを保存しました。');};
$('#json-open').onclick=()=>$('#json-file').click();
let pendingImport=null;
$('#json-file').onchange=async e=>{
  const file=e.target.files[0];e.target.value='';if(!file)return;
  try{if(file.size>250000)throw new Error('ファイルが大きすぎます（250KBまで）。');pendingImport=parseDocument(await file.text());$('#confirm-title').textContent='年表データを読み込みますか？';$('#confirm-message').textContent=`${pendingImport.events.length}件の節目を読み込みます。現在の年表は置き換わります。必要なら先に「編集データを保存」でバックアップしてください。`;$('#confirm-dialog').showModal();}
  catch(error){pendingImport=null;toast(error.message);}
};
$('#confirm-yes').onclick=()=>{if(!pendingImport)return;ensureOwn();stopPlayback(true);doc=pendingImport;pendingImport=null;selectedId=null;undo=null;persist();renderEditor();renderPreview();$('#confirm-dialog').close();toast('年表を読み込みました。');};
$$('.close-dialog').forEach(b=>b.onclick=()=>b.closest('dialog').close());
$('#help-open').onclick=$('#privacy-open').onclick=()=>$('#help-dialog').showModal();
$$('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
$('#confirm-dialog').addEventListener('close',()=>pendingImport=null);
// ===== SECTION: Image export and native file sharing =====
function refreshExport(){
  const layout=timelineLayout(exportDoc),svg=exportSvg(exportDoc),plan=rasterPlan(layout.width,layout.height);
  $('#export-preview').innerHTML=svg;
  $('#raster-notice').textContent=plan.scaled?`PNGは安全なサイズ（${plan.width}×${plan.height}px）に縮小して一枚に保存します。文字を大きく読むには、拡大できるSVGがおすすめです。`:`${layout.width}×${layout.height}pxの一枚に、すべての思い出を保存します。SVGは拡大してもくっきり。`;
  pngPromise=svgToCanvas(svg).then(canvasBlob);pngPromise.catch(()=>{});
}
$('#export-open').onclick=()=>{exportDoc=structuredClone(currentDoc());refreshExport();$('#export-dialog').showModal();};
$('#png-save').onclick=async()=>{const b=$('#png-save');b.disabled=true;try{const blob=await pngPromise;download(blob,filename('png'));toast('すべての節目を、一枚のPNG画像に保存しました。');}catch(e){toast(e.message);}finally{b.disabled=false;}};
$('#svg-save').onclick=()=>{download(new Blob([exportSvg(exportDoc)],{type:'image/svg+xml'}),filename('svg'));toast('すべての節目を、一枚のSVG画像に保存しました。');};
$('#share').onclick=async()=>{
  try{
    const blob=await pngPromise,file=new File([blob],filename('png'),{type:'image/png'});
    if(navigator.canShare?.({files:[file]})&&navigator.share){await navigator.share({files:[file],title:exportDoc.title||'わたしの人生年表'});toast('共有画面に画像を渡しました。');}
    else{download(blob,file.name);toast('この端末は直接共有に非対応です。保存した画像をSNSに添付してください。');}
  }catch(e){if(e.name!=='AbortError')toast('共有できませんでした。「PNGで保存」から画像を保存してSNSに添付してください。');}
};
// ===== SECTION: Video creation and cleanup =====
$('#video-open').onclick=()=>{const mime=videoMime();$('#video-support').textContent=mime?`このブラウザで作成する形式：${mime.includes('mp4')?'MP4':'WebM'}。${showingSample?'現在はサンプルの年表です。':''}`:'このブラウザでは動画作成に対応していません。PNGまたはSVGで保存できます。';$('#video-create').disabled=!mime;$('#video-dialog').showModal();};
$('#video-create').onclick=async()=>{
  if(!currentDoc().events.length){toast('動画にする節目を、ひとつ以上追加してください。');return;}
  const snapshot=structuredClone(currentDoc());$('#video-create').disabled=true;$('#video-create').textContent='動画を作成しています…';$('#video-progress').hidden=false;$('#video-progress').value=0;$('#video-save').hidden=true;
  videoController=new AbortController();
  try{
    const blob=await createVideo(snapshot,p=>$('#video-progress').value=p,videoController.signal);
    if(videoUrl)URL.revokeObjectURL(videoUrl);videoBlob=blob;videoUrl=URL.createObjectURL(blob);$('#video-result').src=videoUrl;$('#video-result').hidden=false;$('#video-save').hidden=false;toast('動画ができました。プレビューを確認して保存できます。');
  }catch(e){if(e.name!=='AbortError')toast(e.message);}
  finally{videoController=null;$('#video-create').disabled=!videoMime();$('#video-create').textContent='動画を作成する';$('#video-progress').hidden=true;}
};
$('#video-save').onclick=()=>{if(videoBlob)download(videoBlob,filename(videoBlob.type.includes('mp4')?'mp4':'webm'));};
$('#video-dialog').addEventListener('close',()=>{videoController?.abort();$('#video-result').pause();});
window.addEventListener('pagehide',()=>{stopPlayback();videoController?.abort();if(videoUrl)URL.revokeObjectURL(videoUrl);});
renderEditor();renderPreview();
