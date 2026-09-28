const KEY="bigguys_dtr_v2";
const MODEL_URL="https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights";
let state=JSON.parse(localStorage.getItem(KEY)||'{"employees":[],"attendance":[],"sales":[],"faces":{}}');
let stream=null, modelsReady=false, recognizedEmployee=null, scanning=false;

const $=id=>document.getElementById(id);
const save=()=>localStorage.setItem(KEY,JSON.stringify(state));
const today=()=>new Date().toISOString().slice(0,10);
const timeNow=()=>new Date().toTimeString().slice(0,5);
const minutes=t=>{const [h,m]=t.split(":").map(Number);return h*60+m};

function tick(){
 const n=new Date();
 $("liveTime").textContent=n.toLocaleTimeString("en-PH",{hour12:true});
 $("liveDate").textContent=n.toLocaleDateString("en-PH",{weekday:"long",year:"numeric",month:"long",day:"numeric"});
}
setInterval(tick,1000); tick();

async function loadModels(){
 if(modelsReady)return true;
 $("cameraStatus").textContent="Loading face recognition…";
 try{
   await Promise.all([
     faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
     faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
     faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
   ]);
   modelsReady=true;
   return true;
 }catch(err){
   console.error("Face model error:",err);
   $("cameraStatus").textContent="Face model failed to load. Refresh the page and try again.";
   return false;
 }
}

async function startCamera(){
 if(!await loadModels())return;
 try{
   stream=await navigator.mediaDevices.getUserMedia({
     video:{facingMode:"user",width:{ideal:720},height:{ideal:720}},
     audio:false
   });
   $("camera").srcObject=stream;
   $("cameraStatus").textContent="Camera ready — place your face inside the oval.";
   scanLoop();
 }catch(err){
   console.error(err);
   $("cameraStatus").textContent="Camera permission is required.";
 }
}

function faceDistance(a,b){
 let sum=0;
 for(let i=0;i<a.length;i++){
   const d=a[i]-b[i];
   sum+=d*d;
 }
 return Math.sqrt(sum);
}

async function scanLoop(){
 if(scanning||!modelsReady)return;
 scanning=true;
 try{
   const detection=await faceapi.detectSingleFace(
     $("camera"),
     new faceapi.TinyFaceDetectorOptions({inputSize:320,scoreThreshold:.5})
   ).withFaceLandmarks(true).withFaceDescriptor();

   if(detection){
     let best=null,bestDistance=Infinity;
     for(const employee of state.employees){
       const descriptor=state.faces[employee.id];
       if(!descriptor)continue;
       const d=faceDistance(Array.from(detection.descriptor),descriptor);
       if(d<bestDistance){bestDistance=d;best=employee}
     }

     if(best && bestDistance<=.55){
       recognizedEmployee=best;
       $("cameraStatus").textContent="✓ Face recognized";
       $("employeeName").textContent=best.name;
       $("employeeId").textContent=best.id;
       $("recognized").classList.remove("hidden");
       $("timeIn").disabled=false;
       $("timeOut").disabled=false;
     }else{
       recognizedEmployee=null;
       $("cameraStatus").textContent="Face detected — not enrolled.";
       $("recognized").classList.add("hidden");
       $("timeIn").disabled=true;
       $("timeOut").disabled=true;
     }
   }else{
     recognizedEmployee=null;
     $("cameraStatus").textContent="Place your face inside the oval.";
     $("recognized").classList.add("hidden");
     $("timeIn").disabled=true;
     $("timeOut").disabled=true;
   }
 }catch(err){
   console.error("Face scan error:",err);
 }
 scanning=false;
 setTimeout(scanLoop,500);
}

function record(type){
 if(!recognizedEmployee){
   $("result").innerHTML='<div class="result late-result">Face not recognized.</div>';
   return;
 }
 const date=today(),now=timeNow();
 let attendance=state.attendance.find(a=>a.employeeId===recognizedEmployee.id&&a.date===date);

 if(type==="in"){
   if(attendance){
     $("result").innerHTML='<div class="result late-result">TIME IN is already recorded today.</div>';
     return;
   }

   const diff=minutes(now)-minutes(recognizedEmployee.start);
   const status=diff>0?"late":diff<0?"early":"ontime";
   attendance={date,employeeId:recognizedEmployee.id,clockIn:now,clockOut:null,status};
   state.attendance.push(attendance);
   save();

   const statusText=status==="late"
     ? `🔴 LATE — ${diff} minutes late`
     : status==="early"
     ? `🔵 EARLY — ${Math.abs(diff)} minutes early`
     : "ON TIME";

   $("result").innerHTML=`<div class="result ${status==="late"?"late-result":"success"}">
     ✓ TIME IN RECORDED<br><br>
     ${recognizedEmployee.name}<br>
     ${now}<br><br>${statusText}
   </div>`;
 }else{
   if(!attendance){
     $("result").innerHTML='<div class="result late-result">TIME IN must be recorded first.</div>';
     return;
   }
   if(attendance.clockOut){
     $("result").innerHTML='<div class="result late-result">TIME OUT is already recorded today.</div>';
     return;
   }
   attendance.clockOut=now;
   save();
   $("result").innerHTML=`<div class="result success">
     ✓ TIME OUT RECORDED<br><br>
     ${recognizedEmployee.name}<br>
     ${now}
   </div>`;
 }
}

$("timeIn").onclick=()=>record("in");
$("timeOut").onclick=()=>record("out");
window.addEventListener("beforeunload",()=>stream?.getTracks().forEach(t=>t.stop()));

window.addEventListener("load",startCamera);
