/* Big Guy's Carwash — Firebase central source of truth.
   Cloud Firestore is authoritative across devices. localStorage is offline cache only. */
(function(){
  const cfg=window.BIGGUYS_FIREBASE_CONFIG||{};
  const configured=!!(cfg.apiKey&&cfg.authDomain&&cfg.projectId&&cfg.appId);
  let db=null,auth=null,readyPromise=null,unsubscribers=[],refreshTimer=null;

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
  const emptyState=s=>!s.employees.length&&!s.attendance.length&&!s.sales.length&&!Object.keys(s.faces).length&&!Object.keys(s.dailyReports).length;
  const idOf=(x,fallback)=>String(x?.id||fallback||JSON.stringify(x));
  const mergeArrays=(cloud=[],local=[],keyFn)=>{
    const out=[...cloud],keys=new Set(cloud.map(keyFn));
    for(const item of local){const k=keyFn(item);if(!keys.has(k)){out.push(item);keys.add(k);}}
    return out;
  };

  function status(extra){window.BIGGUYS_CLOUD=Object.assign({configured,ready:!!db,status:db?'connected':'waiting'},extra||{});}
  async function ensureAuth(mode){
    if(!auth)auth=firebase.auth();
    if(auth.currentUser)return auth.currentUser;
    if(mode==='admin')throw new Error('Admin authentication required. Please log in first.');
    return (await auth.signInAnonymously()).user;
  }
  async function initFirebase(){
    if(!configured)throw new Error('Firebase configuration is missing.');
    if(!window.firebase)throw new Error('Firebase SDK did not load.');
    if(!firebase.apps.length)firebase.initializeApp(cfg);
    db=db||firebase.firestore(); auth=auth||firebase.auth();
  }
  async function readCloud(){
    if(!db)throw new Error('Firebase Firestore is not initialized.');
    const [p,a,b]=await Promise.all([
      db.doc('bigguys/public').get(),
      db.doc('bigguys/attendance').get(),
      isAdmin()?db.doc('bigguys/business').get():Promise.resolve(null)
    ]);
    const pd=p.exists?(p.data()||{}):{}; const ad=a.exists?(a.data()||{}):{}; const bd=b?.exists?(b.data()||{}):{};
    return clean({
      employees:pd.employees,faces:pd.faces,faceUpdatedAt:pd.faceUpdatedAt,
      attendance:ad.attendance,lastFaceCapture:ad.lastFaceCapture,
      sales:bd.sales,dailyReports:bd.dailyReports
    });
  }
  async function readState(){return readCloud();}

  async function migrateLocalIfCloudEmpty(local){
    if(!isAdmin())return readCloud();
    const cloud=await readCloud();
    if(!emptyState(cloud) || emptyState(clean(local)))return cloud;
    const s=clean(local);
    await Promise.all([
      db.doc('bigguys/public').set({employees:s.employees,faces:s.faces,faceUpdatedAt:s.faceUpdatedAt,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true}),
      db.doc('bigguys/attendance').set({attendance:s.attendance,lastFaceCapture:s.lastFaceCapture,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true}),
      db.doc('bigguys/business').set({sales:s.sales,dailyReports:s.dailyReports,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true})
    ]);
    return readCloud();
  }

  async function pushState(local){
    await initFirebase();
    const cloud=await readCloud(),l=clean(local);
    const merged={
      employees:mergeArrays(cloud.employees,l.employees,e=>idOf(e,e?.id)),
      attendance:mergeArrays(cloud.attendance,l.attendance,e=>idOf(e,`${e?.employeeId}|${e?.date}|${e?.clockIn||''}|${e?.clockOut||''}`)),
      sales:mergeArrays(cloud.sales,l.sales,e=>idOf(e,`${e?.date}|${e?.time}|${e?.employeeId}|${e?.amount}|${e?.note||''}`)),
      faces:Object.assign({},cloud.faces,l.faces),
      faceUpdatedAt:Object.assign({},cloud.faceUpdatedAt,l.faceUpdatedAt),
      dailyReports:Object.assign({},cloud.dailyReports,l.dailyReports),
      lastFaceCapture:l.lastFaceCapture||cloud.lastFaceCapture||null
    };
    if(isAdmin()){
      await Promise.all([
        db.doc('bigguys/public').set({employees:merged.employees,faces:merged.faces,faceUpdatedAt:merged.faceUpdatedAt,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true}),
        db.doc('bigguys/attendance').set({attendance:merged.attendance,lastFaceCapture:merged.lastFaceCapture,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true}),
        db.doc('bigguys/business').set({sales:merged.sales,dailyReports:merged.dailyReports,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true})
      ]);
    } else {
      await db.doc('bigguys/attendance').set({attendance:merged.attendance,lastFaceCapture:merged.lastFaceCapture,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
    }
    const fresh=await readCloud(); status({ready:true,status:'connected',lastSyncAt:new Date().toISOString(),lastSyncError:null}); return fresh;
  }

  async function saveEmployee(employee){
    await initFirebase(); if(!isAdmin())throw new Error('Admin authentication required.');
    const ref=db.doc('bigguys/public');
    await db.runTransaction(async tx=>{
      const snap=await tx.get(ref),d=snap.exists?snap.data()||{}:{};
      const employees=Array.isArray(d.employees)?d.employees.slice():[];
      const i=employees.findIndex(e=>String(e.id)===String(employee.id));
      if(i>=0)employees[i]={...employees[i],...employee,_updatedAt:new Date().toISOString()}; else employees.push({...employee,_updatedAt:new Date().toISOString()});
      tx.set(ref,{employees,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
    });
    return readCloud();
  }

  async function saveFaceEnrollment(employeeId,samples){
    await initFirebase(); if(!isAdmin())throw new Error('Admin authentication required.');
    if(!employeeId||!Array.isArray(samples)||samples.length<5)throw new Error('Invalid face enrollment data.');
    const ref=db.doc('bigguys/public'); const now=new Date().toISOString();
    await db.runTransaction(async tx=>{
      const snap=await tx.get(ref),d=snap.exists?(snap.data()||{}):{};
      const faces=d.faces&&typeof d.faces==='object'?{...d.faces}:{};
      const faceUpdatedAt=d.faceUpdatedAt&&typeof d.faceUpdatedAt==='object'?{...d.faceUpdatedAt}:{};
      faces[employeeId]=samples.map(x=>Array.from(x)); faceUpdatedAt[employeeId]=now;
      tx.set(ref,{faces,faceUpdatedAt,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
    });
    const fresh=await readCloud();
    if(!Array.isArray(fresh.faces?.[employeeId])||fresh.faces[employeeId].length<5)throw new Error('permission-denied: Firestore did not return the saved face enrollment.');
    return fresh;
  }

  async function saveSale(sale){
    await initFirebase(); if(!isAdmin())throw new Error('Admin authentication required.');
    const ref=db.doc('bigguys/business');
    await db.runTransaction(async tx=>{
      const snap=await tx.get(ref),d=snap.exists?(snap.data()||{}):{};
      const sales=Array.isArray(d.sales)?d.sales.slice():[];
      const i=sales.findIndex(x=>String(x.id)===String(sale.id));
      if(i>=0)sales[i]={...sales[i],...sale,_updatedAt:new Date().toISOString()}; else sales.push({...sale,_updatedAt:new Date().toISOString()});
      tx.set(ref,{sales,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
    });
    return readCloud();
  }

  async function saveAttendance(record,snapshot){
    await initFirebase();
    const ref=db.doc('bigguys/attendance');
    await db.runTransaction(async tx=>{
      const snap=await tx.get(ref),d=snap.exists?(snap.data()||{}):{};
      const attendance=Array.isArray(d.attendance)?d.attendance.slice():[];
      if(record){
        const i=attendance.findIndex(x=>String(x.id)===String(record.id));
        if(i>=0)attendance[i]={...attendance[i],...record,_updatedAt:new Date().toISOString()}; else attendance.push({...record,_updatedAt:new Date().toISOString()});
      }
      const patch={attendance,updatedAt:firebase.firestore.FieldValue.serverTimestamp()};
      if(snapshot)patch.lastFaceCapture=snapshot;
      tx.set(ref,patch,{merge:true});
    });
    return readCloud();
  }

  async function saveDailyReport(date,report){
    await initFirebase(); if(!isAdmin())throw new Error('Admin authentication required.');
    const ref=db.doc('bigguys/business');
    await db.runTransaction(async tx=>{
      const snap=await tx.get(ref),d=snap.exists?(snap.data()||{}):{};
      const reports=d.dailyReports&&typeof d.dailyReports==='object'?{...d.dailyReports}:{};
      reports[date]={...report,_updatedAt:new Date().toISOString()};
      tx.set(ref,{dailyReports:reports,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
    });
    return readCloud();
  }

  function startListeners(onRemote){
    const refs=[db.doc('bigguys/public'),db.doc('bigguys/attendance')]; if(isAdmin())refs.push(db.doc('bigguys/business'));
    const apply=async()=>{try{const next=await readCloud();window.__BIGGUYS_CURRENT_STATE=next;if(onRemote)onRemote(next);status({ready:true,status:'connected',lastSyncAt:new Date().toISOString(),lastSyncError:null});}catch(e){status({ready:true,status:'error',lastSyncError:e,error:e});}};
    refs.forEach(ref=>unsubscribers.push(ref.onSnapshot(apply,e=>status({ready:true,status:'error',lastSyncError:e,error:e}))));
  }
  function startCentralRefresh(onRemote){
    if(refreshTimer||!isAdmin())return;
    const refresh=async()=>{try{const next=await readCloud();window.__BIGGUYS_CURRENT_STATE=next;if(onRemote)onRemote(next);status({ready:true,status:'connected',lastSyncAt:new Date().toISOString(),lastSyncError:null});}catch(e){status({ready:true,status:'error',lastSyncError:e,error:e});}};
    refreshTimer=setInterval(refresh,5000); window.addEventListener('online',refresh); document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  }
  async function init(initial,onRemote,mode='dtr'){
    if(!configured){status({ready:false,status:'not-configured'});return false;}
    if(readyPromise)return readyPromise;
    readyPromise=(async()=>{try{await initFirebase();await ensureAuth(mode);let next=await readCloud();
      if(isAdmin()&&emptyState(next)&&!emptyState(clean(initial)))next=await migrateLocalIfCloudEmpty(initial);
      window.__BIGGUYS_CURRENT_STATE=next;if(onRemote)onRemote(next);startListeners(onRemote);startCentralRefresh(onRemote);status({ready:true,status:'connected',lastSyncAt:new Date().toISOString(),lastSyncError:null});return true;
    }catch(e){status({ready:false,status:'error',error:e,lastSyncError:e});console.error('Firebase initialization failed:',e);return false;}})();
    return readyPromise;
  }
  async function getAdminProfile(user){await initFirebase();const u=user||auth?.currentUser;if(!u||u.isAnonymous)throw new Error('Admin authentication required.');const s=await db.doc(`admins/${u.uid}`).get();if(!s.exists)throw new Error('Admin profile not found in Firestore.');const p=s.data()||{};if(p.role!=='admin'||p.active!==true)throw new Error('This Firebase account is not an active administrator.');return {uid:u.uid,...p};}
  async function adminLogin(email,password){await initFirebase();const user=(await auth.signInWithEmailAndPassword(email,password)).user;if(user.isAnonymous)throw new Error('Anonymous accounts cannot access the Admin Dashboard.');await getAdminProfile(user);readyPromise=null;unsubscribers.forEach(fn=>fn&&fn());unsubscribers=[];return user;}
  async function adminLogout(){if(refreshTimer){clearInterval(refreshTimer);refreshTimer=null;}unsubscribers.forEach(fn=>fn&&fn());unsubscribers=[];if(auth)await auth.signOut();readyPromise=null;window.__BIGGUYS_CURRENT_STATE=null;status({ready:false,status:'signed-out'});}
  window.BigGuysCloud={configured,isAdmin,ensureAuth,init,adminLogin,adminLogout,getAdminProfile,push:pushState,saveEmployee,saveFaceEnrollment,saveSale,saveAttendance,saveDailyReport,getStatus:()=>window.BIGGUYS_CLOUD||{configured,ready:false,status:'waiting'}};
  status({configured,ready:false,status:configured?'waiting':'not-configured'});
})();
