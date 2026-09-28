const KEY="bigguys_dtr_v2";
const MODEL_URLS=["https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights","https://justadudewhohacks.github.io/face-api.js/models"];
let state=JSON.parse(localStorage.getItem(KEY)||'{"employees":[],"attendance":[],"sales":[],"faces":{}}');
let stream=null, modelsReady=false, recognizedEmployee=null, scanning=false, validSince=0, captureBusy=false;

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

function setOval(status){
 const oval=$("ovalFrame");
 oval.classList.remove("oval-red","oval-green");
 if(status==="good") oval.classList.add("oval-green");
 else if(status==="bad") oval.classList.add("oval-red");
}

function resetRecognition(message="Place your face inside the oval."){
 recognizedEmployee=null;
 validSince=0;
 captureBusy=false;
 $("cameraStatus").textContent=message;
 $("recognized").classList.add("hidden");
 $("timeIn").disabled=true;
 $("timeOut").disabled=true;
}

async function loadModels(){
 if(modelsReady)return true;
 if(typeof faceapi==="undefined"){
   $("cameraStatus").textContent="Face recognition library did not load. Refresh the page.";
   setOval("bad");
   return false;
 }
 $("cameraStatus").textContent="Loading face recognition…";
 for(const url of MODEL_URLS){
   try{
     await Promise.all([
       faceapi.nets.tinyFaceDetector.loadFromUri(url),
       faceapi.nets.faceLandmark68TinyNet.loadFromUri(url),
       faceapi.nets.faceRecognitionNet.loadFromUri(url)
     ]);
     modelsReady=true;
     $("cameraStatus").textContent="Camera ready — place your face inside the oval.";
     setOval("bad");
     return true;
   }catch(err){
     console.warn("Face model source failed:",url,err);
   }
 }
 $("cameraStatus").textContent="Face recognition model could not load. Check your internet connection and refresh.";
 setOval("bad");
 return false;
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
   setOval("bad");
   scanLoop();
 }catch(err){
   console.error(err);
   $("cameraStatus").textContent="Camera permission is required.";
   setOval("bad");
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

// Checks whether the detected face is reasonably centered and sized for the oval.
function faceIsInsideOval(detection){
 const video=$("camera");
 const w=video.videoWidth||720, h=video.videoHeight||720;
 const box=detection.detection.box;
 const cx=(box.x+box.width/2)/w;
 const cy=(box.y+box.height/2)/h;
 const rx=.20, ry=.36;
 const ellipse=((cx-.5)*(cx-.5))/(rx*rx)+((cy-.50)*(cy-.50))/(ry*ry);
 const faceHeight=box.height/h;
 const faceWidth=box.width/w;
 return ellipse<=1 && faceHeight>=.28 && faceHeight<=.78 && faceWidth>=.18 && faceWidth<=.70;
}

async function verifyFace(detection){
 let best=null,bestDistance=Infinity;
 for(const employee of state.employees){
   const descriptor=state.faces[employee.id];
   if(!descriptor)continue;
   const d=faceDistance(Array.from(detection.descriptor),descriptor);
   if(d<bestDistance){bestDistance=d;best=employee}
 }
 if(best && bestDistance<=.55){
   recognizedEmployee=best;
   $("cameraStatus").textContent="✓ Face recognized — ready for TIME IN / TIME OUT";
   $("employeeName").textContent=best.name;
   $("employeeId").textContent=best.id;
   $("recognized").classList.remove("hidden");
   $("timeIn").disabled=false;
   $("timeOut").disabled=false;
   setOval("good");
 }else{
   resetRecognition("Face captured, but employee is not enrolled.");
   setOval("bad");
 }
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
     if(faceIsInsideOval(detection)){
       setOval("good");
       if(!validSince) validSince=performance.now();
       const heldMs=performance.now()-validSince;
       if(heldMs>=800 && !captureBusy && !recognizedEmployee){
         captureBusy=true;
         $("cameraStatus").textContent="Capturing face…";
         await verifyFace(detection);
       }else if(!recognizedEmployee && !captureBusy){
         const remaining=Math.max(0,800-heldMs);
         $("cameraStatus").textContent=`Face position correct — capturing in ${(remaining/1000).toFixed(1)}s…`;
       }
     }else{
       validSince=0;
       captureBusy=false;
       setOval("bad");
       resetRecognition("Move your face inside the red oval.");
     }
   }else{
     resetRecognition("Place your face inside the red oval.");
     setOval("bad");
   }
 }catch(err){
   console.error("Face scan error:",err);
 }
 scanning=false;
 setTimeout(scanLoop,150);
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
