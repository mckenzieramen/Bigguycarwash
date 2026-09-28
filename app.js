const KEY="bigguys_dtr_v2";
const MODEL_URL="https://cdn.jsdelivr.net/gh/cgarciagl/face-api.js@0.22.2/weights";
let state=JSON.parse(localStorage.getItem(KEY)||'{"employees":[],"attendance":[],"sales":[],"faces":{}}');
let stream=null, ready=false, recognizedEmployee=null, scanning=false;
const $=id=>document.getElementById(id);
const save=()=>localStorage.setItem(KEY,JSON.stringify(state));
const today=()=>new Date().toISOString().slice(0,10);
const timeNow=()=>new Date().toTimeString().slice(0,5);
const minutes=t=>{const [h,m]=t.split(":").map(Number);return h*60+m};

function clock(){
 const n=new Date();
 $("liveTime").textContent=n.toLocaleTimeString("en-PH",{hour12:true});
 $("liveDate").textContent=n.toLocaleDateString("en-PH",{weekday:"long",year:"numeric",month:"long",day:"numeric"});
}
setInterval(clock,1000); clock();

async function loadModels(){
 if(ready)return true;
 $("cameraStatus").textContent="Loading face recognition…";
 try{
  await Promise.all([
   faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
   faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
   faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
  ]);
  ready=true;
  return true;
 }catch(e){
  $("cameraStatus").textContent="Face recognition model could not load.";
  return false;
 }
}
async function start(){
 if(!await loadModels())return;
 try{
  stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user",width:{ideal:720}},audio:false});
  $("camera").srcObject=stream;
  $("cameraStatus").textContent="Camera ready — look at the camera.";
  $("timeIn").disabled=false; $("timeOut").disabled=false;
  scan();
 }catch(e){$("cameraStatus").textContent="Camera permission is required."}
}
async function scan(){
 if(scanning||!ready)return;
 scanning=true;
 try{
  const d=await faceapi.detectSingleFace($("camera"),new faceapi.TinyFaceDetectorOptions({inputSize:320,scoreThreshold:.5}))
   .withFaceLandmarks(true).withFaceDescriptor();
  if(d){
   let best=null,bestDist=Infinity;
   for(const e of state.employees){
    const saved=state.faces[e.id];
    if(!saved)continue;
    let sum=0;
    for(let i=0;i<saved.length;i++){const x=d.descriptor[i]-saved[i];sum+=x*x}
    const dist=Math.sqrt(sum);
    if(dist<bestDist){bestDist=dist;best=e}
   }
   if(best && bestDist<=.55){
    recognizedEmployee=best;
    $("cameraStatus").textContent=`Face recognized — ${best.name}`;
   }else{
    recognizedEmployee=null;
    $("cameraStatus").textContent="Face detected — not enrolled.";
   }
  }else{
   recognizedEmployee=null;
   $("cameraStatus").textContent="Look at the camera.";
  }
 }finally{scanning=false;setTimeout(scan,700)}
}
function record(kind){
 if(!recognizedEmployee){
  $("result").innerHTML='<div class="result late-result">Face not recognized. Please face the camera.</div>';return;
 }
 const date=today(), now=timeNow();
 let a=state.attendance.find(x=>x.employeeId===recognizedEmployee.id&&x.date===date);
 if(kind==="in"){
  if(a){$("result").innerHTML='<div class="result late-result">Time In is already recorded for today.</div>';return}
  const diff=minutes(now)-minutes(recognizedEmployee.start);
  const status=diff>0?"late":diff<0?"early":"ontime";
  a={date,employeeId:recognizedEmployee.id,clockIn:now,clockOut:null,status};
  state.attendance.push(a); save();
  const msg=status==="late"?`🔴 LATE — ${diff} minutes late`:status==="early"?`🔵 EARLY — ${Math.abs(diff)} minutes early`:"ON TIME";
  $("result").innerHTML=`<div class="result ${status==="late"?"late-result":"success"}">✓ TIME IN RECORDED<br><br>${recognizedEmployee.name}<br>${now}<br>${msg}</div>`;
 }else{
  if(!a){$("result").innerHTML='<div class="result late-result">Time In must be recorded first.</div>';return}
  if(a.clockOut){$("result").innerHTML='<div class="result late-result">Time Out is already recorded for today.</div>';return}
  a.clockOut=now; save();
  $("result").innerHTML=`<div class="result success">✓ TIME OUT RECORDED<br><br>${recognizedEmployee.name}<br>${now}</div>`;
 }
}
$("timeIn").onclick=()=>record("in");
$("timeOut").onclick=()=>record("out");
start();
window.addEventListener("beforeunload",()=>stream?.getTracks().forEach(t=>t.stop()));
