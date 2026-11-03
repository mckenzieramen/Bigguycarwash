/* Big Guy admin: mobile table scrolling + reload-safe Firebase admin session. */
(function(){
  'use strict';

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
    wrapPayrollTables();
    const payroll=document.getElementById('payroll');
    if(!payroll)return;
    new MutationObserver(wrapPayrollTables).observe(payroll,{childList:true,subtree:true});
  }

  async function restoreAdminSession(){
    if(!window.firebase?.auth || !window.BigGuysCloud)return;
    try{
      await new Promise(resolve=>{
        const stop=firebase.auth().onAuthStateChanged(async user=>{
          stop();
          if(!user || user.isAnonymous){resolve();return;}
          try{
            await BigGuysCloud.getAdminProfile(user);
            document.getElementById('adminLogin')?.classList.add('hidden');
            document.getElementById('dashboard')?.classList.remove('hidden');
            document.body.classList.add('logged-in');
            if(typeof refresh==='function')refresh();
            if(typeof startClock==='function')startClock();
            BigGuysCloud.init(window.__BIGGUYS_CURRENT_STATE||window.state||{},remote=>{
              try{
                if(typeof state!=='undefined')state=remote;
                if(typeof cacheState==='function')cacheState();
                if(typeof refresh==='function')refresh();
              }catch(e){console.warn('Admin session refresh skipped:',e);}
            },'admin').catch(err=>console.warn('Admin session cloud restore failed:',err));
          }catch(err){console.warn('Saved admin session is no longer authorized:',err);}
          resolve();
        });
        setTimeout(resolve,5000);
      });
    }catch(err){console.warn('Admin session restore skipped:',err);}
  }

  function init(){observePayroll();restoreAdminSession();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
