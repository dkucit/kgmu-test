/* KGMU V8.7: admin announcements and whole-device backups.
   Does not modify existing homework/module data or registered Supabase users. */
'use strict';
const NEWS_SCOPE_TYPES=['all','faculty','course','stream','group'];
const NEWS_PROGRAM_LABELS={lechebnoe:'Лечебное дело',pediatriya:'Педиатрия',stomatologiya:'Стоматология'};
let newsRows=[],newsStatus='loading',newsRequestSerial=0,newsAllExpanded=false,newsEditorId=null,newsLastFetch=0;
const newsNode=id=>document.getElementById(id);
const newsAdmin=()=>Boolean(cloudSession?.access_token && cloudAssignments.some(r=>r.role==='admin'&&r.study_group==='*'));
function newsLabel(n){
 const p=NEWS_PROGRAM_LABELS[n.program]||n.program||'';
 switch(n.scope_type){
 case 'all': return 'Все группы';
 case 'faculty': return p+' · все курсы';
 case 'course': return p+' · '+n.course+' курс';
 case 'stream': return n.program==='stomatologiya'&&Number(n.course)===3 ? p+' · 3 курс · '+(Number(n.stream)===1?'группы 4301–4306':'группы 4307–4312и') : p+' · '+n.course+' курс · '+n.stream+' поток';
 case 'group': return 'Группа '+n.study_group;
 default:return 'Объявление';
 }
}
function newsMatchesGroup(n,gr){
 if(n.scope_type==='all')return true;
 if(!GROUP_INFO[gr])return false;
 const i=GROUP_INFO[gr];
 if(n.scope_type==='group')return n.study_group===gr;
 if(n.program!==i.program)return false;
 if(n.scope_type==='faculty')return true;
 if(String(n.course)!==String(i.course))return false;
 if(n.scope_type==='course')return true;
 return n.scope_type==='stream'&&String(n.stream)===String(i.stream);
}
function newsCurrent(n){
 const now=Date.now();
 if(n.published_at&&new Date(n.published_at).getTime()>now)return false;
 if(n.expires_at&&new Date(n.expires_at).getTime()<=now)return false;
 return true;
}
function newsSafeLink(url){
 try{const u=new URL(url);return ['https:','http:'].includes(u.protocol)?u.href:null;}catch{return null;}
}
function newsDate(s){
 try{return new Date(s).toLocaleDateString('ru-RU',{day:'numeric',month:'short',year:'numeric'});}catch{return '';}
}
function newsCard(n){
 const kind={schedule:'Расписание',event:'Мероприятие',general:'Объявление'}[n.category]||'Объявление';
 const priority=n.priority==='urgent'?' urgent':n.priority==='important'?' important':'';
 const link=n.link_url&&newsSafeLink(n.link_url);
 return '<article class="kg-news-item'+priority+'">'+
 '<div class="kg-news-meta"><span>'+esc(kind)+'</span><span>'+esc(newsLabel(n))+'</span><time>'+esc(newsDate(n.published_at||n.created_at))+'</time></div>'+
 '<h3>'+esc(n.title)+'</h3><p>'+esc(n.body).replace(/\r?\n/g,'<br>')+'</p>'+
 (link?'<a href="'+esc(link)+'" target="_blank" rel="noopener noreferrer">Подробнее ↗</a>':'')+
 '</article>';
}
function newsRender(){
 const gr=selectedStudyGroup,filtered=newsRows.filter(n=>newsCurrent(n)&&newsMatchesGroup(n,gr))
  .sort((a,b)=>Number(!!b.pinned)-Number(!!a.pinned)||({urgent:2,important:1}[b.priority]||0)-({urgent:2,important:1}[a.priority]||0)||String(b.published_at).localeCompare(String(a.published_at)));
 const holder=newsNode('kgNewsHome'),items=newsNode('kgNewsList');
 if(holder&&items){
  holder.hidden=false;
  newsNode('kgNewsCount').textContent=filtered.length?filtered.length+' '+(filtered.length===1?'объявление':'объявлений'):'';
  const shown=newsAllExpanded?filtered:filtered.slice(0,3);
  items.innerHTML=shown.length?shown.map(newsCard).join(''):'<p class="kg-news-empty">'+(newsStatus==='error'?'Лента пока недоступна. Расписание продолжает работать.':'Пока нет объявлений для вашей группы.')+'</p>';
  const more=newsNode('kgNewsMore');if(more){more.hidden=filtered.length<=3;more.textContent=newsAllExpanded?'Свернуть':'Все объявления ('+filtered.length+')';}
 }
 // Landing has no selected group context. Show only announcements addressed to everybody.
 const landing=newsNode('kgNewsLanding'),landingItems=newsNode('kgNewsLandingList');
 if(landing&&landingItems){
  const global=newsRows.filter(n=>n.scope_type==='all'&&newsCurrent(n)).slice(0,2);
  landing.hidden=!global.length;
  landingItems.innerHTML=global.map(newsCard).join('');
 }
 newsManageRender();
}
function newsAdminUI(){
 const panel=newsNode('kgNewsAdmin');if(panel)panel.hidden=!newsAdmin();
 newsManageRender();
}
function newsManageRender(){
 const list=newsNode('kgNewsManageList');if(!list||!newsAdmin())return;
 list.innerHTML=newsRows.length?newsRows.map(n=>'<div class="kg-news-manage-row"><div><b>'+esc(n.title)+'</b><small>'+esc(newsLabel(n))+' · '+esc(n.category||'general')+(newsCurrent(n)?'':' · неактивно')+'</small></div><div class="kg-news-admin-actions"><button type="button" data-news-edit="'+esc(n.id)+'">Изменить</button><button type="button" data-news-delete="'+esc(n.id)+'">Удалить</button></div></div>').join(''):
 '<p class="kg-news-empty">Новостей пока нет — опубликуйте первое объявление.</p>';
}
async function newsLoad(quiet=false){
 if(quiet && newsStatus==='ok' && Date.now()-newsLastFetch<30000){newsRender();return;}
 const request=++newsRequestSerial;
 try{
  const rows=await cloudRequest('/rest/v1/kgmu_news?select=*&order=published_at.desc&limit=500');
  if(request!==newsRequestSerial)return;
  if(!Array.isArray(rows))throw Error('Некорректный ответ сервера');
  newsRows=rows;newsStatus='ok';newsLastFetch=Date.now();newsRender();
  const st=newsNode('kgNewsAdminStatus');if(st&&newsAdmin()&&!quiet)st.textContent='Новости загружены';
 }catch(e){
  if(request!==newsRequestSerial)return;
  newsStatus='error';newsRender();
  const st=newsNode('kgNewsAdminStatus');if(st&&newsAdmin())st.textContent='Не удалось загрузить новости: '+e.message;
 }
}
function newsScopeFields(){
 const scope=newsNode('kgNewsScope').value;
 for(const [wrap,display] of [['kgNewsProgramWrap',['faculty','course','stream'].includes(scope)],['kgNewsCourseWrap',['course','stream'].includes(scope)],['kgNewsStreamWrap',scope==='stream'],['kgNewsGroupWrap',scope==='group']])newsNode(wrap).hidden=!display;
}
function newsResetForm(){
 const f=newsNode('kgNewsForm');if(!f)return;f.reset();newsEditorId=null;
 newsNode('kgNewsSave').textContent='Опубликовать объявление';
 newsNode('kgNewsCancelEdit').hidden=true;newsScopeFields();
}
function newsPrepareEdit(id){
 const n=newsRows.find(n=>n.id===id);if(!n)return;
 newsEditorId=n.id;
 for(const [field,value] of [['kgNewsTitle',n.title],['kgNewsBody',n.body],['kgNewsCategory',n.category],['kgNewsScope',n.scope_type],['kgNewsProgram',n.program||'lechebnoe'],['kgNewsCourse',String(n.course||1)],['kgNewsStream',String(n.stream||1)],['kgNewsGroup',n.study_group||'1307'],['kgNewsLink',n.link_url||'']])newsNode(field).value=value;
 newsNode('kgNewsPinned').checked=!!n.pinned;
 newsNode('kgNewsPriority').value=n.priority||'normal';
 newsNode('kgNewsExpires').value=n.expires_at?new Date(n.expires_at).toISOString().slice(0,10):'';
 newsNode('kgNewsSave').textContent='Сохранить изменения';
 newsNode('kgNewsCancelEdit').hidden=false;newsScopeFields();
 newsNode('kgNewsForm').scrollIntoView({behavior:'smooth',block:'start'});
}
async function newsSave(ev){
 ev.preventDefault();if(!newsAdmin()){toast('Публикация объявлений доступна только администратору');return;}
 const scope=newsNode('kgNewsScope').value,groupId=newsNode('kgNewsGroup').value;
 if(!NEWS_SCOPE_TYPES.includes(scope))return;
 const title=newsNode('kgNewsTitle').value.trim(),body=newsNode('kgNewsBody').value.trim();
 const link=newsNode('kgNewsLink').value.trim(),safeLink=link?newsSafeLink(link):null;
 if(!title||!body){toast('Заполните заголовок и текст');return;}
 if(link&&!safeLink){toast('Ссылка должна начинаться с https:// или http://');return;}
  // Validate on the client before Supabase's kgmu_news_expiry_valid CHECK.
  // An HTML date is interpreted as the end of that day in the viewer's local time zone.
  const expires=newsNode('kgNewsExpires').value;
  const expirationDate=expires?new Date(expires+'T23:59:59'):null;
  const previousPublishedAt=newsEditorId?newsRows.find(n=>n.id===newsEditorId)?.published_at:null;
  const minValidTime=previousPublishedAt?Math.max(Date.now(),new Date(previousPublishedAt).getTime()):Date.now();
  if(expirationDate&&(!Number.isFinite(expirationDate.getTime()) || expirationDate.getTime()<=minValidTime)){
    const message='Дата окончания должна быть в будущем и позже даты публикации. Выберите другую дату или оставьте поле пустым.';
    const status=newsNode('kgNewsAdminStatus');if(status)status.textContent=message;
    newsNode('kgNewsExpires').focus();toast(message);return;
  }
 const record={title,body,category:newsNode('kgNewsCategory').value,scope_type:scope,
  program:['faculty','course','stream'].includes(scope)?newsNode('kgNewsProgram').value:null,
  course:['course','stream'].includes(scope)?Number(newsNode('kgNewsCourse').value):null,
  stream:scope==='stream'?Number(newsNode('kgNewsStream').value):null,
  study_group:scope==='group'?groupId:null,
  pinned:newsNode('kgNewsPinned').checked,priority:newsNode('kgNewsPriority').value,
  link_url:safeLink||null,expires_at:expirationDate?expirationDate.toISOString():null};
 const label=newsLabel(record);
 if(!confirm((newsEditorId?'Сохранить':'Опубликовать')+' объявление для «'+label+'»?\n\nЭто сообщение увидят все подходящие группы.'))return;
 const save=newsNode('kgNewsSave');save.disabled=true;
 const state=newsNode('kgNewsAdminStatus');state.textContent='Сохраняем…';
 try{
  const modifying=!!newsEditorId;
  const url='/rest/v1/kgmu_news'+(modifying?'?id=eq.'+encodeURIComponent(newsEditorId):'');
  const result=await cloudRequest(url,{method:modifying?'PATCH':'POST',headers:{'Content-Type':'application/json','Prefer':'return=representation'},body:JSON.stringify(record)});
  if(!Array.isArray(result)||result.length!==1)throw Error('Сервер не подтвердил публикацию');
  newsResetForm();await newsLoad(false);state.textContent='Сохранено на сервере · студенты увидят объявление после обновления ленты';
 }catch(e){state.textContent='Ошибка: '+e.message;toast('Не удалось сохранить новость');}
 finally{save.disabled=false;}
}
async function newsDelete(id){
 if(!newsAdmin())return;
 const item=newsRows.find(n=>n.id===id);if(!item||!confirm('Удалить объявление «'+item.title+'» для всех адресатов?'))return;
 try{
  const rows=await cloudRequest('/rest/v1/kgmu_news?id=eq.'+encodeURIComponent(id),{method:'DELETE',headers:{'Prefer':'return=representation'}});
  if(!Array.isArray(rows)||rows.length!==1)throw Error('Не удалось подтвердить удаление');
  if(newsEditorId===id)newsResetForm();await newsLoad(false);toast('Объявление удалено');
 }catch(e){toast('Ошибка удаления: '+e.message);}
}
function backupGroupsSnapshot(){
 const groups={};
 for(const id of GROUP_IDS){
  const records=cloudLocalNotes(id),amendments=cloudLocalAmendments(id);
  if(records.length||amendments.length)groups[id]={records,amendments};
 }
 return {format:'kgmu-v87-all-groups-local',version:1,exportedAt:new Date().toISOString(),note:'Только локальные записи ЭТОГО браузера. Общие записи Supabase сюда не входят.',groups};
}
function backupExportAll(){
 try{
  const data=backupGroupsSnapshot();
  const count=Object.keys(data.groups).length;
  if(!count){toast('В этом браузере нет локальных записей для экспорта');return;}
  downloadText('kgmu_ALL_GROUPS_LOCAL_'+kazanTodayKey()+'.json',JSON.stringify(data,null,2),'application/json;charset=utf-8');
  toast('Сохранён общий архив локальных записей '+count+' групп');
 }catch(e){toast('Ошибка экспорта: '+e.message);}
}
async function backupImportAll(file){
 if(!file)return;
 try{
  const txt=await file.text();if(txt.length>10000000)throw Error('Файл слишком большой (максимум 10 МБ)');
  const data=JSON.parse(txt);let groups={};
  if(data?.format==='kgmu-v87-all-groups-local'&&data.groups&&typeof data.groups==='object'&&!Array.isArray(data.groups))groups=data.groups;
  else if(data?.format==='kgmu-v8-group-records'&&GROUP_IDS.includes(data.group))groups={[data.group]:{records:data.records,amendments:data.amendments||[]}};
  else if(data?.format==='kgmu1307-schedule-notes')groups={'1307':{records:data.records,amendments:[]}};
  else throw Error('Неподдерживаемый формат архива');
  let sum=0,changed=0,groupsCount=0;const plan=[];
  for(const [id,raw] of Object.entries(groups)){
   if(!GROUP_IDS.includes(id)||!raw||!Array.isArray(raw.records)||!Array.isArray(raw.amendments))throw Error('Некорректный раздел группы '+id);
   if(raw.records.length>3000||raw.amendments.length>2000||!raw.records.every(validNote)||!raw.amendments.every(validAmendment))throw Error('Ошибка данных группы '+id);
   const records=raw.records.map(sanitizeNote),amendments=raw.amendments.map(sanitizeAmendment);
   const oldN=cloudLocalNotes(id),oldA=cloudLocalAmendments(id);
   const nmap=new Map(oldN.map(n=>[n.id,n])),amap=new Map(oldA.map(a=>[a.id,a]));
   let added=0;for(const n of records)if(!nmap.has(n.id)){nmap.set(n.id,n);added++;}
   for(const a of amendments)if(!amap.has(a.id)){amap.set(a.id,a);added++;}
   if(added)changed+=added;sum+=records.length+amendments.length;groupsCount++;
   plan.push({id,records:[...nmap.values()],amendments:[...amap.values()]});
  }
  if(!groupsCount)throw Error('Архив не содержит записей');
  if(!confirm('Архив содержит '+sum+' записей в '+groupsCount+' группах.\n\nБудет добавлено новых: '+changed+'. Существующие записи НЕ будут перезаписаны и ничего НЕ опубликуется в Supabase. Продолжить?'))return;
  // Make a protective export of pre-import local records, if any, before writing anything.
  const before=backupGroupsSnapshot();
  if(Object.keys(before.groups).length){downloadText('kgmu_BEFORE_IMPORT_'+kazanTodayKey()+'.json',JSON.stringify(before,null,2),'application/json;charset=utf-8');}
  for(const p of plan){
   localStorage.setItem('kgmu-v8-notes-'+p.id,JSON.stringify(p.records));
   localStorage.setItem('kgmu-v8-changes-'+p.id,JSON.stringify(p.amendments));
  }
  if(selectedStudyGroup){loadGroupData(selectedStudyGroup);if(typeof cloudMergeRecords==='function')cloudMergeRecords();render();renderToday();renderCalendar();renderDayDetail();renderModules();}
  toast('Готово: '+changed+' новых записей · '+groupsCount+' групп · без перезаписи');
 }catch(e){toast('Ошибка импорта: '+e.message);}
 finally{for(const id of ['kgBackupImportFile','kgBackupImportCalendarFile']){const f=newsNode(id);if(f)f.value='';}}
}
async function backupFetchAll(table){
 const out=[];
 for(let offset=0;offset<100000;offset+=1000){
  const page=await cloudRequest('/rest/v1/'+table+'?select=*&limit=1000&offset='+offset);
  if(!Array.isArray(page))throw Error('Ошибка экспорта '+table);
  out.push(...page);
  if(page.length<1000)return out;
 }
 throw Error('Слишком много записей для одного файла; экспорт прерван');
}
async function backupExportCloud(){
 if(!newsAdmin()){toast('Общий серверный архив доступен только администратору');return;}
 const b=newsNode('kgCloudBackupAll');b.disabled=true;
 try{
  const [notesData,amendmentsData,newsData]=await Promise.all([backupFetchAll('kgmu_notes'),backupFetchAll('kgmu_amendments'),backupFetchAll('kgmu_news')]);
  const payload={format:'kgmu-v87-server-snapshot',version:1,exportedAt:new Date().toISOString(),description:'Резервная копия данных Supabase; не содержит схемы SQL и пользователей Auth.',kgmu_notes:notesData,kgmu_amendments:amendmentsData,kgmu_news:newsData};
  downloadText('kgmu_SERVER_BACKUP_'+kazanTodayKey()+'.json',JSON.stringify(payload,null,2),'application/json;charset=utf-8');
  toast('Скачан серверный архив: '+notesData.length+' ДЗ/модулей · '+newsData.length+' объявлений');
 }catch(e){toast('Ошибка серверного архива: '+e.message);}
 finally{b.disabled=false;}
}
async function backupPublishAllLocal(){
 if(!newsAdmin()){toast('Массовая публикация доступна только администратору');return;}
 const data=backupGroupsSnapshot(),ids=Object.keys(data.groups).filter(g=>data.groups[g].records.length);
 const amount=ids.reduce((n,id)=>n+data.groups[id].records.length,0);
 if(!amount){toast('Нет локальных ДЗ и модулей для публикации');return;}
 if(!confirm('Массовая публикация '+amount+' локальных ДЗ/модулей из '+ids.length+' групп.\n\nВсе студенты увидят эти записи. Сначала скачайте резервную копию. Старые локальные данные НЕ удаляются. Продолжить?'))return;
 const button=newsNode('kgPublishAllLocal');button.disabled=true;
 const st=newsNode('kgBackupStatus');st.textContent='Публикуем…';
 let published=0;
 try{
  for(const id of ids){
   const entries=data.groups[id].records;
   for(let i=0;i<entries.length;i+=10){
    const batch=entries.slice(i,i+10).map(n=>({id:n.id,study_group:id,date:n.date,type:n.type,subject:n.subject,subgroup:n.subgroup,title:n.title,details:n.details,resources:n.resources}));
    const saved=await cloudRequest('/rest/v1/kgmu_notes',{method:'POST',headers:{'Content-Type':'application/json','Prefer':'resolution=ignore-duplicates,return=representation'},body:JSON.stringify(batch)});
    if(!Array.isArray(saved))throw Error('Некорректный ответ');published+=saved.length;
   }
  }
  if(selectedStudyGroup)await cloudRefreshGroup(true);
  st.textContent='Опубликовано '+published+' новых записей · локальные копии сохранены';
  toast('Опубликовано '+published+' новых общих записей');
 }catch(e){st.textContent='Остановлено: '+e.message+' · опубликовано '+published+' · локальные копии сохранены';}
 finally{button.disabled=false;}
}
function newsSetup(){
 const groups=GROUP_IDS.map(id=>'<option value="'+esc(id)+'">'+esc(id)+'</option>').join('');
 const g=newsNode('kgNewsGroup');if(g){g.innerHTML=groups;g.value=selectedStudyGroup||'1307';}
 for(const name of ['kgBackupExport','kgBackupExportCalendar'])newsNode(name)?.addEventListener('click',backupExportAll);
 for(const name of ['kgBackupImport','kgBackupImportCalendar']){
  newsNode(name)?.addEventListener('click',()=>newsNode(name==='kgBackupImport'?'kgBackupImportFile':'kgBackupImportCalendarFile')?.click());
 }
 for(const name of ['kgBackupImportFile','kgBackupImportCalendarFile'])newsNode(name)?.addEventListener('change',e=>backupImportAll(e.target.files[0]));
 newsNode('kgCloudBackupAll')?.addEventListener('click',backupExportCloud);
 newsNode('kgPublishAllLocal')?.addEventListener('click',backupPublishAllLocal);
  // Keep the date picker at or after the current local day.
  const endDate=newsNode('kgNewsExpires');
  if(endDate){const now=new Date();const pad=n=>String(n).padStart(2,'0');endDate.min=now.getFullYear()+'-'+pad(now.getMonth()+1)+'-'+pad(now.getDate());}
  newsNode('kgNewsScope')?.addEventListener('change',newsScopeFields);
 newsNode('kgNewsForm')?.addEventListener('submit',newsSave);
 newsNode('kgNewsCancelEdit')?.addEventListener('click',newsResetForm);
 newsNode('kgNewsMore')?.addEventListener('click',()=>{newsAllExpanded=!newsAllExpanded;newsRender();});
 newsNode('kgNewsRefresh')?.addEventListener('click',()=>newsLoad());
 newsNode('kgNewsManageList')?.addEventListener('click',e=>{
  const edit=e.target.closest('[data-news-edit]'),del=e.target.closest('[data-news-delete]');
  if(edit)newsPrepareEdit(edit.dataset.newsEdit);
  if(del)newsDelete(del.dataset.newsDelete);
 });
 // Reuse cloud session/role notifications, without changing the original login flow.
 const cloudUI=cloudUpdateUI;
 cloudUpdateUI=function(...args){cloudUI(...args);newsAdminUI();};
 const changeGroup=cloudGroupChanged;
 cloudGroupChanged=function(...args){changeGroup(...args);newsAllExpanded=false;newsRender();newsLoad(true);};
 const loadPermissions=cloudLoadPermissions;
 cloudLoadPermissions=async function(...args){const res=await loadPermissions(...args);newsAdminUI();await newsLoad(false);return res;};
 const logout=cloudLogout;
 cloudLogout=async function(...args){const res=await logout(...args);newsAdminUI();await newsLoad(true);return res;};
 newsScopeFields();newsAdminUI();newsRender();newsLoad(true);
 window.addEventListener('focus',()=>{if(!document.hidden)newsLoad(true);});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)newsLoad(true);});
 window.setInterval(()=>{if(!document.hidden&&navigator.onLine)newsLoad(true);},300000);
}
newsSetup();
