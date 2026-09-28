const ADMIN_EMAIL="bigguy@admin.com",ADMIN_PASSWORD="bigguyadmin123";
const KEY="bigguys_dtr_v2",MODEL_URLS=["https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights","https://justadudewhohacks.github.io/face-api.js/models"];
let state=JSON.parse(localStorage.getItem(KEY)||'{"employees":[],"attendance":[],"sales":[],"faces":{},"dailyReports":{}}');
state.employees=Array.isArray(state.employees)?state.employees:[];
state.attendance=Array.isArray(state.attendance)?state.attendance:[];
state.sales=Array.isArray(state.sales)?state.sales:[];
state.faces=state.faces&&typeof state.faces==="object"?state.faces:{};
state.dailyReports=state.dailyReports&&typeof state.dailyReports==="object"?state.dailyReports:{};
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
let enrollmentRunning=false,enrollmentSamples=[];
function normalizeFaceRecords(value){
 if(!value)return [];
 if(Array.isArray(value)&&value.length&&Array.isArray(value[0]))return value;
 if(Array.isArray(value))return [value];
 return [];
}
function averageDescriptor(samples){
 const len=samples[0].length,avg=new Array(len).fill(0);
 for(const sample of samples)for(let i=0;i<len;i++)avg[i]+=sample[i];
 for(let i=0;i<len;i++)avg[i]/=samples.length;
 return avg;
}
async function captureEnrollmentSample(id){
 const d=await faceapi.detectSingleFace($("enrollCamera"),new faceapi.TinyFaceDetectorOptions({inputSize:416,scoreThreshold:.45})).withFaceLandmarks(true).withFaceDescriptor();
 if(!d)return false;
 enrollmentSamples.push(Array.from(d.descriptor));
 $("enrollResult").innerHTML=`<div class="result success">Capturing face samples: <strong>${enrollmentSamples.length}/8</strong><br>Keep your face centered and make small natural movements.</div>`;
 return true;
}
async function runAutoEnrollment(){
 const id=$("enrollEmployee").value;if(!id||enrollmentRunning)return;
 enrollmentRunning=true;enrollmentSamples=[];$("enrollFace").disabled=true;
 $("enrollStatus").textContent="Automatic enrollment started — keep one face centered in the camera.";
 let attempts=0;
 while(enrollmentSamples.length<8&&attempts<80){
   attempts++;
   const ok=await captureEnrollmentSample(id);
   if(!ok)$("enrollStatus").textContent="🔴 Face not clear yet — center the face and improve lighting.";
   else $("enrollStatus").textContent=`🟢 Face detected — captured ${enrollmentSamples.length}/8 samples.`;
   await new Promise(r=>setTimeout(r,500));
 }
 if(enrollmentSamples.length>=5){
   state.faces[id]=enrollmentSamples;
   save();
   $("enrollStatus").textContent="✓ Face enrollment complete. 8 sample slots were collected when available.";
   $("enrollResult").innerHTML=`<div class="result success">✓ Employee face enrolled successfully.<br><small>${enrollmentSamples.length} face samples saved. The DTR can now recognize this employee automatically.</small></div>`;
   refresh();
 }else{
   $("enrollStatus").textContent="Enrollment failed — not enough clear face samples were captured. Try again with better lighting and keep the face centered.";
   $("enrollResult").innerHTML='<div class="result late-result">Could not capture enough clear samples. Please start the camera again and try once more.</div>';
 }
 enrollmentRunning=false;$("enrollFace").disabled=false;
}
$("startEnrollCamera").onclick=async()=>{if(!await loadModels())return;try{enrollStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user",width:{ideal:720},height:{ideal:720}},audio:false});$("enrollCamera").srcObject=enrollStream;$('enrollFace').disabled=false;$('enrollStatus').textContent="Camera ready — press ENROLL FACE to begin automatic multi-sample capture."}catch(e){$('enrollStatus').textContent="Camera permission denied or unavailable."}};
$("enrollFace").onclick=runAutoEnrollment;

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

function reportDates(){
 const dates=new Set();
 state.sales.forEach(s=>{if(s.date)dates.add(s.date)});
 Object.keys(state.dailyReports).forEach(d=>dates.add(d));
 return [...dates].sort().reverse();
}
function dailyFinancials(date){
 const totalSale=state.sales.filter(x=>x.date===date).reduce((t,x)=>t+Number(x.amount||0),0);
 const r=state.dailyReports[date]||{};
 const cash=Number(r.cash||0),expenses=Number(r.expenses||0),cashRemitted=Number(r.cashRemitted||0);
 const hasRemitted=r.cashRemitted!==undefined&&r.cashRemitted!==null&&r.cashRemitted!=="";
 const expected=totalSale-cash-expenses;
 const difference=hasRemitted?cashRemitted-expected:0;
 return {totalSale,cash,expenses,cashRemitted,expected,difference,short:difference<0?Math.abs(difference):0,over:difference>0?difference:0,hasRemitted};
}
function saveDailyReport(){
 const date=$("reportDate").value||today();
 const cash=Number($("reportCash").value||0),expenses=Number($("reportExpenses").value||0);
 const remittedValue=$("reportCashRemitted").value;
 state.dailyReports[date]={cash,expenses,cashRemitted:remittedValue===""?null:Number(remittedValue)};
 save();
 makeReport("daily");
}
function loadDailyReportInputs(){
 const date=$("reportDate").value||today(),r=state.dailyReports[date]||{};
 $("reportCash").value=r.cash??"";
 $("reportExpenses").value=r.expenses??"";
 $("reportCashRemitted").value=r.cashRemitted??"";
}
function periodRows(mode,selected){
 const prefix=mode==="yearly"?selected.slice(0,4):selected.slice(0,7);
 const periods=new Set();
 reportDates().forEach(date=>{if(date.startsWith(prefix))periods.add(mode==="yearly"?date.slice(0,4):date.slice(0,7))});
 return [...periods].sort().reverse();
}
function periodFinancials(mode,period){
 const dates=reportDates().filter(date=>mode==="yearly"?date.startsWith(period):date.startsWith(period));
 let totalSale=0,cash=0,expenses=0,cashRemitted=0,short=0,over=0,payroll=0,remittedCount=0;
 dates.forEach(date=>{
   const f=dailyFinancials(date); totalSale+=f.totalSale; cash+=f.cash; expenses+=f.expenses;
   if(f.hasRemitted){cashRemitted+=f.cashRemitted;remittedCount++;short+=f.short;over+=f.over;}
   const attendanceDates=state.attendance.filter(a=>a.date===date);
   state.employees.forEach(e=>{if(attendanceDates.some(a=>a.employeeId===e.id))payroll+=pay(e,date)});
 });
 return {totalSale,cash,expenses,cashRemitted,short,over,payroll,remittedCount,net:totalSale-expenses-payroll};
}
function makeReport(mode){
 const d=$("reportDate").value||today();
 $("reportDate").value=d;
 if(mode==="daily"){
   loadDailyReportInputs();
   const dates=reportDates();
   const rows=dates.map(date=>{const f=dailyFinancials(date);return [date,money(f.totalSale),money(f.cash),money(f.expenses),f.hasRemitted?money(f.cashRemitted):"—",f.hasRemitted&&f.short?money(f.short):"—",f.hasRemitted&&f.over?money(f.over):"—"]});
   $("reportOutput").innerHTML=`<div class="report-box"><h3>DAILY SALES REPORT</h3><p class="muted">Daily reconciliation based on the format provided: Total Sale, Cash, Expenses, Cash Remitted, Short, and Over.</p>${table(rows,["DATE","TOTAL SALE","CASH","EXPENSES","CASH REMITTED","SHORT","OVER"])}</div>`;
   return;
 }
 const prefix=mode==="yearly"?d.slice(0,4):d.slice(0,7);
 const periods=periodRows(mode,d);
 const rows=periods.map(period=>{const f=periodFinancials(mode,period);return [period,money(f.totalSale),money(f.cash),money(f.expenses),f.remittedCount?money(f.cashRemitted):"—",f.remittedCount&&f.short?money(f.short):"—",f.remittedCount&&f.over?money(f.over):"—",money(f.payroll),money(f.net)]});
 const empty=!rows.length?'<p class="muted">No sales or reconciliation records for the selected period.</p>':table(rows,[mode==="monthly"?"MONTH":"YEAR","TOTAL SALES","CASH","EXPENSES","CASH REMITTED","SHORT","OVER","PAYROLL","NET AFTER PAYROLL"]);
 $("reportOutput").innerHTML=`<div class="report-box"><h3>${mode.toUpperCase()} SALES REPORT</h3><p class="muted">${mode==="monthly"?`Monthly summary for ${prefix}`:`Yearly summary for ${prefix}`}</p>${empty}</div>`;
}
$("reportDate").value=today();
$("reportDate").addEventListener("change",loadDailyReportInputs);
$("saveDailyReport").onclick=saveDailyReport;

