const KEY="bigguys_dtr_v2";
const MODEL_URLS=["https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights","https://justadudewhohacks.github.io/face-api.js/models"];
let state=JSON.parse(localStorage.getItem(KEY)||'{"employees":[],"attendance":[],"sales":[],"faces":{}}');
let stream=null, modelsReady=false, recognizedEmployee=null, scanning=false, validSince=0, captureBusy=false;
const $=id=>document.getElementById(id);
const save=()=>localStorage.setItem(KEY,JSON.stringify(state));
const today=()=>new Date().toISOString().slice(0,10);
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
 for(const employee of state.employees){
   const records=normalizeFaceRecords(state.faces[employee.id]);
   for(const stored of records){const d=faceDistance(Array.from(descriptor),stored);if(d<bestDistance){bestDistance=d;best=employee}}
 }
 return {employee:best,distance:bestDistance};
}
async function verifyFace(detection){
 const match=bestEmployee(detection.descriptor);
 // Slightly more tolerant than the old single-sample matcher, while still requiring a real enrolled match.
 if(match.employee&&match.distance<=.60){
   recognizedEmployee=match.employee;
   $("cameraStatus").textContent=`✓ ${match.employee.name} recognized — choose TIME IN or TIME OUT`;
   $("employeeName").textContent=match.employee.name;$("employeeId").textContent=match.employee.id;$("recognized").classList.remove("hidden");$("timeIn").disabled=false;$("timeOut").disabled=false;setOval("good");
 }else{resetRecognition(match.employee?`Face detected, but match is not strong enough (${match.distance.toFixed(2)}). Look straight at the camera.`:"Face captured, but this employee is not enrolled.");setOval("bad")}
}
async function scanLoop(){
 if(scanning||!modelsReady)return;scanning=true;
 try{
  const video=$("camera");
  if(video.readyState<2){$("cameraStatus").textContent="Starting live face scan…";return}
  const detection=await faceapi.detectSingleFace(video,new faceapi.TinyFaceDetectorOptions({inputSize:416,scoreThreshold:.45})).withFaceLandmarks(true).withFaceDescriptor();
  if(detection){
   if(faceIsInsideOval(detection)){
    setOval("good");
    if(!recognizedEmployee){
      if(!validSince)validSince=performance.now();
      const held=performance.now()-validSince;
      if(held>=1000&&!captureBusy){captureBusy=true;$("cameraStatus").textContent="✓ Face position correct — capturing and verifying…";await verifyFace(detection)}
      else if(!captureBusy){$("cameraStatus").textContent=`✓ Face position correct — automatic capture in ${Math.max(0,(1000-held)/1000).toFixed(1)}s`}
    }
   }else{validSince=0;captureBusy=false;if(!recognizedEmployee){setOval("bad");$("cameraStatus").textContent="🔴 Keep your face centered inside the red oval."}}
  }else{if(!recognizedEmployee){validSince=0;captureBusy=false;setOval("bad");$("cameraStatus").textContent="🔴 No clear face detected — place your face inside the oval."}}
 }catch(err){console.error("Face scan error:",err);if(!recognizedEmployee){setOval("bad");$("cameraStatus").textContent="Face scan is retrying…"}}
 finally{scanning=false;setTimeout(scanLoop,120)}
}
function record(type){
 if(!recognizedEmployee){$("result").innerHTML='<div class="result late-result">Face not recognized.</div>';return}
 const date=today(),now=timeNow();let attendance=state.attendance.find(a=>a.employeeId===recognizedEmployee.id&&a.date===date);
 if(type==="in"){
  if(attendance){$("result").innerHTML='<div class="result late-result">TIME IN is already recorded today.</div>';return}
  const diff=minutes(now)-minutes(recognizedEmployee.start),status=diff>0?"late":diff<0?"early":"ontime";attendance={date,employeeId:recognizedEmployee.id,clockIn:now,clockOut:null,status};state.attendance.push(attendance);save();
  const statusText=status==="late"?`🔴 LATE — ${diff} minutes late`:status==="early"?`🔵 EARLY — ${Math.abs(diff)} minutes early`:"ON TIME";
  $("result").innerHTML=`<div class="result ${status==="late"?"late-result":"success"}>✓ TIME IN RECORDED<br><br>${recognizedEmployee.name}<br>${now}<br><br>${statusText}</div>`;
 }else{
  if(!attendance){$("result").innerHTML='<div class="result late-result">TIME IN must be recorded first.</div>';return}
  if(attendance.clockOut){$("result").innerHTML='<div class="result late-result">TIME OUT is already recorded today.</div>';return}
  attendance.clockOut=now;save();$("result").innerHTML=`<div class="result success">✓ TIME OUT RECORDED<br><br>${recognizedEmployee.name}<br>${now}</div>`;
 }
}
$("timeIn").onclick=()=>record("in");$("timeOut").onclick=()=>record("out");window.addEventListener("beforeunload",()=>stream?.getTracks().forEach(t=>t.stop()));window.addEventListener("load",startCamera);
