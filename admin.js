const ADMIN_EMAIL="bigguy@admin.com",ADMIN_PASSWORD="bigguyadmin123";
const KEY="bigguys_dtr_v2",MODEL_URLS=["https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights","https://justadudewhohacks.github.io/face-api.js/models"];
let state=JSON.parse(localStorage.getItem(KEY)||'{"employees":[],"attendance":[],"sales":[],"faces":{}}');
let enrollStream=null,modelsReady=false;
const $=id=>document.getElementById(id);
const save=()=>localStorage.setItem(KEY,JSON.stringify(state));
const today=()=>new Date().toISOString().slice(0,10);
const money=n=>"₱"+Number(n||0).toLocaleString("en-PH",{minimumFractionDigits:2,maximumFractionDigits:2});
const baseRate=t=>t==="full"?250:t==="semi"?200:150;
const commRate=s=>s==="late"?.35:s==="awol"?.30:.40;
function table(rows,heads){if(!rows.length)return'<p class="muted">No records yet.</p>';return`<table class="table"><thead><tr>${heads.map(h=>`<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`}
function pay(emp,date){const a=state.attendance.find(x=>x.employeeId===emp.id&&x.date===date);if(!a)return 0;const sales=state.sales.filter(x=>x.employeeId===emp.id&&x.date===date).reduce((t,x)=>t+x.amount,0);return Math.max(baseRate(emp.type),sales*commRate(a.status))}
function refresh(){
 const d=today(),ds=state.sales.filter(x=>x.date===d);
 $("salesTotal").textContent=money(ds.reduce((t,x)=>t+x.amount,0));$("salesCount").textContent=ds.length;
 $("presentCount").textContent=state.attendance.filter(x=>x.date===d).length;
 $("payrollTotal").textContent=money(state.employees.reduce((t,e)=>t+pay(e,d),0));
 $("overviewAttendance").innerHTML=table(state.employees.map(e=>{const a=state.attendance.find(x=>x.employeeId===e.id&&x.date===d);return[e.id,e.name,e.start,a?.clockIn||"—",a?.status||"AWOL",money(pay(e,d))]}),["ID","Employee","Scheduled","Clock In","Status","Pay"]);
 $("attendanceTable").innerHTML=table(state.employees.map(e=>{const a=state.attendance.find(x=>x.employeeId===e.id&&x.date===d);return[e.id,e.name,e.start,a?.clockIn||"—",a?.clockOut||"—",a?.status||"AWOL"]}),["ID","Employee","Scheduled","Clock In","Clock Out","Status"]);
 $("employeeTable").innerHTML=table(state.employees.map(e=>[e.id,e.name,e.type,e.start,money(baseRate(e.type)),state.faces[e.id]?"Enrolled":"Not enrolled",`<button class="delete-employee" data-id="${e.id}">DELETE</button>`]),["ID","Name","Type","Start","Base/Day","Face","Action"]);
 document.querySelectorAll(".delete-employee").forEach(btn=>btn.onclick=()=>deleteEmployee(btn.dataset.id));
 const opts=state.employees.map(e=>`<option value="${e.id}">${e.name} (${e.id})</option>`).join("");
 $("saleEmployee").innerHTML=opts;$("enrollEmployee").innerHTML=opts;
 $("salesTable").innerHTML=table(state.sales.slice().reverse().map(s=>[s.date,state.employees.find(e=>e.id===s.employeeId)?.name||s.employeeId,money(s.amount),s.note||"—"]),["Date","Employee","Amount","Service / Note"]);
 $("payrollTable").innerHTML=table(state.employees.map(e=>{const a=state.attendance.find(x=>x.employeeId===e.id&&x.date===d);const sales=state.sales.filter(x=>x.employeeId===e.id&&x.date===d).reduce((t,x)=>t+x.amount,0);return[e.name,e.type,a?.status||"AWOL",money(sales),a?((commRate(a.status)*100)+"%"):"30%",money(pay(e,d))]}),["Employee","Type","Status","Sales","Commission","Daily Pay"]);
}
async function loadModels(){
 if(modelsReady)return true;
 if(typeof faceapi==="undefined"){
   $("enrollStatus").textContent="Face recognition library did not load. Refresh the page.";
   return false;
 }
 $("enrollStatus").textContent="Loading face recognition model…";
 for(const url of MODEL_URLS){
   try{
     await Promise.all([
       faceapi.nets.tinyFaceDetector.loadFromUri(url),
       faceapi.nets.faceLandmark68TinyNet.loadFromUri(url),
       faceapi.nets.faceRecognitionNet.loadFromUri(url)
     ]);
     modelsReady=true;
     $("enrollStatus").textContent="Face recognition ready.";
     return true;
   }catch(e){ console.warn("Face model source failed:",url,e); }
 }
 $("enrollStatus").textContent="Could not load face models. Check your internet connection and refresh.";
 return false;
}
$("loginBtn").onclick=()=>{if($("adminEmail").value.trim()===ADMIN_EMAIL&&$("adminPassword").value===ADMIN_PASSWORD){$("adminLogin").classList.add("hidden");$("dashboard").classList.remove("hidden");refresh()}else $("loginError").textContent="Invalid admin email or password."};
$("logoutBtn").onclick=()=>{$("dashboard").classList.add("hidden");$("adminLogin").classList.remove("hidden");$("adminPassword").value=""};
$("employeeForm").onsubmit=e=>{e.preventDefault();const id=$("empId").value.trim();if(state.employees.some(x=>x.id===id))return alert("Employee ID already exists.");state.employees.push({id,name:$("empName").value.trim(),type:$("empType").value,start:$("empStart").value});save();e.target.reset();$("empStart").value="08:00";refresh()};
$("salesForm").onsubmit=e=>{e.preventDefault();state.sales.push({date:today(),employeeId:$("saleEmployee").value,amount:Number($("saleAmount").value),note:$("saleNote").value});save();e.target.reset();refresh()};
document.querySelectorAll(".tabs button").forEach(btn=>btn.onclick=()=>{document.querySelectorAll(".tabs button").forEach(x=>x.classList.remove("active"));btn.classList.add("active");document.querySelectorAll(".tab-panel").forEach(x=>x.classList.add("hidden"));$(btn.dataset.tab).classList.remove("hidden")});
$("startEnrollCamera").onclick=async()=>{if(!await loadModels())return;try{enrollStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user",width:{ideal:720}},audio:false});$("enrollCamera").srcObject=enrollStream;$("enrollFace").disabled=false;$("enrollStatus").textContent="Camera ready — center the employee's face."}catch(e){$("enrollStatus").textContent="Camera permission denied or unavailable."}};
$("enrollFace").onclick=async()=>{const id=$("enrollEmployee").value;if(!id)return;const d=await faceapi.detectSingleFace($("enrollCamera"),new faceapi.TinyFaceDetectorOptions({inputSize:320,scoreThreshold:.5})).withFaceLandmarks(true).withFaceDescriptor();if(!d){$("enrollResult").innerHTML='<div class="result late-result">No clear face detected. Try again.</div>';return}state.faces[id]=Array.from(d.descriptor);save();$("enrollResult").innerHTML='<div class="result success">✓ Face enrolled successfully for this employee.</div>';refresh()};

function deleteEmployee(id){
 const employee=state.employees.find(e=>e.id===id);
 if(!employee)return;
 const ok=confirm(`Delete employee ${employee.name} (${employee.id})?\n\nThis will also delete the employee's enrolled face, attendance records, and sales records from this browser.`);
 if(!ok)return;
 state.employees=state.employees.filter(e=>e.id!==id);
 state.attendance=state.attendance.filter(a=>a.employeeId!==id);
 state.sales=state.sales.filter(s=>s.employeeId!==id);
 delete state.faces[id];
 save();
 refresh();
}

function makeReport(mode){const d=$("reportDate").value||today(),prefix=mode==="yearly"?d.slice(0,4):mode==="monthly"?d.slice(0,7):d,m=x=>mode==="yearly"?x.date.startsWith(prefix):mode==="monthly"?x.date.startsWith(prefix):x.date===prefix,sales=state.sales.filter(m).reduce((t,x)=>t+x.amount,0);let payroll=0;[...new Set(state.attendance.filter(m).map(x=>x.date))].forEach(day=>state.employees.forEach(e=>payroll+=pay(e,day)));$("reportOutput").innerHTML=`<div class="report-box"><h3>${mode.toUpperCase()} REPORT</h3><p>Total Sales: <strong>${money(sales)}</strong></p><p>Total Payroll: <strong>${money(payroll)}</strong></p><p>Net before other expenses: <strong>${money(sales-payroll)}</strong></p></div>`}
