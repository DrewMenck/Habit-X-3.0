// HabitX v5 — finished-day X icon + fixes + analytics
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    document.getElementById('tab-tracker').classList.toggle('hidden', tab!=='tracker');
    document.getElementById('tab-analytics').classList.toggle('hidden', tab!=='analytics');
    if (tab==='analytics') renderAnalytics();
  });
});

const banner = document.getElementById('offlineBanner');
const bannerClose = document.getElementById('bannerClose');
const BANNER_KEY = 'habitx_banner_dismissed_v5';
function showBanner(){ if(localStorage.getItem(BANNER_KEY)==='1') return; banner?.removeAttribute('hidden'); }
bannerClose?.addEventListener('click', ()=>{ localStorage.setItem(BANNER_KEY,'1'); banner?.setAttribute('hidden',''); });

let deferredPrompt=null;
const installBtn=document.getElementById('installBtn');
if(installBtn){
  window.addEventListener('beforeinstallprompt',(e)=>{e.preventDefault();deferredPrompt=e;installBtn.style.display='inline-block';});
  installBtn.addEventListener('click', async()=>{ if(!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt=null; installBtn.style.display='none'; });
}

if('serviceWorker' in navigator){
  window.addEventListener('load',()=>{ navigator.serviceWorker.register('./sw.js'); });
  navigator.serviceWorker.addEventListener('message',(e)=>{ if(e.data && (e.data.type==='offline-ready'||e.data==='offline-ready')) showBanner(); });
  navigator.serviceWorker.addEventListener('controllerchange',()=>{ setTimeout(showBanner,300); });
}

function localYMD(date){ const d=new Date(date.getFullYear(),date.getMonth(),date.getDate()); const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const da=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${da}`; }
function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
function startOfMonth(d){ return new Date(d.getFullYear(),d.getMonth(),1); }
function endOfMonth(d){ return new Date(d.getFullYear(),d.getMonth()+1,0); }
function sameDay(a,b){ return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate(); }
function daysBetweenInclusive(a,b){ const ms=86400000; const aa=new Date(a.getFullYear(),a.getMonth(),a.getDate()); const bb=new Date(b.getFullYear(),b.getMonth(),b.getDate()); return Math.floor((bb-aa)/ms)+1; }

const DB_NAME='habitx-db', DB_VERSION=1, STORE_HABITS='habits', STORE_MARKS='marks';
function openDB(){ return new Promise((resolve,reject)=>{ const req=indexedDB.open(DB_NAME,DB_VERSION);
  req.onupgradeneeded=()=>{ const db=req.result; if(!db.objectStoreNames.contains(STORE_HABITS)){ const s=db.createObjectStore(STORE_HABITS,{keyPath:'id'}); s.createIndex('byCreated','created'); } if(!db.objectStoreNames.contains(STORE_MARKS)){ db.createObjectStore(STORE_MARKS); } };
  req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error);
});}
async function dbGetAll(store){ const db=await openDB(); return new Promise((res,rej)=>{ const tx=db.transaction(store,'readonly'); const s=tx.objectStore(store); const rq=s.getAll(); rq.onsuccess=()=>res(rq.result||[]); rq.onerror=()=>rej(rq.error); }); }
async function dbPut(store,value,key){ const db=await openDB(); return new Promise((res,rej)=>{ const tx=db.transaction(store,'readwrite'); const s=tx.objectStore(store); const rq=key?s.put(value,key):s.put(value); rq.onsuccess=()=>res(true); rq.onerror=()=>rej(rq.error); }); }
async function dbDel(store,key){ const db=await openDB(); return new Promise((res,rej)=>{ const tx=db.transaction(store,'readwrite'); const s=tx.objectStore(store); const rq=s.delete(key); rq.onsuccess=()=>res(true); rq.onerror=()=>rej(rq.error); }); }
async function dbKeysWithPrefix(prefix){ const db=await openDB(); return new Promise((res,rej)=>{ const tx=db.transaction(STORE_MARKS,'readonly'); const s=tx.objectStore(STORE_MARKS); const rq=s.getAllKeys(); rq.onsuccess=()=>{ const keys=(rq.result||[]).filter(k=>typeof k==='string'&&k.startsWith(prefix)); res(keys); }; rq.onerror=()=>rej(rq.error); }); }

let habits=[], currentHabitId=null, viewMonth=new Date();
const elHabitSelect=document.getElementById('habitSelect');
const elAddHabitBtn=document.getElementById('addHabitBtn');
const elHabitDialog=document.getElementById('habitDialog');
const elHabitForm=document.getElementById('habitForm');
const elSaveDesc=document.getElementById('saveDescBtn');
const elDesc=document.getElementById('habitDesc');
const elStartDate=document.getElementById('startDate');
const elCur=document.getElementById('currentStreak');
const elLong=document.getElementById('longestStreak');
const elPct=document.getElementById('completionPct');
const elMonthProgress=document.getElementById('monthProgress');
const elLifetimePct=document.getElementById('lifetimePct');
const elLifetimeDone=document.getElementById('lifetimeDone');
const elAnalytics=document.getElementById('analyticsSummary');

document.getElementById('prevMonth').addEventListener('click',()=>{ viewMonth=new Date(viewMonth.getFullYear(),viewMonth.getMonth()-1,1); renderCalendar(); });
document.getElementById('nextMonth').addEventListener('click',()=>{ viewMonth=new Date(viewMonth.getFullYear(),viewMonth.getMonth()+1,1); renderCalendar(); });

(async function init(){
  habits=await dbGetAll(STORE_HABITS);
  if(habits.length===0){ const id=crypto.randomUUID(); const sample={id,name:'Read 20 min',emoji:'📚',color:'#ff9800',created:Date.now(),desc:''}; await dbPut(STORE_HABITS,sample); habits=[sample]; }
  currentHabitId=habits[0].id; renderHabitSelect(); render();
})();

function renderHabitSelect(){ elHabitSelect.innerHTML=''; for(const h of habits){ const opt=document.createElement('option'); opt.value=h.id; opt.textContent=`${h.emoji||'•'} ${h.name}`; elHabitSelect.appendChild(opt); } elHabitSelect.value=currentHabitId; }
elHabitSelect.addEventListener('change',()=>{ currentHabitId=elHabitSelect.value; render(); });

elAddHabitBtn.addEventListener('click',()=>{ elHabitDialog.showModal(); setTimeout(()=>document.getElementById('habitName').focus(),50); });
elHabitForm.addEventListener('submit', async (e)=>{ e.preventDefault(); const name=document.getElementById('habitName').value.trim(); if(!name) return;
  const emoji=document.getElementById('habitEmoji').value.trim(); const color=document.getElementById('habitColor').value;
  const h={id:crypto.randomUUID(),name,emoji,color,created:Date.now(),desc:''}; await dbPut(STORE_HABITS,h); habits.push(h); currentHabitId=h.id; renderHabitSelect(); elHabitDialog.close(); elHabitForm.reset(); render();
});

elSaveDesc.addEventListener('click', async ()=>{ if(!currentHabitId) return; const h=habits.find(x=>x.id===currentHabitId); h.desc=elDesc.value||''; await dbPut(STORE_HABITS,h); alert('Saved.'); });

document.getElementById('deleteHabitBtn').addEventListener('click', async ()=>{
  if(!currentHabitId) return; if(!confirm('Delete this habit and all its history?')) return;
  await dbDel(STORE_HABITS,currentHabitId); const keys=await dbKeysWithPrefix(currentHabitId+'|'); for(const k of keys){ await dbDel(STORE_MARKS,k); }
  habits=habits.filter(h=>h.id!==currentHabitId); if(habits.length===0){ currentHabitId=null; document.getElementById('calendarGrid').innerHTML='<p class="fine">No habits yet. Add one!</p>'; elHabitSelect.innerHTML=''; return; }
  currentHabitId=habits[0].id; renderHabitSelect(); render();
});

document.getElementById('exportBtn').addEventListener('click', async ()=>{
  const data={habits:await dbGetAll(STORE_HABITS), marks:{}};
  for(const h of data.habits){ const keys=await dbKeysWithPrefix(h.id+'|'); const dates=[]; for(const k of keys){ dates.push(k.split('|')[1]); } data.marks[h.id]=dates; }
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='habitx-backup.json'; a.click(); URL.revokeObjectURL(url);
});
document.getElementById('importFile').addEventListener('change', async (e)=>{
  const file=e.target.files[0]; if(!file) return; const txt=await file.text();
  try{ const data=JSON.parse(txt); if(Array.isArray(data.habits)){ for(const h of data.habits){ await dbPut(STORE_HABITS,h); }
      if(data.marks){ for(const [hid,dates] of Object.entries(data.marks)){ for(const d of dates){ await dbPut(STORE_MARKS,true,`${hid}|${d}`); } } }
      habits=await dbGetAll(STORE_HABITS); if(habits.length) currentHabitId=habits[0].id; renderHabitSelect(); render(); alert('Import complete.');
  }}catch(err){ alert('Import failed: '+err.message); } finally{ e.target.value=''; }
});

async function render(){
  if(!currentHabitId) return; const h=habits.find(x=>x.id===currentHabitId);
  document.getElementById('startDate').textContent=new Date(h.created).toLocaleDateString();
  document.getElementById('habitDesc').value=h.desc||'';
  await renderCalendar(); await renderStats();
}

async function renderCalendar(){
  if(!currentHabitId) return; const h=habits.find(x=>x.id===currentHabitId);
  const first=startOfMonth(viewMonth), last=endOfMonth(viewMonth), startIdx=first.getDay(), totalDays=last.getDate(), today=new Date();
  document.getElementById('monthLabel').textContent=new Intl.DateTimeFormat(undefined,{month:'long',year:'numeric'}).format(viewMonth);
  const keys=await dbKeysWithPrefix(h.id+'|'); const marked=new Set(keys.map(k=>k.split('|')[1]));
  const grid=document.getElementById('calendarGrid'); grid.innerHTML='';
  for(let i=0;i<startIdx;i++){ const pad=document.createElement('div'); pad.className='day inactive'; grid.appendChild(pad); }
  for(let day=1; day<=totalDays; day++){
    const d=new Date(viewMonth.getFullYear(),viewMonth.getMonth(),day); const dStr=localYMD(d);
    const cell=document.createElement('div'); cell.className='day'; if(sameDay(today,d)) cell.classList.add('today');
    const num=document.createElement('div'); num.className='num'; num.textContent=String(day); cell.appendChild(num);
    const x=document.createElement('div'); x.className='x'; cell.appendChild(x);
    const btn=document.createElement('button'); btn.setAttribute('aria-label',`Toggle completion for ${dStr}`);
    btn.addEventListener('click', async()=>{
      const key=`${h.id}|${dStr}`; const isComplete=marked.has(dStr);
      if(isComplete){ await dbDel(STORE_MARKS,key); marked.delete(dStr); cell.classList.remove('complete'); x.classList.remove('draw'); }
      else{ await dbPut(STORE_MARKS,true,key); marked.add(dStr); cell.classList.add('complete'); x.classList.remove('draw'); void x.offsetWidth; x.classList.add('draw'); }
      await renderStats(); if(!document.getElementById('tab-analytics').classList.contains('hidden')) await renderAnalytics();
    });
    cell.appendChild(btn);
    if(marked.has(dStr)){ cell.classList.add('complete'); x.classList.add('draw'); }
    grid.appendChild(cell);
  }
}

async function renderStats(){
  if(!currentHabitId){ elCur.textContent='0'; elLong.textContent='0'; elPct.textContent='0%'; elMonthProgress.textContent='0/0'; elLifetimePct.textContent='0%'; elLifetimeDone.textContent='0'; return; }
  const h=habits.find(x=>x.id===currentHabitId);
  const keys=await dbKeysWithPrefix(h.id+'|'); const dates=keys.map(k=>k.split('|')[1]).sort(); const set=new Set(dates);

  let cur=0, ptr=new Date(); while(set.has(localYMD(ptr))){ cur+=1; ptr=addDays(ptr,-1); } elCur.textContent=String(cur);

  let longest=0; const visited=new Set();
  for(const ds of dates){ if(visited.has(ds)) continue; let count=1; visited.add(ds);
    let fwd=addDays(new Date(ds+'T00:00:00'),1); while(set.has(localYMD(fwd))){ visited.add(localYMD(fwd)); count++; fwd=addDays(fwd,1); }
    let bwd=addDays(new Date(ds+'T00:00:00'),-1); while(set.has(localYMD(bwd))){ visited.add(localYMD(bwd)); count++; bwd=addDays(bwd,-1); }
    if(count>longest) longest=count;
  } elLong.textContent=String(longest);

  let comp30=0, dayPtr=new Date(); for(let i=0;i<30;i++){ if(set.has(localYMD(dayPtr))) comp30++; dayPtr=addDays(dayPtr,-1); }
  const pct30=Math.round((comp30/30)*100); elPct.textContent=`${pct30}%`;

  const now=new Date(), monthFirst=startOfMonth(now), monthLast=endOfMonth(now);
  let completedThisMonth=0; for(let d=new Date(monthFirst); d<=monthLast; d=addDays(d,1)){ if(set.has(localYMD(d))) completedThisMonth++; }
  const daysInMonth=monthLast.getDate(); elMonthProgress.textContent=`${completedThisMonth}/${daysInMonth}`;

  const created=new Date(h.created); const totalDays=Math.max(1, daysBetweenInclusive(created,new Date()));
  const lifetimeDone=dates.length; const lifetimePct=Math.min(100, Math.round((lifetimeDone/totalDays)*100));
  elLifetimeDone.textContent=String(lifetimeDone); elLifetimePct.textContent=`${lifetimePct}%`;
}

async function renderAnalytics(){
  const container=elAnalytics; if(!container) return; const allHabits=await dbGetAll(STORE_HABITS);
  container.innerHTML=''; if(allHabits.length===0){ container.textContent='No habits yet.'; return; }
  for(const h of allHabits){
    const keys=await dbKeysWithPrefix(h.id+'|'); const dates=keys.map(k=>k.split('|')[1]); const set=new Set(dates);
    let cur=0, ptr=new Date(); while(set.has(localYMD(ptr))){ cur++; ptr=addDays(ptr,-1); }
    let comp30=0; for(let i=0,d=new Date(); i<30; i++, d=addDays(d,-1)){ if(set.has(localYMD(d))) comp30++; }
    const pct30=Math.round((comp30/30)*100);
    const now=new Date(), first=startOfMonth(now), last=endOfMonth(now);
    let doneMonth=0; for(let d=new Date(first); d<=last; d=addDays(d,1)){ if(set.has(localYMD(d))) doneMonth++; }
    const daysInMonth=last.getDate();
    const totalDays=Math.max(1, daysBetweenInclusive(new Date(h.created), new Date()));
    const lifetimeDone=dates.length; const lifetimePct=Math.min(100, Math.round((lifetimeDone/totalDays)*100));
    const card=document.createElement('div'); card.className='card';
    card.innerHTML=`<div class="row" style="justify-content:space-between"><strong>${h.emoji||'•'} ${h.name}</strong><span class="fine">${new Date(h.created).toLocaleDateString()}</span></div>
    <div class="row wrap" style="margin-top:6px;gap:12px">
      <span><b>${cur}</b> current</span>
      <span><b>${pct30}%</b> last 30d</span>
      <span><b>${doneMonth}/${daysInMonth}</b> this month</span>
      <span><b>${lifetimePct}%</b> lifetime</span>
      <span><b>${lifetimeDone}</b> lifetime done</span>
    </div>`;
    container.appendChild(card);
  }
}
