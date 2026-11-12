/* KGMU V8.6 community preview: any student may publish homework/modules with
   an anonymous Supabase identity; only the author/group editors can edit/delete.
   Schedule amendments remain editor-only. Legacy browser records are preserved. */
const KGMU_CLOUD = Object.freeze({
  url: 'https://aqnpusacmyovveljyqdd.supabase.co',
  key: 'sb_publishable_OKj7RqRpofSaGMwgvgAfyw_2vMJwdmY'
});
const CLOUD_SESSION_KEY = 'kgmu-v86-auth-session';
const CLOUD_VISITOR_KEY = 'kgmu-v86-anonymous-session';
const CLOUD_TG_KEY = 'kgmu-tg-session';
const KG_TG_FN = KGMU_CLOUD.url + '/functions/v1/tg-auth';
const KG_ROLE_RU = {admin:'Администратор', starosta:'Староста', editor:'Помощник старосты'};
let kgTgInit = '';
try { kgTgInit = window.Telegram?.WebApp?.initData || ''; const m = location.hash.match(/tgWebAppData=([^&]+)/);
  if (!kgTgInit && m) kgTgInit = decodeURIComponent(m[1]);
  if (kgTgInit) sessionStorage.setItem('kg-tg-initdata', kgTgInit); else kgTgInit = sessionStorage.getItem('kg-tg-initdata') || '';
} catch (_) {}
let cloudSession = null;
let cloudAssignments = [];
let cloudNotes = [];
let cloudAmendments = [];
let cloudEdits = []; // заявки на правку (edit_of = id исходной записи)
let cloudStatus = 'Подключение…';
let cloudRequestVersion = 0;
let cloudRefreshPromise = null;
let cloudRefreshingAuth = null;
let cloudLastUpdated = null;

function cloudCanEdit(gr=selectedStudyGroup) {
  return Boolean(cloudSession?.access_token && cloudAssignments.some(a => a.study_group === gr || a.study_group === '*'));
}
function cloudCanContribute(){return Boolean(navigator.onLine!==false);}
function cloudIsMine(n){return Boolean(cloudSession?.user?.id && n?._remoteOwnerId===cloudSession.user.id);}
/* Править напрямую: свои локальные записи, редактор группы, автор своей ещё не подтверждённой записи. Иначе — заявка старосте. */
function cloudCanEditNote(n){return !n?false:(!n._remote || cloudCanEdit() || (cloudIsMine(n) && n._status!=='approved'));}
function cloudNoteEditMode(n){return cloudCanEditNote(n)?'direct':(n?._remote&&cloudCanContribute()?'request':'');}
/* Удалять общие записи могут только староста и админ; автор может отозвать свою неподтверждённую запись */
function cloudCanManage(gr=selectedStudyGroup){return Boolean(cloudSession?.access_token && cloudAssignments.some(a=>(a.role==='admin'||a.role==='starosta')&&(a.study_group===gr||a.study_group==='*')));}
function cloudCanDeleteNote(n){return !n?false:(!n._remote || cloudCanManage() || (cloudIsMine(n) && n._status!=='approved'));}
function cloudMyEdit(n){return cloudEdits.find(e=>e.editOf===n.id&&cloudIsMine(e)&&e._status!=='approved');}
function kgTgUser(){ const m=cloudSession?.user?.user_metadata; return m?.tg_id ? m : null; }
function kgTgName(){ const u=kgTgUser(); return u ? (u.username ? '@'+u.username : (u.name || 'ID '+u.tg_id)) : ''; }
function cloudRoleIn(gr=selectedStudyGroup){
  const mine=cloudAssignments.filter(a=>a.study_group===gr||a.study_group==='*');
  for(const r of ['admin','starosta','editor']) if(mine.some(a=>a.role===r)) return r;
  return '';
}
function cloudCanAdmin(gr=selectedStudyGroup) {
  return Boolean(cloudSession?.access_token && cloudAssignments.some(a => a.role === 'admin' && (a.study_group === gr || a.study_group === '*')));
}
function cloudLocalNotes(gr=selectedStudyGroup) {
  if (!gr) return [];
  try {
    let raw=localStorage.getItem('kgmu-v8-notes-'+gr);
    if (raw === null && gr === '1307') raw=localStorage.getItem(NOTES_OLD_KEY);
    const value=JSON.parse(raw||'[]');
    return Array.isArray(value)?value.filter(validNote).map(sanitizeNote):[];
  } catch { return []; }
}
function cloudLocalAmendments(gr=selectedStudyGroup) {
  if (!gr) return [];
  try {
    const value=JSON.parse(localStorage.getItem('kgmu-v8-changes-'+gr)||'[]');
    return Array.isArray(value)?value.filter(validAmendment).map(sanitizeAmendment):[];
  } catch { return []; }
}
function cloudMergeRecords() {
  if (!selectedStudyGroup) return;
  // Cloud wins for identical IDs; local records are never deleted from the device.
  const nm=new Map(cloudLocalNotes().map(n=>[n.id,n]));
  for(const n of cloudNotes) nm.set(n.id,{...n,_remote:true});
  const am=new Map(cloudLocalAmendments().map(a=>[a.id,a]));
  for(const a of cloudAmendments) am.set(a.id,{...a,_remote:true});
  notes=[...nm.values()];amendments=[...am.values()];
}
function cloudRedraw() {
  if (!selectedStudyGroup || isDevGroup(selectedStudyGroup)) return;
  try { render();renderToday();renderCalendar();renderDayDetail();renderModules();if(activeView==='search')renderSearch(); }
  catch(err){console.warn('Ошибка обновления представления:',err);}
}
function cloudSetStatus(value){ cloudStatus=value;cloudUpdateUI(); }
function cloudUpdateUI(){
  const el=document.getElementById('cloudStatus');if(el)el.textContent=cloudStatus;
  const actor=document.getElementById('cloudAccount');
  if(actor)actor.textContent=kgTgUser() ? '✈️ Вход через Telegram: '+kgTgName() : cloudSession?.user?.email ? 'Вход по почте: '+cloudSession.user.email : cloudSession?.user?.is_anonymous ? 'Участник без регистрации · записи привязаны к этому браузеру' : 'Чтение без регистрации · при публикации создастся анонимная учётная запись';
  const roles=document.getElementById('cloudRoles');
  const myRole=cloudRoleIn();
  if(roles)roles.textContent=myRole==='admin'?'Администратор':myRole?KG_ROLE_RU[myRole]+' группы '+selectedStudyGroup:'Любой студент может публиковать ДЗ и модули';
  const tgBox=document.getElementById('kgTgLogin');if(tgBox)tgBox.hidden=Boolean(kgTgUser());
  const login=document.getElementById('cloudLoginForm');if(login)login.hidden=Boolean(cloudSession?.user?.email);
  const logout=document.getElementById('cloudLogout');if(logout)logout.hidden=!cloudSession?.user?.email;
  const publish=document.getElementById('cloudPublishLocal');
  if(publish){publish.disabled=!cloudCanContribute();publish.textContent='Опубликовать локальные ДЗ и модули ('+cloudLocalNotes().length+')';}
  const p=document.getElementById('editCloudWrap');if(p)p.hidden=false;
  const c=document.getElementById('changeCloudWrap');if(c)c.hidden=!cloudCanEdit();
  const sub=document.getElementById('cloudSourceHint');if(sub)sub.textContent='☁ Общие ДЗ/модули видны всем · автор правит своё · 📱 локальные записи видны только на этом устройстве';
}
function cloudApiHeaders(auth=true,extras={}){
  const h={'apikey':KGMU_CLOUD.key,'Accept':'application/json',...extras};
  if(auth && cloudSession?.access_token)h.Authorization='Bearer '+cloudSession.access_token;
  return h;
}
function cloudSaveSession(session){
  cloudSession=session;
  try{
    if(session?.user?.is_anonymous) localStorage.setItem(CLOUD_VISITOR_KEY,JSON.stringify(session));
    else if(session?.user?.user_metadata?.tg_id) localStorage.setItem(CLOUD_TG_KEY,JSON.stringify(session));
    else if(session?.access_token) sessionStorage.setItem(CLOUD_SESSION_KEY,JSON.stringify(session));
    else sessionStorage.removeItem(CLOUD_SESSION_KEY);
  }catch(_){}
}
async function cloudEnsureContributor(){
  if(cloudSession?.access_token)return;
  try{
    const cached=JSON.parse(localStorage.getItem(CLOUD_VISITOR_KEY)||'null');
    if(cached?.access_token&&cached?.refresh_token){cloudSession=cached;return;}
  }catch(_){}
  cloudSetStatus('Создаём анонимную сессию для публикации…');
  const r=await fetch(KGMU_CLOUD.url+'/auth/v1/signup',{
    method:'POST',headers:cloudApiHeaders(false,{'Content-Type':'application/json'}),
    body:JSON.stringify({data:{}})
  });
  const j=await r.json().catch(()=>({}));
  if(!r.ok || !j.access_token || !j.user?.id){
    throw Error(j.msg||j.error_description||j.message||'Не удалось начать анонимную сессию. В Supabase включите Allow anonymous sign-ins.');
  }
  cloudSaveSession(j);
  cloudAssignments=[];cloudUpdateUI();
}
async function cloudRefreshToken(){
  if(!cloudSession?.refresh_token)throw Error('Выполните вход заново');
  if(cloudRefreshingAuth)return cloudRefreshingAuth;
  cloudRefreshingAuth=(async()=>{
    const response=await fetch(KGMU_CLOUD.url+'/auth/v1/token?grant_type=refresh_token',{
      method:'POST',headers:cloudApiHeaders(false,{'Content-Type':'application/json'}),
      body:JSON.stringify({refresh_token:cloudSession.refresh_token})
    });
    const payload=await response.json().catch(()=>({}));
    if(!response.ok){
      const anon=Boolean(cloudSession?.user?.is_anonymous);
      try{if(anon)localStorage.removeItem(CLOUD_VISITOR_KEY);else{sessionStorage.removeItem(CLOUD_SESSION_KEY);localStorage.removeItem(CLOUD_TG_KEY);}}catch(_){}
      if(!anon&&kgTgInit){try{return await kgTgLogin({initData:kgTgInit},true,true);}catch(_){}}
      cloudSaveSession(null);cloudAssignments=[];cloudUpdateUI();
      throw Error(anon?'Сеанс участника истёк. При следующей публикации потребуется новый вход':'Сеанс администратора истёк. Войдите снова');
    }
    cloudSaveSession(payload);return payload;
  })();
  try {return await cloudRefreshingAuth;}finally{cloudRefreshingAuth=null;}
}
async function cloudRequest(endpoint,options={},allowRefresh=true){
  const signed=!!cloudSession?.access_token;
  if(signed && cloudSession.expires_at && Date.now()/1000>cloudSession.expires_at-45)await cloudRefreshToken();
  const response=await fetch(KGMU_CLOUD.url+endpoint,{
    ...options,
    headers:cloudApiHeaders(true,options.headers||{}),
    cache:'no-store'
  });
  if(response.status===401 && signed && allowRefresh){await cloudRefreshToken();return cloudRequest(endpoint,options,false);}
  const json=await response.json().catch(()=>null);
  if(!response.ok)throw Error((json?.message || json?.error_description || json?.details || json?.hint || json?.error || 'Ошибка '+response.status).slice(0,240));
  return json;
}
async function cloudReadGroup(gr){
  const filter='?study_group=eq.'+encodeURIComponent(gr)+'&select=*&limit=1000';
  const [nr,ar]=await Promise.all([
    cloudRequest('/rest/v1/kgmu_notes'+filter),cloudRequest('/rest/v1/kgmu_amendments'+filter)
  ]);
  if(!Array.isArray(nr)||!Array.isArray(ar))throw Error('Некорректный ответ сервера');
  if(nr.length>=1000||ar.length>=1000)throw Error('Слишком много записей: требуется постраничная загрузка');
  const mapN=n=>({...sanitizeNote(n),_remoteOwnerId:n.created_by||n.updated_by||null,_status:n.status||'approved',_remote:true,editOf:n.edit_of||null});
  const ok=nr.filter(validNote);
  return {notes:ok.filter(n=>!n.edit_of).map(mapN),edits:ok.filter(n=>n.edit_of).map(mapN),amendments:ar.map(a=>({...a,eventId:a.event_id,targetDate:a.target_date,newStart:a.new_start,newEnd:a.new_end,newLocation:a.new_location,newTeacher:a.new_teacher})).filter(validAmendment).map(sanitizeAmendment)};
}
async function cloudRefreshGroup(quiet=false){
  const gr=selectedStudyGroup;
  if(!gr||isDevGroup(gr))return;
  const request=++cloudRequestVersion;
  if(!quiet)cloudSetStatus('Загружаем общие записи для '+gr+'…');
  try{
    const result=await cloudReadGroup(gr);
    if(request!==cloudRequestVersion||selectedStudyGroup!==gr)return;
    cloudNotes=result.notes;cloudEdits=result.edits;cloudAmendments=result.amendments;
    cloudLastUpdated=new Date();cloudMergeRecords();cloudRedraw();
    cloudSetStatus('Подключено · '+gr+' · '+cloudLastUpdated.toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}));
  }catch(e){
    if(request!==cloudRequestVersion)return;
    cloudMergeRecords();
    cloudSetStatus('Нет связи с общими данными: '+e.message+' · локальные записи доступны');
    if(!quiet)console.warn('KGMU cloud:',e);
  }
}
function cloudGroupChanged(){
  cloudRequestVersion++;
  cloudNotes=[];cloudEdits=[];cloudAmendments=[];
  cloudMergeRecords();cloudUpdateUI();
  cloudRefreshGroup();
}
async function cloudLoadPermissions(){
  if(!cloudSession){cloudAssignments=[];cloudUpdateUI();return;}
  try{
    const roles=await cloudRequest('/rest/v1/rpc/kgmu_my_roles',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    cloudAssignments=Array.isArray(roles)?roles:[];
  }catch(e){cloudAssignments=[];cloudSetStatus('Не удалось получить права редактора: '+e.message);}
  cloudUpdateUI();
}
async function cloudLogin(ev){
  ev.preventDefault();
  const email=document.getElementById('cloudEmail').value.trim();
  const password=document.getElementById('cloudPassword').value;
  if(!email||!password)return;
  cloudSetStatus('Входим…');
  try{
    const r=await fetch(KGMU_CLOUD.url+'/auth/v1/token?grant_type=password',{
      method:'POST',headers:cloudApiHeaders(false,{'Content-Type':'application/json'}),body:JSON.stringify({email,password})
    });
    const j=await r.json();if(!r.ok)throw Error(j.error_description||j.msg||j.message||'Не удалось войти');
    if(!j.access_token||!j.refresh_token)throw Error('Сервер не выдал токен');
    cloudSaveSession(j);
    document.getElementById('cloudPassword').value='';
    await cloudLoadPermissions();await cloudRefreshGroup(true);
    cloudSetStatus(cloudCanEdit()?'Вход выполнен · разрешена публикация':'Вход выполнен · права редактора ещё не назначены');
  }catch(e){cloudSetStatus('Ошибка входа: '+e.message);}
}
async function cloudLogout(){
  const token=cloudSession?.access_token;
  try{sessionStorage.removeItem(CLOUD_SESSION_KEY);localStorage.removeItem(CLOUD_TG_KEY);}catch(_){}
  cloudSession=null;
  cloudAssignments=[];
  try{const s=JSON.parse(localStorage.getItem(CLOUD_VISITOR_KEY)||'null');if(s?.access_token&&s?.refresh_token)cloudSession=s;}catch(_){}
  cloudUpdateUI();
  cloudSetStatus('Вы вышли из редактора · ДЗ и модули доступны всем');
  if(token){fetch(KGMU_CLOUD.url+'/auth/v1/logout',{method:'POST',headers:{'apikey':KGMU_CLOUD.key,'Authorization':'Bearer '+token}}).catch(()=>{});}
}
function cloudShouldSaveNote(prev){
  return Boolean(prev?._remote ? cloudNoteEditMode(prev) : document.getElementById('editCloud')?.checked && cloudCanContribute());
}
function cloudShouldSaveAmendment(prev){
  return Boolean(prev?prev._remote:document.getElementById('changeCloud')?.checked && cloudCanEdit());
}
function cloudPrepareNoteEditor(prev){
  const field=document.getElementById('editCloud');
  if(!field)return;
  const existingCloud=!!prev?._remote;
  document.getElementById('editCloudWrap').hidden=false;
  field.checked=existingCloud || (!prev&&cloudCanContribute());
  field.disabled=existingCloud;
  document.getElementById('editCloudHint').textContent=existingCloud?(cloudNoteEditMode(prev)==='request'?'Правка уйдёт старосте на подтверждение. До этого группа видит прежний вариант.':'Изменение увидит вся группа.'):
    'Отметьте, чтобы запись увидела вся группа — после подтверждения старосты. Без отметки она останется только в вашем браузере.';
}
function cloudPrepareChangeEditor(){
  const field=document.getElementById('changeCloud');if(!field)return;
  document.getElementById('changeCloudWrap').hidden=!cloudCanEdit();
  field.checked=cloudCanEdit();
  if(cloudCanEdit()&&!cloudCanAdmin()){
    const c=document.getElementById('changeVerified');if(c){c.checked=false;c.disabled=true;}
  }else{const c=document.getElementById('changeVerified');if(c)c.disabled=false;}
}
function cloudNotePayload(n){return {id:n.id,study_group:selectedStudyGroup,date:n.date,type:n.type,subject:n.subject,subgroup:n.subgroup,title:n.title,details:n.details,resources:n.resources};}
function cloudAmendmentPayload(a){return {id:a.id,study_group:selectedStudyGroup,event_id:a.eventId,date:a.date,kind:a.kind,target_date:a.targetDate||null,new_start:a.newStart,new_end:a.newEnd,new_location:a.newLocation,new_teacher:a.newTeacher,comment:a.comment,source:a.source,verified:cloudCanAdmin()?!!a.verified:false,updated_by:cloudSession?.user?.id||null};}
async function cloudWrite(table,record,existing=false){
  if(table==='kgmu_notes'){await cloudEnsureContributor();}
  else if(!cloudCanEdit())throw Error('Изменять общее расписание может только редактор группы');
  if(table==='kgmu_notes' && !cloudSession?.access_token)throw Error('Нет соединения с сервером');
  const url='/rest/v1/'+table+(existing?'?id=eq.'+encodeURIComponent(record.id)+'&study_group=eq.'+encodeURIComponent(selectedStudyGroup):'');
  const result=await cloudRequest(url,{method:existing?'PATCH':'POST',
    headers:{'Content-Type':'application/json','Prefer':'return=representation'},
    body:JSON.stringify(record)});
  if(!Array.isArray(result)||result.length!==1)throw Error('Сервер не подтвердил сохранение. Проверьте права и список записей.');
}
async function cloudSaveNote(n,prev){
  try{
    if(prev?._remote&&cloudNoteEditMode(prev)==='request'){
      const mine=cloudMyEdit(prev),base=mine||prev;
      const same=['date','type','subject','subgroup','title','details','resources'].every(k=>String(n[k]||'')===String(base[k]||''));
      if(same){toast('Вы ничего не изменили');return;}
      if(mine)await cloudWrite('kgmu_notes',{...cloudNotePayload(n),id:mine.id},true);
      else await cloudWrite('kgmu_notes',{...cloudNotePayload(n),id:'e-'+Date.now()+'-'+Math.random().toString(36).slice(2,9),edit_of:prev.id},false);
      document.getElementById('recordEditor').hidden=true;editId=null;
      await cloudRefreshGroup(true);toast('⏳ Правка отправлена старосте на подтверждение');return;
    }
    if(prev?._remote&&!cloudCanEditNote(prev))throw Error('Нет прав для изменения этой записи');
    await cloudWrite('kgmu_notes',cloudNotePayload(n),!!prev?._remote);
    document.getElementById('recordEditor').hidden=true;editId=null;
    await cloudRefreshGroup(true);toast(cloudCanEdit()?'☁ Запись опубликована для группы':'⏳ Отправлено старосте на подтверждение');
  }catch(e){toast('Не опубликовано: '+e.message);}
}
async function cloudDeleteNote(n){
  if(!cloudCanDeleteNote(n)){toast('Удалять общие записи может только староста или администратор');return;}
  if(!confirm(n.editOf?'Удалить заявку на правку «'+n.title+'»?':'Удалить общую запись для ВСЕЙ группы «'+n.title+'»?'))return;
  try{
    const result=await cloudRequest('/rest/v1/kgmu_notes?id=eq.'+encodeURIComponent(n.id)+'&study_group=eq.'+encodeURIComponent(selectedStudyGroup),{
      method:'DELETE',headers:{'Prefer':'return=representation'}});
    if(!Array.isArray(result)||result.length!==1)throw Error('Не удалось подтвердить удаление');
    await cloudRefreshGroup(true);toast(n.editOf?'Заявка удалена':'Общая запись удалена');
  }catch(e){toast('Ошибка удаления: '+e.message);}
}
async function cloudSaveAmendment(a,prev){
  try{
    await cloudWrite('kgmu_amendments',cloudAmendmentPayload(a),!!prev?._remote);
    document.getElementById('changeEditor').hidden=true;
    await cloudRefreshGroup(true);toast('☁ Изменение опубликовано (неофициальная информация)');
  }catch(e){toast('Не опубликовано: '+e.message);}
}
async function cloudDeleteAmendment(a){
  if(!cloudCanEdit()){toast('Удалять общее изменение может только редактор группы');return;}
  if(!confirm('Удалить изменение для ВСЕЙ группы?'))return;
  try{
    const result=await cloudRequest('/rest/v1/kgmu_amendments?id=eq.'+encodeURIComponent(a.id)+'&study_group=eq.'+encodeURIComponent(selectedStudyGroup),{
      method:'DELETE',headers:{'Prefer':'return=representation'}});
    if(!Array.isArray(result)||result.length!==1)throw Error('Не удалось подтвердить удаление');
    await cloudRefreshGroup(true);toast('Общее изменение удалено');
  }catch(e){toast('Ошибка удаления: '+e.message);}
}
async function cloudPublishLocal(){
  const gr=selectedStudyGroup,localN=cloudLocalNotes(gr);
  if(!localN.length){toast('В этой группе нет локальных ДЗ или модулей для переноса');return;}
  if(!confirm('Опубликовать '+localN.length+' локальных ДЗ/модулей для группы '+gr+'?\n\nЛокальные копии останутся в браузере. Изменения расписания не публикуются автоматически. Перед переносом сохраните экспорт JSON.'))return;
  cloudSetStatus('Публикуем локальные ДЗ и модули…');
  try{
    await cloudEnsureContributor();
    let published=0;
    for(let i=0;i<localN.length;i+=15){
      const rows=localN.slice(i,i+15).map(cloudNotePayload);
      const saved=await cloudRequest('/rest/v1/kgmu_notes',{method:'POST',
        headers:{'Content-Type':'application/json','Prefer':'resolution=ignore-duplicates,return=representation'},
        body:JSON.stringify(rows)});
      published+=Array.isArray(saved)?saved.length:0;
    }
    await cloudRefreshGroup(true);
    toast('☁ Добавлено общих записей: '+published+' · локальные копии сохранены');
  }catch(e){cloudSetStatus('Публикация остановлена: '+e.message+' · локальные данные сохранены');}
}
function cloudShowRecordSource(n){
  if(!n._remote)return ' · 📱 только у вас';
  if(n._status==='pending'){
    let s=' · <span class="kg-pending">⏳ ждёт подтверждения старосты</span>';
    if(cloudCanEdit())s+=' <button class="small-btn kg-mod-btn" type="button" data-approve-note="'+cloudEsc(n.id)+'">✓ Подтвердить</button><button class="small-btn kg-mod-btn" type="button" data-reject-note="'+cloudEsc(n.id)+'">✕ Отклонить</button>';
    return s;
  }
  if(n._status==='rejected')return ' · <span class="kg-rejected">✕ отклонено старостой</span>';
  return ' · ☁ общая запись'+cloudShowEdits(n);
}
const KG_EDIT_FIELDS=[['date','Дата'],['type','Тип'],['subject','Предмет'],['subgroup','Подгруппа'],['title','Тема'],['details','Описание'],['resources','Материалы']];
function cloudEditVal(k,v){
  if(k==='type')return v==='module'?'модуль / зачёт':'ДЗ';
  if(k==='subgroup')return v==='all'?'вся группа':v+'-я подгруппа';
  if(k==='date'&&/^\d{4}-\d{2}-\d{2}$/.test(v||''))return v.split('-').reverse().join('.');
  return v||'—';
}
/* Заявки на правку под исходной записью: старосте — разница и кнопки, автору — статус своей заявки */
function cloudShowEdits(n){
  const list=cloudEdits.filter(e=>e.editOf===n.id&&(cloudCanEdit()||cloudIsMine(e)));
  if(!list.length)return '';
  return list.map(e=>{
    const diff=KG_EDIT_FIELDS.filter(([k])=>String(e[k]||'')!==String(n[k]||'')).map(([k,l])=>'<div class="kg-diff"><b>'+l+':</b> <s>'+cloudEsc(cloudEditVal(k,n[k]))+'</s> → '+cloudEsc(cloudEditVal(k,e[k]))+'</div>').join('')||'<div class="kg-diff">без изменений</div>';
    let h='<div class="kg-edit-req"><div>'+(e._status==='rejected'?'<span class="kg-rejected">✕ Правка отклонена старостой</span>':'<span class="kg-pending">✏️ '+(cloudIsMine(e)?'Ваша правка ждёт подтверждения старосты':'Предложена правка')+'</span>')+'</div>'+diff+'<div class="kg-edit-acts">';
    if(cloudCanEdit()&&e._status==='pending')h+='<button class="small-btn" type="button" data-edit-decide="'+cloudEsc(e.id)+'" data-ok="1">✓ Применить</button><button class="small-btn" type="button" data-edit-decide="'+cloudEsc(e.id)+'" data-ok="0">✕ Отклонить</button>';
    if(cloudIsMine(e)||cloudCanManage())h+='<button class="small-btn" type="button" data-edit-withdraw="'+cloudEsc(e.id)+'">'+(cloudIsMine(e)?'Отозвать':'Удалить заявку')+'</button>';
    return h+'</div></div>';
  }).join('');
}
async function cloudDecideEdit(id,ok){
  if(!cloudCanEdit()){toast('Подтверждать правки может только староста группы');return;}
  try{
    await cloudRequest('/rest/v1/rpc/kgmu_note_edit_decide',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({req:id,approve:ok})});
    await cloudRefreshGroup(true);toast(ok?'✓ Правка применена — группа видит новый вариант':'✕ Правка отклонена');
  }catch(e){toast('Ошибка: '+e.message);}
}
document.addEventListener('click',e=>{
  const d=e.target.closest('[data-edit-decide]'),w=e.target.closest('[data-edit-withdraw]');
  if(!d&&!w)return;
  e.preventDefault();e.stopPropagation();
  if(d)cloudDecideEdit(d.dataset.editDecide,d.dataset.ok==='1');
  else{const r=cloudEdits.find(x=>x.id===w.dataset.editWithdraw);if(r)cloudDeleteNote(r);}
},true);
function cloudShowAmendmentSource(a){return a._remote?' · ☁ общая запись':' · 📱 только у вас';}
async function cloudInit(){
  try{
    const s=JSON.parse(localStorage.getItem(CLOUD_TG_KEY)||sessionStorage.getItem(CLOUD_SESSION_KEY)||'null');
    if(s?.access_token&&s?.refresh_token)cloudSession=s;
    else{const visitor=JSON.parse(localStorage.getItem(CLOUD_VISITOR_KEY)||'null');if(visitor?.access_token&&visitor?.refresh_token)cloudSession=visitor;}
  }catch(_){cloudSession=null;}
  const form=document.getElementById('cloudLoginForm');
  if(form)form.addEventListener('submit',cloudLogin);
  document.getElementById('cloudLogout')?.addEventListener('click',cloudLogout);
  document.getElementById('cloudRefresh')?.addEventListener('click',()=>cloudRefreshGroup());
  document.getElementById('cloudPublishLocal')?.addEventListener('click',cloudPublishLocal);
  kgTgMountUI();
  cloudUpdateUI();
  const tgNow=kgTgUser();
  if(kgTgInit && (!tgNow || String(tgNow.tg_id)!==String(kgTgUserFromInit()?.id))){
    try{await kgTgLogin({initData:kgTgInit},true);}catch(e){console.warn('TG auto-login:',e);}
  }
  if(cloudSession && !cloudSession.user?.is_anonymous)await cloudLoadPermissions();
  if(selectedStudyGroup)await cloudRefreshGroup();else cloudSetStatus('Выберите группу для загрузки общих записей');
  window.addEventListener('focus',()=>{if(selectedStudyGroup)cloudRefreshGroup(true);});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&selectedStudyGroup)cloudRefreshGroup(true);});
  window.addEventListener('online',()=>{if(selectedStudyGroup)cloudRefreshGroup(true);});
  window.setInterval(()=>{if(!document.hidden&&navigator.onLine&&selectedStudyGroup)cloudRefreshGroup(true);},120000);
}
cloudInit();

/* KGMU: модерация ДЗ — запись видна всей группе после подтверждения старосты (роль в kgmu_editors). */
(function(){const st=document.createElement('style');st.textContent='.kg-pending{color:#b45309;font-weight:700}.kg-rejected{color:#b91c1c;font-weight:700}.kg-mod-btn{margin-left:6px}.kg-edit-req{margin-top:8px;padding:8px 10px;border-radius:10px;background:rgba(180,83,9,.08);font-size:13px;line-height:1.4;white-space:normal}.kg-diff s{opacity:.6}.kg-edit-acts{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}';document.head.appendChild(st);})();
function cloudEsc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
async function cloudSetNoteStatus(id,status){
  if(!cloudCanEdit()){toast('Подтверждать записи может только староста группы');return;}
  try{
    const r=await cloudRequest('/rest/v1/kgmu_notes?id=eq.'+encodeURIComponent(id)+'&study_group=eq.'+encodeURIComponent(selectedStudyGroup),{
      method:'PATCH',headers:{'Content-Type':'application/json','Prefer':'return=representation'},body:JSON.stringify({status})});
    if(!Array.isArray(r)||r.length!==1)throw Error('Сервер не подтвердил изменение');
    await cloudRefreshGroup(true);
    toast(status==='approved'?'✓ ДЗ подтверждено — его видит вся группа':'✕ ДЗ отклонено');
  }catch(e){toast('Ошибка: '+e.message);}
}
document.addEventListener('click',e=>{
  const a=e.target.closest('[data-approve-note]'),r=e.target.closest('[data-reject-note]');
  if(!a&&!r)return;
  e.preventDefault();e.stopPropagation();
  if(a)cloudSetNoteStatus(a.dataset.approveNote,'approved');else cloudSetNoteStatus(r.dataset.rejectNote,'rejected');
},true);
const kgOrigRefreshGroup=cloudRefreshGroup;
cloudRefreshGroup=async function(quiet){
  const res=await kgOrigRefreshGroup(quiet);
  try{
    if(cloudCanEdit()){
      const n=cloudNotes.filter(x=>x._status==='pending').length+cloudEdits.filter(x=>x._status==='pending').length;
      if(n&&n!==window.kgPendingSeen)toast('📝 Ждут вашего подтверждения: '+n+' (записи и правки)');
      window.kgPendingSeen=n;
    }
  }catch(_){}
  return res;
};

/* KGMU: вход через Telegram — автоматически в мини-приложении, кнопкой Telegram Login на сайте. */
function kgTgUserFromInit(){try{return JSON.parse(new URLSearchParams(kgTgInit).get('user')||'null');}catch(_){return null;}}
async function kgTgLogin(payload,quiet=false,light=false){
  if(!quiet)cloudSetStatus('Входим через Telegram…');
  const r=await fetch(KG_TG_FN,{method:'POST',headers:{'Content-Type':'application/json','apikey':KGMU_CLOUD.key},body:JSON.stringify(payload)});
  const j=await r.json().catch(()=>({}));
  if(!r.ok||!j.session?.access_token)throw Error(j.error||'Не удалось войти через Telegram');
  cloudSaveSession(j.session);
  if(light)return j.session;
  await cloudLoadPermissions();
  if(selectedStudyGroup)await cloudRefreshGroup(true);
  const role=cloudRoleIn();
  cloudSetStatus('Вход через Telegram · '+kgTgName()+(role?' · '+KG_ROLE_RU[role]:''));
  return j.session;
}
window.kgTgOnAuth=async function(user){
  try{await kgTgLogin({widget:user});toast('✈️ Вы вошли через Telegram');}
  catch(e){cloudSetStatus('Ошибка входа: '+e.message);}
};
async function kgTgBotName(){
  try{const c=localStorage.getItem('kg-tg-bot');if(c)return c;}catch(_){}
  const r=await fetch(KG_TG_FN,{method:'POST',headers:{'Content-Type':'application/json','apikey':KGMU_CLOUD.key},body:'{"action":"config"}'});
  const j=await r.json().catch(()=>({}));
  if(j.bot_username){try{localStorage.setItem('kg-tg-bot',j.bot_username);}catch(_){}}
  return j.bot_username||'';
}
function kgTgMountUI(){
  const panel=document.getElementById('cloudPanel'),form=document.getElementById('cloudLoginForm');
  if(!panel||!form||document.getElementById('kgTgLogin'))return;
  const box=document.createElement('div');box.id='kgTgLogin';box.className='kg-tg-login';
  box.innerHTML='<p><b>Войдите через Telegram</b>, чтобы старосты и помощники могли подтверждать ДЗ и публиковать изменения пар. Роли выдаются в боте.</p><div id="kgTgWidget">'+(kgTgInit?'Входим автоматически…':'Загрузка кнопки…')+'</div>';
  form.parentNode.insertBefore(box,form);
  const det=document.createElement('details');det.className='kg-mail-login';det.innerHTML='<summary>Вход по почте (старые аккаунты)</summary>';
  form.parentNode.insertBefore(det,form);det.appendChild(form);
  const st=document.createElement('style');st.textContent='.kg-tg-login{margin:10px 0;padding:12px;border-radius:14px;background:rgba(42,171,238,.08);border:1px solid rgba(42,171,238,.35)}.kg-tg-login p{margin:0 0 8px}.kg-mail-login{margin:8px 0}.kg-mail-login summary{cursor:pointer;font-size:13px;opacity:.8}';
  document.head.appendChild(st);
  if(kgTgInit)return;
  kgTgBotName().then(name=>{
    const w=document.getElementById('kgTgWidget');if(!w)return;
    if(!name){w.textContent='Кнопка входа временно недоступна';return;}
    w.textContent='';
    const sc=document.createElement('script');sc.async=true;sc.src='https://telegram.org/js/telegram-widget.js?22';
    sc.setAttribute('data-telegram-login',name);sc.setAttribute('data-size','large');sc.setAttribute('data-radius','12');
    sc.setAttribute('data-onauth','kgTgOnAuth(user)');sc.setAttribute('data-request-access','write');
    w.appendChild(sc);
  }).catch(()=>{});
}
