/* Big Guy Admin Schedule Draft Guard
   Keeps unfinished CREATE SCHEDULE selections stable during live refresh/cloud sync
   and restores them after a browser reload. Saved schedules remain handled by admin.js/Firebase. */
(function(){
  'use strict';
  if(typeof window==='undefined'||typeof document==='undefined')return;
  const SNAP_KEY='bigguys_schedule_guard_v1';
  const UI_KEY='bigguys_schedule_ui_state_v1';
  let applying=false;

  function mondayOf(date){
    const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date||''));
    if(!m)return '';
    const d=new Date(Number(m[1]),Number(m[2])-1,Number(m[3]));
    const day=d.getDay(),diff=day===0?-6:1-day;
    d.setDate(d.getDate()+diff);
    return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
  }
  function read(){try{const x=JSON.parse(localStorage.getItem(SNAP_KEY)||'{}');return x&&typeof x==='object'?x:{};}catch(e){return {};}}
  function write(x){try{localStorage.setItem(SNAP_KEY,JSON.stringify(x));}catch(e){}}
  function createMode(){
    const create=document.getElementById('scheduleModeCreate');
    const scheduled=document.getElementById('scheduleModeScheduled');
    if(create?.classList.contains('active'))return true;
    if(scheduled?.classList.contains('active'))return false;
    try{return JSON.parse(localStorage.getItem(UI_KEY)||'{}').mode!=='scheduled';}catch(e){return true;}
  }
  function currentDate(){return document.getElementById('scheduleWeekOf')?.value||'';}
  function selects(){return [...document.querySelectorAll('#scheduleRoster select.site-roster-select[data-roster-site][data-roster-day]')];}
  function slotKey(sel){
    const same=[...document.querySelectorAll(`#scheduleRoster select.site-roster-select[data-roster-site="${sel.dataset.rosterSite}"][data-roster-day="${sel.dataset.rosterDay}"]`)];
    return `${sel.dataset.rosterSite}|${sel.dataset.rosterDay}|${Math.max(0,same.indexOf(sel))}`;
  }
  function saveSnapshot(){
    if(applying||!createMode())return;
    const date=currentDate(),week=mondayOf(date),list=selects();
    if(!week||!list.length)return;
    const slots={};list.forEach(s=>slots[slotKey(s)]=String(s.value||''));
    const all=read();all[week]={date,week,slots,updatedAt:Date.now()};write(all);
    try{
      const ui=JSON.parse(localStorage.getItem(UI_KEY)||'{}');
      localStorage.setItem(UI_KEY,JSON.stringify({...ui,mode:'create',week,selectedDate:date,draftActive:true,draftWeek:week}));
    }catch(e){}
  }
  function restoreSnapshot(force){
    if(!createMode())return;
    const date=currentDate(),week=mondayOf(date),snap=read()[week],list=selects();
    if(!snap||!list.length)return;
    applying=true;
    try{
      list.forEach(sel=>{
        const wanted=String(snap.slots?.[slotKey(sel)]??'');
        if(String(sel.value||'')===wanted)return;
        if(wanted && ![...sel.options].some(o=>String(o.value)===wanted))return;
        if(force || !sel.value || wanted)sel.value=wanted;
      });
    }finally{applying=false;}
  }
  function restoreLastDraftOnLoad(){
    const all=read(),entries=Object.values(all).filter(x=>x&&x.week&&x.date).sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0));
    if(!entries.length)return;
    let ui={};try{ui=JSON.parse(localStorage.getItem(UI_KEY)||'{}')||{};}catch(e){}
    if(ui.mode==='scheduled')return;
    const latest=entries[0],input=document.getElementById('scheduleWeekOf');
    if(input&&!input.value)input.value=latest.date;
    try{localStorage.setItem(UI_KEY,JSON.stringify({...ui,mode:'create',week:latest.week,selectedDate:latest.date,draftActive:true,draftWeek:latest.week}));}catch(e){}
  }

  document.addEventListener('change',function(ev){
    const t=ev.target;
    if(t?.matches?.('#scheduleRoster select.site-roster-select[data-roster-site][data-roster-day]')){
      setTimeout(saveSnapshot,0);
      setTimeout(()=>restoreSnapshot(false),80);
    }
    if(t?.id==='scheduleWeekOf')setTimeout(()=>restoreSnapshot(true),100);
  },true);

  function start(){
    if(!document.body?.classList.contains('admin-body'))return;
    restoreLastDraftOnLoad();
    const root=document.getElementById('scheduleRoster');
    if(root){
      new MutationObserver(()=>setTimeout(()=>restoreSnapshot(true),0)).observe(root,{childList:true,subtree:true});
    }
    // Guard against the dashboard's frequent refresh cycle replacing a draft selection.
    setInterval(()=>restoreSnapshot(false),350);
    setTimeout(()=>restoreSnapshot(true),150);
    setTimeout(()=>restoreSnapshot(true),700);
    setTimeout(()=>restoreSnapshot(true),1800);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
