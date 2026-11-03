/* Big Guy admin: mobile payroll scrolling + reload-safe Firebase admin session. */
(function(){
  'use strict';

  function installStyles(){
    if(document.getElementById('bigguys-mobile-payroll-fix'))return;
    const style=document.createElement('style');
    style.id='bigguys-mobile-payroll-fix';
    style.textContent=`
      .mobile-payroll-scroll{width:100%;max-width:100%;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;overscroll-behavior-x:contain;scrollbar-width:thin;padding-bottom:3px}
      .mobile-payroll-scroll>.table{width:max-content!important;min-width:760px!important;margin:0}
      .mobile-payroll-scroll::-webkit-scrollbar{height:8px}
      .mobile-payroll-scroll::-webkit-scrollbar-thumb{background:#28445d;border-radius:10px}
      .mobile-payroll-scroll::-webkit-scrollbar-track{background:#071523;border-radius:10px}
      @media(max-width:700px){#payroll .dashboard-card,#payroll .card{max-width:100%;min-width:0;overflow:hidden}.mobile-payroll-scroll{display:block;touch-action:pan-x pan-y}.mobile-payroll-scroll>.table th,.mobile-payroll-scroll>.table td{white-space:nowrap}}
    `;
    document.head.appendChild(style);
  }

  function wrapPayrollTables(){
    document.querySelectorAll('#payroll .table').forEach(table=>{
      if(table.parentElement?.classList.contains('mobile-payroll-scroll'))return;
      const wrap=document.createElement('div');
      wrap.className='mobile-payroll-scroll';
      table.parentNode.insertBefore(wrap,table);
      wrap.appendChild(table);
    });
  }

  function observePayroll(){
    installStyles();wrapPayrollTables();
    const payroll=document.getElementById('payroll');
    if(!payroll)return;
    new MutationObserver(()=>wrapPayrollTables()).observe(payroll,{childList:true,subtree:true});
  }

  function showRestoredDashboard(){
    document.getElementById('adminLogin')?.classList.add('hidden');
    document.getElementById('dashboard')?.classList.remove('hidden');
    document.body.classList.add('logged-in');
    try{if(typeof refresh==='function')refresh();}catch(e){}
    try{if(typeof startClock==='function')startClock();}catch(e){}
  }

  function restoreAdminSession(){
    if(!window.firebase?.auth || !window.BigGuysCloud)return;
    const auth=firebase.auth();
    const stop=auth.onAuthStateChanged(async user=>{
      if(!user || user.isAnonymous)return;
      try{
        await BigGuysCloud.getAdminProfile(user);
        showRestoredDashboard();
        await BigGuysCloud.init(typeof state!=='undefined'?state:{},remote=>{
          try{
            if(typeof state!=='undefined')state=remote;
            if(typeof cacheState==='function')cacheState();
            if(typeof refresh==='function')refresh();
          }catch(e){console.warn('Admin session refresh skipped:',e);}
        },'admin');
      }catch(err){console.warn('Saved admin session is no longer authorized:',err);}
    });
    window.addEventListener('beforeunload',()=>{try{stop();}catch(e){}},{once:true});
  }

  function init(){observePayroll();restoreAdminSession();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
