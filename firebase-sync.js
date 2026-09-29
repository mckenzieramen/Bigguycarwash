/* Big Guy's Carwash — Firebase central data bridge.
   Firestore is the central source of truth. localStorage is only an offline cache. */
(function(){
  const cfg=window.BIGGUYS_FIREBASE_CONFIG||{};
  const configured=!!(cfg.apiKey&&cfg.authDomain&&cfg.projectId&&cfg.appId);
  let db=null,auth=null,readyPromise=null,unsubscribers=[];

  const clean=s=>({
    employees:Array.isArray(s?.employees)?s.employees:[],
    attendance:Array.isArray(s?.attendance)?s.attendance:[],
    sales:Array.isArray(s?.sales)?s.sales:[],
    faces:s?.faces&&typeof s.faces==='object'?s.faces:{},
    dailyReports:s?.dailyReports&&typeof s.dailyReports==='object'?s.dailyReports:{},
    lastFaceCapture:s?.lastFaceCapture||null
  });
  const isAdmin=()=>!!(auth?.currentUser&&!auth.currentUser.isAnonymous);
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
  async function pushState(state){
    if(!db)throw new Error('Firebase Firestore is not initialized.');
    const s=clean(state);
    const publicRef=db.doc('bigguys/public');
    const attendanceRef=db.doc('bigguys/attendance');
    const businessRef=db.doc('bigguys/business');
    if(isAdmin()){
      await Promise.all([
        publicRef.set({employees:s.employees,faces:s.faces,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true}),
        attendanceRef.set({attendance:s.attendance,lastFaceCapture:s.lastFaceCapture,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true}),
        businessRef.set({sales:s.sales,dailyReports:s.dailyReports,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true})
      ]);
    }else{
      await attendanceRef.set({attendance:s.attendance,lastFaceCapture:s.lastFaceCapture,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
    }
    status({configured:true,ready:true,status:'connected',lastSyncAt:new Date().toISOString(),lastSyncError:null});
    return true;
  }
  async function readState(local,mode){
    const s=clean(local);
    const publicRef=db.doc('bigguys/public');
    const attendanceRef=db.doc('bigguys/attendance');
    const businessRef=db.doc('bigguys/business');
    const [ps,as,bs]=await Promise.all([
      publicRef.get(),attendanceRef.get(),isAdmin()?businessRef.get():Promise.resolve(null)
    ]);
    const pd=ps.exists?(ps.data()||{}):{};
    const ad=as.exists?(as.data()||{}):{};
    const bd=bs?.exists?(bs.data()||{}):{};
    return {
      employees:Array.isArray(pd.employees)?pd.employees:s.employees,
      faces:pd.faces&&typeof pd.faces==='object'?pd.faces:s.faces,
      attendance:Array.isArray(ad.attendance)?ad.attendance:s.attendance,
      lastFaceCapture:Object.prototype.hasOwnProperty.call(ad,'lastFaceCapture')?ad.lastFaceCapture:(s.lastFaceCapture||null),
      sales:Array.isArray(bd.sales)?bd.sales:s.sales,
      dailyReports:bd.dailyReports&&typeof bd.dailyReports==='object'?bd.dailyReports:s.dailyReports
    };
  }
  function startListeners(onRemote){
    const publicRef=db.doc('bigguys/public');
    const attendanceRef=db.doc('bigguys/attendance');
    const businessRef=db.doc('bigguys/business');
    const apply=async()=>{
      try{
        const next=await readState({},isAdmin()?'admin':'dtr');
        if(onRemote)onRemote(next);
        status({configured:true,ready:true,status:'connected',lastSyncAt:new Date().toISOString(),lastSyncError:null});
      }catch(err){
        console.warn('Firebase realtime read failed:',err);
        status({configured:true,ready:true,status:'error',lastSyncError:err});
      }
    };
    unsubscribers.push(publicRef.onSnapshot(apply,e=>console.warn('Public listener:',e)));
    unsubscribers.push(attendanceRef.onSnapshot(apply,e=>console.warn('Attendance listener:',e)));
    if(isAdmin())unsubscribers.push(businessRef.onSnapshot(apply,e=>console.warn('Business listener:',e)));
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
        const merged=await readState(initial,mode);
        if(onRemote)onRemote(merged);

        // Admin is allowed to seed/migrate the existing browser cache into Firebase.
        // This also creates the three Firestore documents even when the app is empty.
        if(isAdmin()){
          await pushState(merged);
        }else{
          const hasAttendance=merged.attendance.length||merged.lastFaceCapture;
          const attendanceSnap=await db.doc('bigguys/attendance').get();
          if(!attendanceSnap.exists&&hasAttendance){
            await db.doc('bigguys/attendance').set({attendance:merged.attendance,lastFaceCapture:merged.lastFaceCapture,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
          }
          status({configured:true,ready:true,status:'connected',lastSyncAt:new Date().toISOString(),lastSyncError:null});
        }
        startListeners(onRemote);
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
    if(profile.role!=='admin' || profile.active!==true)throw new Error('This Firebase account is not an active administrator.');
    return {uid:u.uid,...profile};
  }
  async function adminLogin(email,password){
    if(!configured)throw new Error('Firebase configuration is missing.');
    if(!window.firebase)throw new Error('Firebase SDK did not load.');
    if(!firebase.apps.length)firebase.initializeApp(cfg);
    auth=auth||firebase.auth();
    const user=(await auth.signInWithEmailAndPassword(email,password)).user;
    if(user.isAnonymous)throw new Error('Anonymous accounts cannot access the Admin Dashboard.');
    await getAdminProfile(user);
    readyPromise=null;
    unsubscribers.forEach(fn=>fn&&fn());unsubscribers=[];
    status({configured:true,ready:false,status:'authenticated',userEmail:user.email});
    return user;
  }
  async function adminLogout(){
    if(auth)await auth.signOut();
    readyPromise=null;unsubscribers.forEach(fn=>fn&&fn());unsubscribers=[];
    status({configured,ready:false,status:'signed-out',push:async()=>false});
  }
  window.BigGuysCloud={
    init,adminLogin,adminLogout,getAdminProfile,configured,isAdmin,ensureAuth,
    push:async state=>pushState(state),
    getStatus:()=>window.BIGGUYS_CLOUD||{configured,ready:false,status:'waiting'}
  };
  status({configured,ready:false,status:configured?'waiting':'not-configured'});
})();
