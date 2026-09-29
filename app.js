const KEY="bigguys_dtr_v2";
const MODEL_URLS=["https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights","https://justadudewhohacks.github.io/face-api.js/models"];
let state=JSON.parse(localStorage.getItem(KEY)||'{"employees":[],"attendance":[],"sales":[],"faces":{}}');
let stream=null, modelsReady=false, recognizedEmployee=null, scanning=false, validSince=0, captureBusy=false;
const $=id=>document.getElementById(id);
const cacheState=()=>{const c={...state,faces:{},lastFaceCapture:null};try{localStorage.setItem(KEY,JSON.stringify(c));}catch(e){console.warn("Local cache skipped:",e);}};
const save=()=>{cacheState(); if(window.BIGGUYS_CLOUD?.ready) window.BigGuysCloud.push(state).catch(console.warn);};
const LAST_CAPTURE_KEY="bigguys_last_face_capture";
const CAPTURE_HOLD_MS=500;
let attendanceCooldownUntil=0;
const today=()=>{const n=new Date();const y=n.getFullYear(),m=String(n.getMonth()+1).padStart(2,"0"),d=String(n.getDate()).padStart(2,"0");return `${y}-${m}-${d}`};
const timeNow=()=>new Date().toTimeString().slice(0,5);
const minutes=t=>{const [h,m]=t.split(":").map(Number);return h*60+m};
function tick(){const n=new Date();$("liveTime").textContent=n.toLocaleTimeString("en-PH",{hour12:true});$("liveDate").textContent=n.toLocaleDateString("en-PH",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}
setInterval(tick,1000);tick();
function setOval(status){const oval=$("ovalFrame");oval.classList.remove("oval-red","oval-green");oval.classList.add(status==="good"?"oval-green":"oval-red")}
function resetRecognition(message="Place your face inside the oval."){recognizedEmployee=null;validSince=0;captureBusy=false;$("cameraStatus").textContent=message;$("recognized").classList.add("hidden");$("timeIn").disabled=true;$("timeOut").disabled=true}
async function loadModels(){
 if(modelsReady)return true;
 if(typeof faceapi==="undefined"){$("cameraStatus").textContent="Face recognition library did not load. Refresh the page.";setOval("bad");return false}
 $("cameraStatus").textContent="Loading face recognition…";
 for(const url of MODEL_URLS){try{await Promise.all([faceapi.nets.tinyFaceDetector.loadFromUri(url),faceapi.nets.faceLandmark68TinyNet.loadFromUri(url),faceapi.nets.faceRecognitionNet.loadFromUri(url)]);modelsReady=true;return true}catch(err){console.warn("Face model source failed:",url,err)}}
 $("cameraStatus").textContent="Face recognition model could not load. Check your internet connection and refresh.";setOval("bad");return false;
}
async function startCamera(){
 if(!await loadModels())return;
 try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user",width:{ideal:720},height:{ideal:720}},audio:false});$("camera").srcObject=stream;$("cameraStatus").textContent="Scanning live — place one face inside the red oval.";setOval("bad");scanLoop()}catch(err){console.error(err);$("cameraStatus").textContent="Camera permission is required.";setOval("bad")}
}
function normalizeFaceRecords(value){
 if(!value)return [];
 if(Array.isArray(value)&&value.length&&Array.isArray(value[0]))return value;
 if(Array.isArray(value)&&value.length&&value.every(x=>x&&typeof x==="object"&&Array.isArray(x.values)))return value.map(x=>x.values);
 if(Array.isArray(value))return [value];
 return [];
}
function faceDistance(a,b){let sum=0;for(let i=0;i<a.length;i++){const d=a[i]-b[i];sum+=d*d}return Math.sqrt(sum)}
function faceIsInsideOval(d){
 const video=$("camera"),w=video.videoWidth||720,h=video.videoHeight||720,box=d.detection.box;
 const cx=(box.x+box.width/2)/w,cy=(box.y+box.height/2)/h;
 const rx=.23,ry=.40,ellipse=((cx-.5)**2)/(rx**2)+((cy-.50)**2)/(ry**2);
 const faceHeight=box.height/h,faceWidth=box.width/w;
 return ellipse<=1&&faceHeight>=.22&&faceHeight<=.82&&faceWidth>=.14&&faceWidth<=.72;
}
function bestEmployee(descriptor){
 let best=null,bestDistance=Infinity;
 const employeesById=new Map((state.employees||[]).map(e=>[String(e?.id),e]));
 const faceEntries=Object.entries(state.faces||{});
 for(const [faceEmployeeId,rawRecords] of faceEntries){
   const employee=employeesById.get(String(faceEmployeeId));
   if(!employee)continue;
   const records=normalizeFaceRecords(rawRecords);
   for(const stored of records){
     if(!Array.isArray(stored)||stored.length!==128)continue;
     const d=faceDistance(Array.from(descriptor),stored);
     if(d<bestDistance){bestDistance=d;best=employee;}
   }
 }
 return {employee:best,distance:bestDistance};
}
function saveFaceSnapshot(employee,detection){
 try{
  const video=$("camera"),oval=$("ovalFrame");
  const vr=video.getBoundingClientRect(),or=oval.getBoundingClientRect();
  const vw=video.videoWidth||720,vh=video.videoHeight||720,dw=vr.width||video.clientWidth||720,dh=vr.height||video.clientHeight||430;
  const scale=Math.max(dw/vw,dh/vh),rw=vw*scale,rh=vh*scale,ox=(dw-rw)/2,oy=(dh-rh)/2;
  const x=or.left-vr.left,y=or.top-vr.top,w=or.width,h=or.height;
  const sx=Math.max(0,(x-ox)/scale),sy=Math.max(0,(y-oy)/scale),ex=Math.min(vw,(x+w-ox)/scale),ey=Math.min(vh,(y+h-oy)/scale);
  const sw=Math.max(1,ex-sx),sh=Math.max(1,ey-sy),canvas=document.createElement("canvas");
  canvas.width=360;canvas.height=Math.max(420,Math.round(360*sh/sw));
  const ctx=canvas.getContext("2d");ctx.save();ctx.translate(canvas.width,0);ctx.scale(-1,1);ctx.drawImage(video,sx,sy,sw,sh,0,0,canvas.width,canvas.height);ctx.restore();
  const snap={employeeId:employee.id,name:employee.name,dataUrl:canvas.toDataURL("image/jpeg",.88),capturedAt:new Date().toISOString()}; localStorage.setItem(LAST_CAPTURE_KEY,JSON.stringify(snap)); state.lastFaceCapture=snap; if(window.BigGuysCloud?.saveAttendance){ window.BigGuysCloud.saveAttendance({employeeId:employee.id,date:today(),clockIn:null,clockOut:null,status:'snapshot'},snap).catch(console.warn); }
 }catch(err){console.warn("Could not save face snapshot",err)}
}
async function verifyFace(detection){
 const match=bestEmployee(detection.descriptor);
 if(match.employee&&match.distance<=.60){
   recognizedEmployee=match.employee;
   saveFaceSnapshot(match.employee,detection);
   $("cameraStatus").textContent=`✓ ${match.employee.name} recognized — choose TIME IN or TIME OUT`;
   $("employeeName").textContent=match.employee.name;$("employeeId").textContent=match.employee.id;$("recognized").classList.remove("hidden");$("timeIn").disabled=false;$("timeOut").disabled=false;setOval("good");
 }else{resetRecognition(match.employee?`Face detected, but match is not strong enough (${match.distance.toFixed(2)}). Look straight at the camera.`:"Face captured, but this employee is not enrolled.");setOval("bad")}
}
async function scanLoop(){
 if(scanning||!modelsReady)return;scanning=true;
 try{
  const video=$("camera");
  if(video.readyState<2){$("cameraStatus").textContent="Starting live face scan…";return}
  if(performance.now()<attendanceCooldownUntil){
    setOval("bad");
    $("cameraStatus").textContent="🔴 Ready — place the next face inside the oval.";
    return;
  }
  const detection=await faceapi.detectSingleFace(video,new faceapi.TinyFaceDetectorOptions({inputSize:416,scoreThreshold:.45})).withFaceLandmarks(true).withFaceDescriptor();
  if(detection){
   if(faceIsInsideOval(detection)){
    setOval("good");
    if(!recognizedEmployee){
      if(!validSince)validSince=performance.now();
      const held=performance.now()-validSince;
      if(held>=CAPTURE_HOLD_MS&&!captureBusy){
        captureBusy=true;
        $("cameraStatus").textContent="✓ Face position correct — capturing and verifying…";
        await verifyFace(detection);
      }else if(!captureBusy){
        $("cameraStatus").textContent=`✓ Face position correct — automatic capture in ${Math.max(0,(CAPTURE_HOLD_MS-held)/1000).toFixed(1)}s`;
      }
    }
   }else{
    validSince=0;captureBusy=false;
    if(!recognizedEmployee){setOval("bad");$("cameraStatus").textContent="🔴 Keep your face centered inside the red oval."}
   }
  }else{
   if(!recognizedEmployee){validSince=0;captureBusy=false;setOval("bad");$("cameraStatus").textContent="🔴 No clear face detected — place your face inside the oval."}
  }
 }catch(err){
  console.error("Face scan error:",err);
  if(!recognizedEmployee){setOval("bad");$("cameraStatus").textContent="Face scan is retrying…"}
 }finally{scanning=false;setTimeout(scanLoop,120)}
}
function clearAfterAttendance(message){
 recognizedEmployee=null;
 validSince=0;
 captureBusy=false;
 attendanceCooldownUntil=performance.now()+900;
 $("recognized").classList.add("hidden");
 $("timeIn").disabled=true;
 $("timeOut").disabled=true;
 setOval("bad");
 $("cameraStatus").textContent=message||"🔴 Ready — place the next face inside the oval.";
}
function record(type){
 if(!recognizedEmployee){$("result").innerHTML='<div class="result late-result">Face not recognized.</div>';return}
 const employee=recognizedEmployee;
 const date=today(),now=timeNow();
 let attendance=state.attendance.find(a=>a.employeeId===employee.id&&a.date===date);
 if(type==="in"){
  if(attendance){
   $("result").innerHTML='<div class="result late-result">TIME IN is already recorded today.</div>';
   clearAfterAttendance("🔴 Ready — place the next face inside the oval.");
   return;
  }
  const diff=minutes(now)-minutes(employee.start),status=diff>0?"late":diff<0?"early":"ontime";
  attendance={id:(crypto.randomUUID?crypto.randomUUID():`att_${Date.now()}_${Math.random().toString(36).slice(2)}`),date,employeeId:employee.id,clockIn:now,clockOut:null,status};
  state.attendance.push(attendance);
  if(window.BigGuysCloud?.saveAttendance){ window.BigGuysCloud.saveAttendance(attendance).then(next=>{state=next;cacheState();}).catch(err=>console.warn('Central attendance save failed:',err)); } else save();
  const statusText=status==="late"?`🔴 LATE — ${diff} minutes late`:status==="early"?`🔵 EARLY — ${Math.abs(diff)} minutes early`:"ON TIME";
  $("result").innerHTML=`<div class="result ${status==="late"?"late-result":"success"}>✓ TIME IN RECORDED<br><br>${employee.name}<br>${now}<br><br>${statusText}</div>`;
 }else{
  if(!attendance){
   $("result").innerHTML='<div class="result late-result">TIME IN must be recorded first.</div>';
   clearAfterAttendance("🔴 Ready — place the next face inside the oval.");
   return;
  }
  if(attendance.clockOut){
   $("result").innerHTML='<div class="result late-result">TIME OUT is already recorded today.</div>';
   clearAfterAttendance("🔴 Ready — place the next face inside the oval.");
   return;
  }
  attendance.clockOut=now;
  if(window.BigGuysCloud?.saveAttendance){ window.BigGuysCloud.saveAttendance(attendance).then(next=>{state=next;cacheState();}).catch(err=>console.warn('Central attendance save failed:',err)); } else save();
  $("result").innerHTML=`<div class="result success">✓ TIME OUT RECORDED<br><br>${employee.name}<br>${now}</div>`;
 }
 clearAfterAttendance("🔴 Attendance saved — scanning for the next employee…");
}
$("timeIn").onclick=()=>record("in");$("timeOut").onclick=()=>record("out");async function initCloud(){
 if(!window.BigGuysCloud)return false;
 const ok=await window.BigGuysCloud.init(state,remote=>{ state=remote; cacheState(); });
 if(!ok){
   $("cameraStatus").textContent="Firebase face records could not be loaded. Check your connection and try again.";
   setOval("bad");
   return false;
 }
 try{
   // Always fetch a fresh cloud state immediately before starting the scanner.
   // This prevents an empty/stale local cache from making an enrolled employee
   // appear as "not enrolled" on another device.
   if(window.BigGuysCloud.refresh){ state=await window.BigGuysCloud.refresh(); cacheState(); }
 }catch(err){
   console.error("Fresh face-record sync failed:",err);
   $("cameraStatus").textContent="Could not load enrolled face records from Firebase.";
   setOval("bad");
   return false;
 }
 return true;
}
window.addEventListener("beforeunload",()=>stream?.getTracks().forEach(t=>t.stop()));
window.addEventListener("load",async()=>{if(await initCloud())startCamera();});
