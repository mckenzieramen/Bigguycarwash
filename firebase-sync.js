/* Big Guy's Carwash — Firebase central data bridge (SAFE CENTRAL SYNC).
   Firestore is the central source of truth. localStorage is only an offline cache.
   IMPORTANT: local + cloud data are MERGED by stable keys before every write so
   opening another device can never blank an existing cloud record. */
(function(){
  const cfg=window.BIGGUYS_FIREBASE_CONFIG||{};
  const configured=!!(cfg.apiKey&&cfg.authDomain&&cfg.projectId&&cfg.appId);
  let db=null,auth=null,readyPromise=null,unsubscribers=[],syncBusy=false;

  const clean=s=>({
    employees:Array.isArray(s?.employees)?s.employees:[],
    attendance:Array.isArray(s?.attendance)?s.attendance:[],
    sales:Array.isArray(s?.sales)?s.sales:[],
    faces:s?.faces&&typeof s.faces==='object'?s.faces:{},
    faceUpdatedAt:s?.faceUpdatedAt&&typeof s.faceUpdatedAt==='object'?s.faceUpdatedAt:{},
    dailyReports:s?.dailyReports&&typeof s.dailyReports==='object'?s.dailyReports:{},
    lastFaceCapture:s?.lastFaceCapture||null
  });

  const isAdmin=()=>!!(auth?.currentUser&&!auth.currentUser.isAnonymous);
  const keyOf=(v,fields,fallback)=>{
    const parts=fields.map(k=>v?.[k]??'');
    const key=parts.join('|');
    return key==='|'||parts.every(x=>x==='')?fallback:key;
  };
  const mergeArray=(local=[],cloud=[],keyFn)=>{
    const out=[]; const seen=new Set();
    for(const item of [...cloud,...local]){
      const key=keyFn(item);
      if(seen.has(key)){
        // Cloud is authoritative for duplicate records unless the local copy
        // explicitly carries a newer mutation timestamp. This prevents a
        // stale phone/computer cache from overwriting newer cloud data.
        const idx=out.findIndex(x=>keyFn(x)===key);
        if(idx>=0){
          const existing=out[idx];
          const et=Date.parse(existing?._updatedAt||'')||0;
          const it=Date.parse(item?._updatedAt||'')||0;
          if(it>et)out[idx]=item;
        }
      }else{seen.add(key);out.push(item);}
    }
    return out;
  };
  const mergeObject=(local={},cloud={})=>Object.assign({},cloud||{},local||{});
  const mergeState=(local,cloud)=>{
    const l=clean(local),c=clean(cloud);
    return {
      employees:mergeArray(l.employees,c.employees,e=>String(e?.id||e?.uid||e?.name||JSON.stringify(e))),
      attendance:mergeArray(l.attendance,c.attendance,e=>String(e?.id||keyOf(e,['employeeId','date','clockIn','clockOut'],JSON.stringify(e)))),
      sales:mergeArray(l.sales,c.sales,e=>String(e?.id||keyOf(e,['date','time','employeeId','amount','note'],JSON.stringify(e)))),
      faces:mergeObject(l.faces,c.faces),
      faceUpdatedAt:mergeObject(l.faceUpdatedAt,c.faceUpdatedAt),
      dailyReports:mergeObject(l.dailyReports,c.dailyReports),
      // Keep the most recent capture when both devices have one.
      lastFaceCapture:(new Date(l.lastFaceCapture?.capturedAt||0)>=new Date(c.lastFaceCapture?.capturedAt||0)?l.lastFaceCapture:c.lastFaceCapture)||null
    };
  };

  function status(extra){
    window.BIGGUYS_CLOUD=Object.assign({configured,ready:!!db,status:db?'connected':'waiting'},extra||{});
  }

  async function ensureAuth(mode){
    if(!auth)auth=firebase.auth();
    if(auth.currentUser)return auth.currentUser;
    if(mode==='admin')throw new Error('Admin authentication required. Please log in first.');
    const cred=await auth.signInAnonymously();
    return cred.user;
  }

  async function readCloudDocs(){
    if(!db)throw new Error('Firebase Firestore is not initialized.');
    const publicRef=db.doc('bigguys/public');
    const attendanceRef=db.doc('bigguys/attendance');
    const businessRef=db.doc('bigguys/business');
    const [ps,as,bs]=await Promise.all([
      publicRef.get(),attendanceRef.get(),isAdmin()?businessRef.get():Promise.resolve(null)
    ]);
    return {
      public:ps.exists?(ps.data()||{}):{},
      attendance:as.exists?(as.data()||{}):{},
      business:bs?.exists?(bs.data()||{}):{}
    };
  }

  async function readState(local){
    const s=clean(local);
    const docs=await readCloudDocs();
    const cloud={
      employees:Array.isArray(docs.public.employees)?docs.public.employees:[],
      faces:docs.public.faces&&typeof docs.public.faces==='object'?docs.public.faces:{},
        faceUpdatedAt:docs.public.faceUpdatedAt&&typeof docs.public.faceUpdatedAt==='object'?docs.public.faceUpdatedAt:{},
      attendance:Array.isArray(docs.attendance.attendance)?docs.attendance.attendance:[],
      lastFaceCapture:docs.attendance.lastFaceCapture||null,
      sales:Array.isArray(docs.business.sales)?docs.business.sales:[],
      dailyReports:docs.business.dailyReports&&typeof docs.business.dailyReports==='object'?docs.business.dailyReports:{}
    };
    return mergeState(s,cloud);
  }

  async function pushState(state){
    if(!db)throw new Error('Firebase Firestore is not initialized.');
    // Serialize writes instead of failing when an enrollment/save overlaps a realtime sync.
    while(syncBusy) await new Promise(r=>setTimeout(r,120));
    syncBusy=true;
    try{
      const current=clean(state);
      const docs=await readCloudDocs();
      const cloud={
        employees:Array.isArray(docs.public.employees)?docs.public.employees:[],
        faces:docs.public.faces&&typeof docs.public.faces==='object'?docs.public.faces:{},
      faceUpdatedAt:docs.public.faceUpdatedAt&&typeof docs.public.faceUpdatedAt==='object'?docs.public.faceUpdatedAt:{},
        attendance:Array.isArray(docs.attendance.attendance)?docs.attendance.attendance:[],
        lastFaceCapture:docs.attendance.lastFaceCapture||null,
        sales:Array.isArray(docs.business.sales)?docs.business.sales:[],
        dailyReports:docs.business.dailyReports&&typeof docs.business.dailyReports==='object'?docs.business.dailyReports:{}
      };
      const merged=mergeState(current,cloud);
      const stamp=firebase.firestore.FieldValue.serverTimestamp();
      if(isAdmin()){
        await Promise.all([
          db.doc('bigguys/public').set({employees:merged.employees,faces:merged.faces,faceUpdatedAt:merged.faceUpdatedAt,updatedAt:stamp},{merge:true}),
          db.doc('bigguys/attendance').set({attendance:merged.attendance,lastFaceCapture:merged.lastFaceCapture,updatedAt:stamp},{merge:true}),
          db.doc('bigguys/business').set({sales:merged.sales,dailyReports:merged.dailyReports,updatedAt:stamp},{merge:true})
        ]);
      }else{
        // Employee DTR devices use anonymous Firebase auth and may only write attendance.
        await db.doc('bigguys/attendance').set({attendance:merged.attendance,lastFaceCapture:merged.lastFaceCapture,updatedAt:stamp},{merge:true});
      }
      status({configured:true,ready:true,status:'connected',lastSyncAt:new Date().toISOString(),lastSyncError:null});
      return merged;
    }catch(err){
      status({configured:true,ready:true,status:'error',lastSyncError:err,error:err});
      throw err;
    }finally{syncBusy=false;}
  }

  function startListeners(onRemote){
    const refs=[db.doc('bigguys/public'),db.doc('bigguys/attendance')];
    if(isAdmin())refs.push(db.doc('bigguys/business'));
    const apply=async()=>{
      try{
        // Merge incoming cloud data with the current local cache instead of replacing it.
        const local=window.__BIGGUYS_CURRENT_STATE||{};
        const next=await readState(local);
        window.__BIGGUYS_CURRENT_STATE=next;
        if(onRemote)onRemote(next);
        status({configured:true,ready:true,status:'connected',lastSyncAt:new Date().toISOString(),lastSyncError:null});
      }catch(err){
        console.warn('Firebase realtime read failed:',err);
        status({configured:true,ready:true,status:'error',lastSyncError:err,error:err});
      }
    };
    refs.forEach(ref=>unsubscribers.push(ref.onSnapshot(apply,e=>{
      console.warn('Firebase listener:',e);
      status({configured:true,ready:true,status:'error',lastSyncError:e,error:e});
    })));
  }

  async function init(initial,onRemote,mode='dtr'){
    if(!configured){status({ready:false,status:'not-configured',push:async()=>false});return false;}
    if(readyPromise)return readyPromise;
    readyPromise=(async()=>{
      try{
        if(!window.firebase)throw new Error('Firebase SDK did not load.');
        if(!firebase.apps.length)firebase.initializeApp(cfg);
        db=firebase.firestore();
        auth=firebase.auth();
        await ensureAuth(mode);
        const merged=await readState(initial||{});
        window.__BIGGUYS_CURRENT_STATE=merged;
        if(onRemote)onRemote(merged);

        if(isAdmin()){
          // Always merge then save. This is the migration path for existing browser data.
          const saved=await pushState(merged);
          window.__BIGGUYS_CURRENT_STATE=saved;
          if(onRemote)onRemote(saved);
        }else{
          status({configured:true,ready:true,status:'connected',lastSyncAt:new Date().toISOString(),lastSyncError:null});
        }
        startListeners(onRemote);
        startCentralRefresh();
        return true;
      }catch(err){
        console.error('Firebase initialization failed:',err);
        status({configured:true,ready:false,status:'error',error:err,lastSyncError:err,push:async()=>false});
        return false;
      }
    })();
    return readyPromise;
  }

  async function getAdminProfile(user){
    if(!db)throw new Error('Firebase Firestore is not initialized.');
    const u=user||auth?.currentUser;
    if(!u||u.isAnonymous)throw new Error('Admin authentication required.');
    const snap=await db.doc(`admins/${u.uid}`).get();
    if(!snap.exists)throw new Error('Admin profile not found in Firestore.');
    const profile=snap.data()||{};
    if(profile.role!=='admin'||profile.active!==true)throw new Error('This Firebase account is not an active administrator.');
    return {uid:u.uid,...profile};
  }

  async function adminLogin(email,password){
    if(!configured)throw new Error('Firebase configuration is missing.');
    if(!window.firebase)throw new Error('Firebase SDK did not load.');
    if(!firebase.apps.length)firebase.initializeApp(cfg);
    auth=auth||firebase.auth();
    // Firestore must be initialized before checking the admin profile.
    db=db||firebase.firestore();
    const user=(await auth.signInWithEmailAndPassword(email,password)).user;
    if(user.isAnonymous)throw new Error('Anonymous accounts cannot access the Admin Dashboard.');
    await getAdminProfile(user);
    readyPromise=null;
    unsubscribers.forEach(fn=>fn&&fn());unsubscribers=[];
    window.__BIGGUYS_CURRENT_STATE=null;
    status({configured:true,ready:false,status:'authenticated',userEmail:user.email});
    return user;
  }

  async function adminLogout(){
    if(auth)await auth.signOut();
    readyPromise=null;window.__BIGGUYS_CURRENT_STATE=null;
    unsubscribers.forEach(fn=>fn&&fn());unsubscribers=[];
    status({configured,ready:false,status:'signed-out',push:async()=>false});
  }

  let refreshTimer=null;
  function startCentralRefresh(){
    if(refreshTimer||!isAdmin())return;
    const refresh=async()=>{
      try{
        const local=window.__BIGGUYS_CURRENT_STATE||{};
        const next=await readState(local);
        window.__BIGGUYS_CURRENT_STATE=next;
        status({configured:true,ready:true,status:'connected',lastSyncAt:new Date().toISOString(),lastSyncError:null});
        window.dispatchEvent(new CustomEvent('bigguys:cloud-state',{detail:next}));
      }catch(err){
        console.warn('Central refresh failed:',err);
        status({configured:true,ready:true,status:'error',lastSyncError:err,error:err});
      }
    };
    refreshTimer=setInterval(refresh,5000);
    window.addEventListener('online',refresh);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  }

  window.BigGuysCloud={
    init,adminLogin,adminLogout,getAdminProfile,configured,isAdmin,ensureAuth,
    push:async state=>pushState(state),
    getStatus:()=>window.BIGGUYS_CLOUD||{configured,ready:false,status:'waiting'}
  };
  status({configured,ready:false,status:configured?'waiting':'not-configured'});
})();
