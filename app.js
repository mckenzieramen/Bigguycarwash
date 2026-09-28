const ADMIN_EMAIL="bigguy@admin.com", ADMIN_PASSWORD="bigguyadmin123";
const KEY="bigguys_dtr_v1";
const state=JSON.parse(localStorage.getItem(KEY)||'{"employees":[],"attendance":[],"sales":[]}');
const save=()=>localStorage.setItem(KEY,JSON.stringify(state));
const $=id=>document.getElementById(id);
const money=n=>"₱"+Number(n||0).toLocaleString("en-PH",{minimumFractionDigits:2,maximumFractionDigits:2});
const today=()=>new Date().toISOString().slice(0,10);
function show(id){["loginView","adminLoginView","bioView","employeeHome","adminView"].forEach(x=>$(x).classList.add("hidden"));$(id).classList.remove("hidden")}
$("showAdmin").onclick=()=>show("adminLoginView"); $("backLogin").onclick=()=>show("loginView");
$("adminLogin").onclick=()=>{if($("adminEmail").value===ADMIN_EMAIL&&$("adminPassword").value===ADMIN_PASSWORD){show("adminView");renderAll()}else alert("Invalid admin login.")};
$("adminLogout").onclick=()=>show("loginView");
$("employeeLogin").onclick=()=>{let id=$("employeeId").value.trim();let e=state.employees.find(x=>x.id===id);if(!e)return alert("Employee ID not found. Ask Admin to register you.");window.currentEmployee=e; $("bioEmployee").textContent=e.name+" ("+e.id+")"; show("bioView"); startCamera()};
$("cancelBio").onclick=()=>{stopCamera();show("loginView")};
let stream=null;
async function startCamera(){try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user"},audio:false});$("video").srcObject=stream;$("bioMessage").textContent="Camera ready. For this starter build, face verification is a placeholder until employee face enrollment is connected."}catch(e){$("bioMessage").textContent="Camera access failed. Allow camera permission and use HTTPS or localhost."}}
function stopCamera(){if(stream)stream.getTracks().forEach(t=>t.stop());stream=null}
$("verifyFace").onclick=()=>{if(!window.currentEmployee)return; stopCamera(); clockIn(window.currentEmployee); show("employeeHome"); renderEmployeeHome()};
function timeNow(){return new Date().toTimeString().slice(0,5)}
function minutes(t){let [h,m]=t.split(":").map(Number);return h*60+m}
function clockIn(e){let d=today(),tm=timeNow(), existing=state.attendance.find(a=>a.date===d&&a.employeeId===e.id);if(existing){alert("Already clocked in today.");return}let diff=minutes(tm)-minutes(e.start);let status=diff>0?"late":(diff<0?"early":"ontime");state.attendance.push({date:d,employeeId:e.id,clockIn:tm,clockOut:null,status});save()}
$("clockOut").onclick=()=>{let a=state.attendance.find(x=>x.date===today()&&x.employeeId===window.currentEmployee.id);if(a){a.clockOut=timeNow();save();alert("Clock out recorded.");renderEmployeeHome()}};
function renderEmployeeHome(){let a=state.attendance.find(x=>x.date===today()&&x.employeeId===window.currentEmployee.id);let cls=a.status==="late"?"late":a.status==="early"?"early":"ontime";$("attendanceResult").innerHTML=`<div class="status ${cls}">${a.status.toUpperCase()} — Clock in ${a.clockIn}<br>Scheduled: ${window.currentEmployee.start}</div>`}
$("employeeForm").onsubmit=e=>{e.preventDefault();let id=$("empId").value.trim();if(state.employees.some(x=>x.id===id))return alert("Employee ID already exists.");state.employees.push({id,name:$("empName").value.trim(),type:$("empType").value,start:$("empStart").value});save();e.target.reset();renderAll()};
$("salesForm").onsubmit=e=>{e.preventDefault();state.sales.push({date:today(),employeeId:$("saleEmployee").value,amount:Number($("saleAmount").value),note:$("saleNote").value});save();e.target.reset();renderAll()};
function baseRate(type){return type==="full"?250:type==="semi"?200:150}
function commRate(status){return status==="late"?.35:status==="awol"?.30:.40}
function dailyPay(emp,date){let a=state.attendance.find(x=>x.employeeId===emp.id&&x.date===date);if(!a)return 0;let sales=state.sales.filter(s=>s.employeeId===emp.id&&s.date===date).reduce((t,s)=>t+s.amount,0);return Math.max(baseRate(emp.type),sales*commRate(a.status))}
function renderAll(){renderStats();renderEmployees();renderSales();renderToday();populateSaleEmployees()}
function renderStats(){let d=today();$("todaySales").textContent=money(state.sales.filter(s=>s.date===d).reduce((t,s)=>t+s.amount,0));$("presentToday").textContent=state.attendance.filter(a=>a.date===d).length;$("todayPayroll").textContent=money(state.employees.reduce((t,e)=>t+dailyPay(e,d),0));$("employeeCount").textContent=state.employees.length}
function renderToday(){$("todayTable").innerHTML=table(state.employees.map(e=>{let a=state.attendance.find(x=>x.employeeId===e.id&&x.date===today());return [e.id,e.name,a?.clockIn||"—",a?.status||"AWOL",money(dailyPay(e,today()))]}),["ID","Employee","Clock In","Status","Pay"])}
function renderEmployees(){$("employeeTable").innerHTML=table(state.employees.map(e=>[e.id,e.name,e.type,e.start,money(baseRate(e.type))]),["ID","Name","Type","Start","Base/Day"])}
function populateSaleEmployees(){$("saleEmployee").innerHTML=state.employees.map(e=>`<option value="${e.id}">${e.name} (${e.id})</option>`).join("")}
function renderSales(){$("salesTable").innerHTML=table(state.sales.slice().reverse().map(s=>[s.date,state.employees.find(e=>e.id===s.employeeId)?.name||s.employeeId,money(s.amount),s.note||"—"]),["Date","Employee","Amount","Note"])}
function table(rows,heads){if(!rows.length)return `<p class="muted">No records yet.</p>`;return `<table class="table"><thead><tr>${heads.map(h=>`<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`}
document.querySelectorAll(".tabs button").forEach(b=>b.onclick=()=>{document.querySelectorAll(".tabs button").forEach(x=>x.classList.remove("active"));b.classList.add("active");document.querySelectorAll(".tab-panel").forEach(x=>x.classList.add("hidden"));$(b.dataset.tab).classList.remove("hidden")});
$("dailyReport").onclick=()=>report("daily");$("monthlyReport").onclick=()=>report("monthly");$("yearlyReport").onclick=()=>report("yearly");
function report(mode){let d=$("reportDate").value||today();let prefix=mode==="yearly"?d.slice(0,4):mode==="monthly"?d.slice(0,7):d;let sales=state.sales.filter(s=>mode==="yearly"?s.date.startsWith(prefix):mode==="monthly"?s.date.startsWith(prefix):s.date===prefix).reduce((t,s)=>t+s.amount,0);let payroll=0;let dates=[...new Set(state.attendance.filter(a=>mode==="yearly"?a.date.startsWith(prefix):mode==="monthly"?a.date.startsWith(prefix):a.date===prefix).map(a=>a.date))];dates.forEach(day=>state.employees.forEach(e=>payroll+=dailyPay(e,day)));$("reportOutput").innerHTML=`<div class="report-box"><b>${mode.toUpperCase()} REPORT</b><p>Sales: <strong>${money(sales)}</strong></p><p>Payroll: <strong>${money(payroll)}</strong></p><p>Net before other expenses: <strong>${money(sales-payroll)}</strong></p></div>`}
setInterval(()=>{$("clock")&&($("clock").textContent=new Date().toLocaleTimeString("en-PH",{hour12:true}))},1000);
