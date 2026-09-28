const KEY="bigguys_dtr_v2";
const MODEL_URL="https://cdn.jsdelivr.net/gh/cgarciagl/face-api.js@0.22.2/weights";
let state=JSON.parse(localStorage.getItem(KEY)||'{"employees":[],"attendance":[],"sales":[],"faces":{}}');
let stream=null, modelsReady=false;
const $=id=>document.getElementById(id);
const save=()=>localStorage.setItem(KEY,JSON.stringify(state));
const today=()=>new Date().toISOString().slice(0,10);
const timeNow=()=>new Date().toTimeString().slice(0,5);
const minutes=t=>{const [h,m]=t.split(":").map(Number);return h*60+m};
const money=n=>"₱"+Number(n||0).toLocaleString("en-PH",{minimumFractionDigits:2,maximumFractionDigits:2});

function tick(){
 const now=new Date();
 $("liveTime").textContent=now.toLocaleTimeString("en-PH",{hour12:true});
 $("liveDate").textContent=now.toLocaleDateString("en-PH",{weekday:"long",year:"numeric",month:"long",day:"numeric"});
}
setInterval(tick,1000);tick();

async function loadModels(){
 if(modelsReady)return true;
 $("cameraStatus").textContent="Loading face recognition model…";
 try{
  await Promise.all([
   faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
   faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
   faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
  ]);
  modelsReady=true;
  $("cameraStatus").textContent="Face recognition ready.";
  return true;
 }catch(e){
  $("cameraStatus").textContent="Could not load face models. Check internet connection.";
  return false;
 }
}
$("startCamera").onclick=async()=>{
 if(!await loadModels())return;
 try{
  stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user",width:{ideal:720}},audio:false});
  $("camera").srcObject=stream;
  $("clockIn").disabled=false;
  $("cameraStatus").textContent="Camera ready — center your face.";
 }catch(e){$("cameraStatus").textContent="Camera permission denied or unavailable."}
};
function stopCamera(){if(stream)stream.getTracks().forEach(t=>t.stop());stream=null}
function distance(a,b){let s=0;for(let i=0;i<a.length;i++){const d=a[i]-b[i];s+=d*d}return Math.sqrt(s)}
function findEmployee(id){return state.employees.find(e=>e.id.toLowerCase()===id.toLowerCase())}
$("clockIn").onclick=async()=>{
 const id=$("employeeId").value.trim(), emp=findEmployee(id);
 if(!emp)return $("result").innerHTML='<div class="result late-result">Employee ID not found. Ask Admin to register you.</div>';
 if(!state.faces[emp.id])return $("result").innerHTML='<div class="result late-result">No face enrolled for this employee. Ask Admin to enroll your face.</div>';
 $("clockIn").disabled=true;
 const detection=await faceapi.detectSingleFace($("camera"),new faceapi.TinyFaceDetectorOptions({inputSize:320,scoreThreshold:.5})).withFaceLandmarks(true).withFaceDescriptor();
 if(!detection){$("result").innerHTML='<div class="result late-result">No clear face detected. Face the camera and try again.</div>';$("clockIn").disabled=false;return}
 const d=distance(Array.from(detection.descriptor),state.faces[emp.id]);
 if(d>.55){$("result").innerHTML='<div class="result late-result">Face not recognized. Please try again.</div>';$("clockIn").disabled=false;return}
 const date=today(), tm=timeNow();
 if(state.attendance.some(a=>a.employeeId===emp.id&&a.date===date)){ $("result").innerHTML='<div class="result success">You are already clocked in today.</div>';return; }
 const diff=minutes(tm)-minutes(emp.start), status=diff>0?"late":diff<0?"early":"ontime";
 state.attendance.push({date,employeeId:emp.id,clockIn:tm,clockOut:null,status});
 save();
 const label=status==="late"?`🔴 LATE — ${diff} minutes late`:status==="early"?`🔵 EARLY — ${Math.abs(diff)} minutes early`:`ON TIME`;
 $("result").innerHTML=`<div class="result ${status==="late"?"late-result":"success"}">✓ FACE RECOGNIZED<br><br>${emp.name} (${emp.id})<br>Scheduled: ${emp.start}<br>Clock In: ${tm}<br><br>${label}</div>`;
 stopCamera();
};
window.addEventListener("beforeunload",stopCamera);
