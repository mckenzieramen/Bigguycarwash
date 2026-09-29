const ADMIN_EMAIL="bigguy@admin.com",ADMIN_PASSWORD="bigguyadmin123";
const KEY="bigguys_dtr_v2",MODEL_URLS=["https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights","https://justadudewhohacks.github.io/face-api.js/models"];
let state=JSON.parse(localStorage.getItem(KEY)||'{"employees":[],"attendance":[],"sales":[],"faces":{},"dailyReports":{}}');
state.employees=Array.isArray(state.employees)?state.employees:[];
state.attendance=Array.isArray(state.attendance)?state.attendance:[];
state.sales=Array.isArray(state.sales)?state.sales:[];
state.faces=state.faces&&typeof state.faces==="object"?state.faces:{};
state.faceUpdatedAt=state.faceUpdatedAt&&typeof state.faceUpdatedAt==="object"?state.faceUpdatedAt:{};
state.dailyReports=state.dailyReports&&typeof state.dailyReports==="object"?state.dailyReports:{};
let enrollStream=null,modelsReady=false;
let attendanceCaptureDisplayedKey=null;
let selectedDtrEmployeeId="";
let attendanceCaptureHideTimer=null;
const $=id=>document.getElementById(id);
const cacheState=()=>{const c={...state,faces:{},faceUpdatedAt:{},lastFaceCapture:null};try{localStorage.setItem(KEY,JSON.stringify(c));}catch(e){console.warn("Local cache skipped:",e);}};
const save=async()=>{
 cacheState();
 if(!window.BigGuysCloud?.configured) return state;
 try{
   await window.BigGuysCloud.init(state,remote=>{ state=remote; cacheState(); },'admin');
   if(window.BigGuysCloud?.ready){
     const merged=await window.BigGuysCloud.push(state);
     if(merged){state=merged;cacheState();}
   }
   return state;
 }catch(err){
   console.error('Central Firebase save failed:',err);
   throw err;
 }
};
async function syncAdminNow(){
 if(!window.BigGuysCloud?.configured) return state;
 await window.BigGuysCloud.init(state,remote=>{ state=remote; cacheState(); },'admin');
 const merged=await window.BigGuysCloud.push(state);
 if(merged){state=merged;cacheState();}
 return state;
}
function syncStateFromStorage(){
 try{
   const raw=JSON.parse(localStorage.getItem(KEY)||"{}");
   if(!raw||typeof raw!=="object")return;
   state.employees=Array.isArray(raw.employees)?raw.employees:[];
   state.attendance=Array.isArray(raw.attendance)?raw.attendance:[];
   state.sales=Array.isArray(raw.sales)?raw.sales:[];
   // Face descriptors are intentionally NOT stored in localStorage. Firebase is
   // the source of truth for faces, so never replace a live Firebase face map
   // with the empty cache placeholder written by cacheState().
   if(raw.faces&&typeof raw.faces==="object"&&Object.keys(raw.faces).length)state.faces=raw.faces;
   if(raw.faceUpdatedAt&&typeof raw.faceUpdatedAt==="object"&&Object.keys(raw.faceUpdatedAt).length)state.faceUpdatedAt=raw.faceUpdatedAt;
   state.dailyReports=raw.dailyReports&&typeof raw.dailyReports==="object"?raw.dailyReports:{};
 }catch(e){console.warn("Could not sync dashboard data",e)}
}
const today=()=>{const n=new Date();const y=n.getFullYear(),m=String(n.getMonth()+1).padStart(2,"0"),d=String(n.getDate()).padStart(2,"0");return `${y}-${m}-${d}`};
const money=n=>"₱"+Number(n||0).toLocaleString("en-PH",{minimumFractionDigits:2,maximumFractionDigits:2});
// Employee IDs: YYYYMM + monthly hire sequence. The sequence never reuses an
// existing number for that month, so deleting an employee will not recycle an ID.
// Example: first hire in September 2026 = 20260901, next = 20260902.
function nextEmployeeId(hireDate){
 const m=/^(\d{4})-(\d{2})-\d{2}$/.exec(hireDate||"");
 if(!m){const d=today(); return nextEmployeeId(d);}
 const prefix=m[1]+m[2];
 let max=0;
 state.employees.forEach(e=>{
   const id=String(e?.id||"");
   if(id.startsWith(prefix)){
     const n=Number(id.slice(prefix.length));
     if(Number.isFinite(n)&&n>max)max=n;
   }
 });
 const next=max+1;
 return prefix+String(next).padStart(2,"0");
}
function updateEmployeeIdPreview(){
 const date=$("empHireDate")?.value;
 const input=$("empId");
 if(input)input.value=date?nextEmployeeId(date):"";
}
const baseRate=t=>t==="full"?250:t==="semi"?200:150;
const commRate=s=>s==="late"?.35:s==="awol"?.30:.40;
function table(rows,heads){if(!rows.length)return'<p class="muted">No records yet.</p>';return`<table class="table"><thead><tr>${heads.map(h=>`<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`}
function pay(emp,date){const a=state.attendance.find(x=>x.employeeId===emp.id&&x.date===date);if(!a)return 0;const sales=state.sales.filter(x=>x.employeeId===emp.id&&x.date===date).reduce((t,x)=>t+x.amount,0);return Math.max(baseRate(emp.type),sales*commRate(a.status))}
function statusBadge(status){
 const s=(status||"AWOL").toLowerCase();
 const label=s==="ontime"?"On Time":s.charAt(0).toUpperCase()+s.slice(1);
 const cls=s==="early"?"status-early":s==="late"||s==="awol"?"status-late":s==="absent"?"status-absent":"status-ontime";
 return `<span class="${cls}">${label}</span>`;
}
function dateLabel(date){return new Date(date+"T00:00:00").toLocaleDateString("en-PH",{month:"short",day:"numeric",year:"numeric"})}
function refreshDashboardCharts(){
 const now=new Date(), d=today();
 const dayNames=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
 const week=[]; for(let i=6;i>=0;i--){const x=new Date(now);x.setDate(now.getDate()-i);week.push(x.toISOString().slice(0,10));}
 const period=document.getElementById("salesChartPeriod")?.value||"week";
 let labels=[],dates=[];
 if(period==="today"){labels=["Today"];dates=[d]}
 else if(period==="month"){const days=new Date(now.getFullYear(),now.getMonth()+1,0).getDate();const step=Math.max(1,Math.ceil(days/7));for(let i=0;i<days;i+=step){const end=Math.min(days,i+step);labels.push(`${i+1}-${end}`);dates.push({start:new Date(now.getFullYear(),now.getMonth(),i+1),end:new Date(now.getFullYear(),now.getMonth(),end)});}}
 else if(period==="year"){labels=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];dates=labels.map((_,i)=>({start:new Date(now.getFullYear(),i,1),end:new Date(now.getFullYear(),i+1,0)}));}
 else {dates=week;labels=week.map(x=>dayNames[new Date(x+"T00:00:00").getDay()]);}
 const amounts=dates.map(x=>{if(typeof x==="string")return state.sales.filter(s=>s.date===x).reduce((t,s)=>t+Number(s.amount||0),0);return state.sales.filter(s=>{const q=new Date(s.date+"T00:00:00");return q>=x.start&&q<=x.end}).reduce((t,s)=>t+Number(s.amount||0),0)});
 const max=Math.max(1,...amounts);
 const chart=document.getElementById("salesChart");
 if(chart)chart.innerHTML=amounts.map((v,i)=>`<div class="bar-col"><span class="bar-value">${v?money(v):"₱0"}</span><div class="bar" style="height:${Math.max(2,(v/max)*150)}px"></div><span class="bar-label">${labels[i]}</span></div>`).join("");
 const cperiod=document.getElementById("carwashChartPeriod")?.value||"week";
 let cdates=dates,clabels=labels;
 if(cperiod!==period){ if(cperiod==="today"){clabels=["Today"];cdates=[d]} else if(cperiod==="week"){cdates=week;clabels=week.map(x=>dayNames[new Date(x+"T00:00:00").getDay()]);} else if(cperiod==="year"){clabels=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];cdates=clabels.map((_,i)=>({start:new Date(now.getFullYear(),i,1),end:new Date(now.getFullYear(),i+1,0)}));} else {const days=new Date(now.getFullYear(),now.getMonth()+1,0).getDate();const step=Math.max(1,Math.ceil(days/7));clabels=[];cdates=[];for(let i=0;i<days;i+=step){const end=Math.min(days,i+step);clabels.push(`${i+1}-${end}`);cdates.push({start:new Date(now.getFullYear(),now.getMonth(),i+1),end:new Date(now.getFullYear(),now.getMonth(),end)});}}}
 const counts=cdates.map(x=>{if(typeof x==="string")return state.sales.filter(s=>s.date===x).length;return state.sales.filter(s=>{const q=new Date(s.date+"T00:00:00");return q>=x.start&&q<=x.end}).length});
 const cmax=Math.max(1,...counts),line=document.getElementById("carwashChart");
 if(line){const w=520,h=175,pad=12;const pts=counts.map((v,i)=>{const x=pad+(i*(w-pad*2))/Math.max(1,counts.length-1),y=h-pad-(v/cmax)*(h-pad*2);return `${x},${y}`}).join(" ");line.innerHTML=`<svg class="line-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="#18df8a" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>${counts.map((v,i)=>{const x=pad+(i*(w-pad*2))/Math.max(1,counts.length-1),y=h-pad-(v/cmax)*(h-pad*2);return `<circle cx="${x}" cy="${y}" r="4" fill="#18df8a"/>`}).join("")}</svg><div class="line-labels">${clabels.map(x=>`<span>${x}</span>`).join("")}</div>`;}
 const total=state.sales.filter(s=>s.date===d).reduce((t,s)=>t+Number(s.amount||0),0);
 const carwash=state.sales.filter(s=>s.date===d&&/carwash|wash/i.test(s.note||"")).reduce((t,s)=>t+Number(s.amount||0),0);
 const detail=state.sales.filter(s=>s.date===d&&/detail/i.test(s.note||"")).reduce((t,s)=>t+Number(s.amount||0),0);
 const addon=state.sales.filter(s=>s.date===d&&/wax|add-on|addon/i.test(s.note||"")).reduce((t,s)=>t+Number(s.amount||0),0);
 const classified=carwash+detail+addon, rest=Math.max(0,total-classified), values=classified? [carwash,detail,addon+rest]:[0,0,0];
 const perc=total?[Math.round(values[0]/total*100),Math.round(values[1]/total*100),Math.max(0,100-Math.round(values[0]/total*100)-Math.round(values[1]/total*100))]:[0,0,0];
 const donut=document.getElementById("incomeDonut"); if(donut)donut.style.background=`conic-gradient(#1687ff 0 ${perc[0]}%,#ffb51b ${perc[0]}% ${perc[0]+perc[1]}%,#d5e3ef ${perc[0]+perc[1]}% 100%)`;
 if($("incomeTotal"))$("incomeTotal").textContent=money(total); if($("incomeCarwash"))$("incomeCarwash").textContent=perc[0]+"%"; if($("incomeDetailing"))$("incomeDetailing").textContent=perc[1]+"%"; if($("incomeAddons"))$("incomeAddons").textContent=perc[2]+"%";
}
function refreshRightPanel(){
 const d=today(), records=state.attendance.filter(a=>a.date===d).slice().sort((a,b)=>(b.clockIn||"").localeCompare(a.clockIn||""));
 const captureEl=$("rightFaceCapture"),capturePlaceholder=$("rightFacePlaceholder");
 let captured=state.lastFaceCapture||null;
 if(!captured){try{captured=JSON.parse(localStorage.getItem("bigguys_last_face_capture")||"null");}catch(e){}}
 const capturedEmployee=captured?.employeeId?state.employees.find(x=>x.id===captured.employeeId):null;
 const captureKey=captured?.capturedAt||((captured?.employeeId||"")+"|"+(captured?.dataUrl||""));
 const consumedKey=localStorage.getItem("bigguys_consumed_attendance_capture")||"";
 const shouldShowCapture=!!(captured?.dataUrl&&captureEl&&capturedEmployee&&captureKey&&captureKey!==consumedKey);
 if(shouldShowCapture){
   attendanceCaptureDisplayedKey=captureKey;
   localStorage.setItem("bigguys_consumed_attendance_capture",captureKey);
   if(attendanceCaptureHideTimer)clearTimeout(attendanceCaptureHideTimer);
   captureEl.src=captured.dataUrl;
   captureEl.classList.remove("hidden");
   capturePlaceholder?.classList.add("hidden");
   attendanceCaptureHideTimer=setTimeout(()=>{
     captureEl?.classList.add("hidden");
     capturePlaceholder?.classList.remove("hidden");
     attendanceCaptureHideTimer=null;
   },1000);
 }else{
   captureEl?.classList.add("hidden");
   capturePlaceholder?.classList.remove("hidden");
 }
 const a=records[0],e=capturedEmployee|| (a?state.employees.find(x=>x.id===a.employeeId):state.employees[0]);
 const title=$("rightStatusTitle"),text=$("rightStatusText"),notice=$("rightNoticeTitle"),noticeText=$("rightNoticeText");
 if(e){const attendance=a&&a.employeeId===e.id?a:state.attendance.find(x=>x.employeeId===e.id&&x.date===d);$("rightEmployeeId").textContent=e.id;$("rightEmployeeType").textContent=e.type==="full"?"Full Time":e.type==="semi"?"Semi Full Time":"Part Time";$("rightSchedule").textContent=e.start;$("rightClockIn").textContent=attendance?.clockIn||"—";const st=attendance?.status||"AWOL";title.textContent=attendance?"Attendance Recorded":"Ready for Attendance";text.textContent=attendance?`${e.name} is marked ${st.toUpperCase()}.`:`Latest employee: ${e.name}.`;notice.textContent=attendance?.clockOut?"Clock-out Recorded":attendance?"Clock In Successful!":"Attendance Status";noticeText.textContent=attendance?.clockOut?"Clock-out recorded successfully.":attendance?`${st==="early"?"Early arrival recorded.":st==="late"?"Late arrival recorded.":"You are on time."}`:"No attendance action recorded yet.";}else{$("rightEmployeeId").textContent="—";$('rightEmployeeType').textContent="—";$('rightSchedule').textContent="—";$('rightClockIn').textContent="—";title.textContent="Ready for Attendance";text.textContent="Add an employee to begin tracking attendance.";notice.textContent="Attendance Status";noticeText.textContent="No employee records yet.";}
}
function refresh(){
 syncStateFromStorage();
 const d=today(),ds=state.sales.filter(x=>x.date===d),totalSales=ds.reduce((t,x)=>t+Number(x.amount||0),0);
 if($("salesTotal"))$("salesTotal").textContent=money(totalSales);
 if($("carsWashed"))$("carsWashed").textContent=ds.filter(x=>/carwash|wash/i.test(x.note||"")).length;
 if($("employeeTotal"))$("employeeTotal").textContent=state.employees.length;
 if($("payrollTotal"))$("payrollTotal").textContent=money(state.employees.reduce((t,e)=>t+pay(e,d),0));
 const attendanceRows=state.employees.map((e,i)=>{const a=state.attendance.find(x=>x.employeeId===e.id&&x.date===d);const sales=state.sales.filter(x=>x.employeeId===e.id&&x.date===d).reduce((t,x)=>t+Number(x.amount||0),0);return[i+1,e.name,e.type,e.start,a?.clockIn||"—",statusBadge(a?.status||"awol"),money(sales),money(sales*commRate(a?.status||"awol")),money(pay(e,d))]});
 $("overviewAttendance").innerHTML=table(attendanceRows,["#","Employee","Type","Schedule","Clock In","Status","Sales","Commission","Daily Pay"]);
 $("attendanceTable").innerHTML=table(state.employees.map(e=>{const a=state.attendance.find(x=>x.employeeId===e.id&&x.date===d);const sales=state.sales.filter(x=>String(x.employeeId)===String(e.id)&&x.date===d).reduce((t,x)=>t+Number(x.amount||0),0);const rate=commRate(a?.status||"awol");return[e.id,e.name,e.start,a?.clockIn||"—",a?.clockOut||"—",dtrHours(a),statusBadge(a?.status||"awol"),money(sales),`${Math.round(rate*100)}%`,money(sales*rate)]}),["ID","Employee","Scheduled","Time In","Time Out","Hours","Status","Sales","Commission %","Commission"]);
 $("employeeTable").innerHTML=table(state.employees.map(e=>[e.id,e.name,e.type,e.start,money(baseRate(e.type)),state.faces[e.id]?"Enrolled":"Not enrolled",`<button class="history-employee" data-id="${e.id}">HISTORY</button> <button class="face-employee" data-id="${e.id}">FACE</button> <button class="delete-employee" data-id="${e.id}">DELETE</button>`]),["ID","Name","Type","Start","Base/Day","Face","Action"]);
 document.querySelectorAll(".history-employee").forEach(btn=>btn.onclick=()=>showEmployeeHistory(btn.dataset.id));
document.querySelectorAll(".face-employee").forEach(btn=>btn.onclick=()=>openEnrollmentModal(btn.dataset.id));
document.querySelectorAll(".delete-employee").forEach(btn=>btn.onclick=()=>deleteEmployee(btn.dataset.id));
 refreshDtrSelector();
 const opts=state.employees.map(e=>`<option value="${e.id}">${e.name} (${e.id})</option>`).join(""); if($("saleEmployee"))$("saleEmployee").innerHTML=opts;if($("enrollEmployee"))$("enrollEmployee").innerHTML=opts;
 $("salesTable").innerHTML=table(state.sales.slice().reverse().map(s=>[s.date,state.employees.find(e=>e.id===s.employeeId)?.name||s.employeeId,money(s.amount),s.note||"—"]),["Date","Employee","Amount","Service / Note"]);
 $("payrollTable").innerHTML=table(state.employees.map(e=>{const a=state.attendance.find(x=>x.employeeId===e.id&&x.date===d);const sales=state.sales.filter(x=>x.employeeId===e.id&&x.date===d).reduce((t,x)=>t+Number(x.amount||0),0);return[e.name,e.type,a?.status||"AWOL",money(sales),a?((commRate(a.status)*100)+"%"):"30%",money(pay(e,d))]}),["Employee","Type","Status","Sales","Commission","Daily Pay"]);
 const top=state.employees.map(e=>({name:e.name,sales:state.sales.filter(s=>s.date===d&&s.employeeId===e.id).reduce((t,s)=>t+Number(s.amount||0),0)})).filter(x=>x.sales>0).sort((a,b)=>b.sales-a.sales);
 $("topSalesToday").innerHTML=table(top.slice(0,6).map((x,i)=>[i+1,x.name,money(x.sales)]),["#","Employee","Sales"]);
 const types={full:"Full Time",semi:"Semi Full Time",part:"Part Time"}; const counts={};state.employees.forEach(e=>counts[e.type]=(counts[e.type]||0)+1);$("employeeTypeSummary").innerHTML=table(Object.keys(counts).map(k=>[types[k]||k,counts[k]]),["Type","Count"]);
 $("recentSales").innerHTML=table(state.sales.slice().reverse().slice(0,6).map(s=>[new Date((s.date||d)+"T"+(s.time||"12:00") ).toLocaleTimeString("en-PH",{hour:"numeric",minute:"2-digit"}),s.note||"Carwash",money(s.amount)]),["Time","Service","Amount"]);
 refreshDashboardCharts();refreshRightPanel();
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
if($("empHireDate")){
 $("empHireDate").value=today();
 $("empHireDate").addEventListener("change",updateEmployeeIdPreview);
 updateEmployeeIdPreview();
}

$("loginBtn").onclick=async()=>{
  const email=$("adminEmail").value.trim(),password=$("adminPassword").value;
  $("loginBtn").disabled=true;$("loginError").textContent="Signing in…";
  try{
    if(!window.BigGuysCloud?.configured)throw new Error("Firebase is not configured.");
    if(email!==ADMIN_EMAIL)throw new Error("This account is not authorized as the Big Guy's administrator.");
    await BigGuysCloud.adminLogin(email,password);
    // Show the dashboard immediately after Firebase Authentication succeeds.
    // Firestore sync continues in the background so login is not blocked by
    // network reads/writes.
    $("adminLogin").classList.add("hidden");$("dashboard").classList.remove("hidden");document.body.classList.add("logged-in");
    $("loginError").textContent="";refresh();startClock();
    BigGuysCloud.init(state,remote=>{
      state=remote;
      cacheState();
      refresh();
    },'admin').catch(err=>{
      console.error('Background Firestore sync failed:',err);
    });
  }catch(err){
    console.error(err);
    $("loginError").textContent=err?.message||"Invalid admin email or password.";
  }finally{$("loginBtn").disabled=false;}
};
$("logoutBtn").onclick=async()=>{
  try{await BigGuysCloud.adminLogout();}catch(e){console.warn(e)}
  $("dashboard").classList.add("hidden");$("adminLogin").classList.remove("hidden");$("adminPassword").value="";document.body.classList.remove("logged-in");
};
$("employeeForm").onsubmit=async e=>{
 e.preventDefault();
 const btn=e.target.querySelector('button[type="submit"]');
 const first=$("empFirstName").value.trim(),last=$("empLastName").value.trim();
 if(!first||!last)return;
 if(btn){btn.disabled=true;btn.textContent='SAVING EMPLOYEE…';}
 try{
   await window.BigGuysCloud?.init?.(state,remote=>{
     state=remote;
     cacheState();
   },'admin');
   const hireDate=$("empHireDate").value||today();
   const id=window.BigGuysCloud?.reserveEmployeeId ? await window.BigGuysCloud.reserveEmployeeId(hireDate) : nextEmployeeId(hireDate);
   const employee={id,firstName:first,lastName:last,name:`${first} ${last}`.trim(),type:$("empType").value,start:$("empStart").value,hireDate};
   state.employees.push(employee);
   cacheState();
   if(window.BigGuysCloud?.saveEmployee){
     state=await window.BigGuysCloud.saveEmployee(employee);
     cacheState();
   }else{
     await syncAdminNow();
   }
   e.target.reset();
   $("empStart").value='08:00';
   $("empHireDate").value=today();
   updateEmployeeIdPreview();
   refresh();
   await openEnrollmentModal(id);
 }catch(err){
   console.error('Employee creation failed:',err);
   alert('Employee was not fully saved. Please check the Firebase connection and try again.');
 }finally{
   if(btn){btn.disabled=false;btn.textContent='ADD EMPLOYEE & ENROLL FACE';}
 }
};
$("salesForm").onsubmit=async e=>{e.preventDefault();const sale={id:(crypto.randomUUID?crypto.randomUUID():`sale_${Date.now()}_${Math.random().toString(36).slice(2)}`),date:today(),time:new Date().toTimeString().slice(0,5),employeeId:$("saleEmployee").value,amount:Number($("saleAmount").value),note:$("saleNote").value};state.sales.push(sale);try{if(window.BigGuysCloud?.saveSale){state=await window.BigGuysCloud.saveSale(sale);}else{state=await save();}cacheState();e.target.reset();refresh()}catch(err){console.error(err);alert(`Sale cloud save failed: ${err?.code||err?.message||err}`)}};
document.querySelectorAll(".tabs button").forEach(btn=>btn.onclick=()=>{document.querySelectorAll(".tabs button").forEach(x=>x.classList.remove("active"));btn.classList.add("active");document.querySelectorAll(".tab-panel").forEach(x=>x.classList.add("hidden"));$(btn.dataset.tab).classList.remove("hidden")});
let enrollmentRunning=false,enrollmentSamples=[];
const ENROLL_STEPS=[
  {name:"Normal face",instruction:"Look straight at the camera with your face centered."},
  {name:"Slight left",instruction:"Turn your face slightly to the LEFT."},
  {name:"Slight right",instruction:"Turn your face slightly to the RIGHT."},
  {name:"Slight up/down",instruction:"Tilt your face slightly UP, then slightly DOWN."},
  {name:"Normal expression",instruction:"Return to center with a natural, relaxed expression."}
];
let enrollmentStep=0;
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
function enrollmentFaceIsInsideOval(d){
 const video=$("enrollCamera"),w=video.videoWidth||720,h=video.videoHeight||720,box=d.detection.box;
 const cx=(box.x+box.width/2)/w,cy=(box.y+box.height/2)/h;
 const rx=.23,ry=.40;
 const ellipse=((cx-.5)**2)/(rx**2)+((cy-.50)**2)/(ry**2);
 const faceHeight=box.height/h,faceWidth=box.width/w;
 return ellipse<=1&&faceHeight>=.22&&faceHeight<=.82&&faceWidth>=.14&&faceWidth<=.72;
}
function facePoseForStep(d,step){
 const pos=d?.landmarks?.positions||[];
 if(pos.length<68)return true;
 const nose=pos[30], leftEye=pos[36], rightEye=pos[45], chin=pos[8], brow=pos[27];
 const eyeMidX=(leftEye.x+rightEye.x)/2, eyeDist=Math.max(1,Math.abs(rightEye.x-leftEye.x));
 const yaw=(nose.x-eyeMidX)/eyeDist;
 const faceVertical=Math.max(1,chin.y-brow.y);
 const pitch=(nose.y-(brow.y+faceVertical*.45))/faceVertical;
 if(step===0||step===4)return Math.abs(yaw)<.16;
 if(step===1)return yaw<-.08;
 if(step===2)return yaw>.08;
 if(step===3)return Math.abs(yaw)<.22 && pitch<.20;
 return true;
}
async function captureEnrollmentSample(id,step){
 const d=await faceapi.detectSingleFace($("enrollCamera"),new faceapi.TinyFaceDetectorOptions({inputSize:416,scoreThreshold:.45})).withFaceLandmarks(true).withFaceDescriptor();
 if(!d)return false;
 const good=enrollmentFaceIsInsideOval(d) && facePoseForStep(d,step);
 const frame=$("enrollOvalFrame");
 frame?.classList.toggle("oval-green",good); frame?.classList.toggle("oval-red",!good);
 if(!good)return false;
 const descriptor=Array.from(d.descriptor);
 if(descriptor.length!==128||descriptor.some(v=>!Number.isFinite(Number(v))))return false;
 enrollmentSamples.push(descriptor);
 const next=enrollmentSamples.length;
 $("enrollResult").innerHTML=`<div class="result success enrollment-progress"><strong>${ENROLL_STEPS[step].name}</strong><br>Sample ${next}/5 captured ✓<br><small>${next<5?ENROLL_STEPS[next].instruction:"All 5 face samples captured. Saving to Firebase…"}</small></div>`;
 return true;
}
function stopEnrollmentCamera(){
 if(enrollStream){enrollStream.getTracks().forEach(t=>t.stop());enrollStream=null;}
 const v=$("enrollCamera");if(v)v.srcObject=null;
}
function setEnrollmentRetryVisible(show){const b=$("retryEnrollment");if(b)b.classList.toggle("hidden",!show);}
function closeEnrollmentModal(){
 stopEnrollmentCamera();
 enrollmentRunning=false;
 setEnrollmentRetryVisible(false);
 $("enrollmentModal")?.classList.add('hidden');
}
async function runAutoEnrollment(){
 const id=$("enrollEmployee").value;if(!id||enrollmentRunning)return false;
 setEnrollmentRetryVisible(false);
 enrollmentRunning=true;enrollmentSamples=[];enrollmentStep=0;
 $("enrollStatus").textContent=`Step 1/5 — ${ENROLL_STEPS[0].instruction}`;
 $("enrollResult").innerHTML=`<div class="result success enrollment-progress"><strong>${ENROLL_STEPS[0].name}</strong><br><small>${ENROLL_STEPS[0].instruction}</small></div>`;
 for(enrollmentStep=0;enrollmentStep<ENROLL_STEPS.length&&enrollmentRunning;enrollmentStep++){
   let captured=false, attempts=0;
   $("enrollStatus").textContent=`Step ${enrollmentStep+1}/5 — ${ENROLL_STEPS[enrollmentStep].instruction}`;
   while(!captured&&attempts<80&&enrollmentRunning){
     attempts++;
     try{captured=await captureEnrollmentSample(id,enrollmentStep);}catch(err){console.warn('Enrollment detection error:',err);}
     if(!captured)$("enrollStatus").textContent=`🔴 Step ${enrollmentStep+1}/5 — ${ENROLL_STEPS[enrollmentStep].instruction}`;
     else if(enrollmentStep<4)$("enrollStatus").textContent=`🟢 Step ${enrollmentStep+1}/5 captured — now: ${ENROLL_STEPS[enrollmentStep+1].instruction}`;
     await new Promise(r=>setTimeout(r,350));
   }
   if(!captured){
     $("enrollStatus").textContent="Enrollment paused — please reposition and try again.";
     $("enrollResult").innerHTML='<div class="result late-result">Could not capture this required face position. Keep your face inside the oval and follow the instruction.</div>';
     enrollmentRunning=false;
    setEnrollmentRetryVisible(true);
    return false;
   }
   await new Promise(r=>setTimeout(r,500));
 }
 if(enrollmentSamples.length===5){
   state.faces[id]=enrollmentSamples;
   state.faceUpdatedAt=state.faceUpdatedAt||{};state.faceUpdatedAt[id]=new Date().toISOString();cacheState();
   try{
     let lastErr=null,confirmed=false;
     for(let attempt=1;attempt<=5&&!confirmed;attempt++){
       try{
         if(window.BigGuysCloud?.saveFaceEnrollment)state=await window.BigGuysCloud.saveFaceEnrollment(id,enrollmentSamples);else await syncAdminNow();
         // Keep the just-confirmed samples visible locally even if a realtime listener
         // delivers an older collection snapshot during the same save cycle.
         state.faces=state.faces&&typeof state.faces==='object'?state.faces:{};
         state.faces[id]=enrollmentSamples.map(sample=>Array.from(sample));
         state.faceUpdatedAt=state.faceUpdatedAt&&typeof state.faceUpdatedAt==='object'?state.faceUpdatedAt:{};
         state.faceUpdatedAt[id]=new Date().toISOString();
         cacheState();
         const enrolledEmployee=state.employees.find(e=>String(e.id)===String(id));
         confirmed=Array.isArray(state.faces?.[id])&&state.faces[id].length>=5&&enrolledEmployee?.faceEnrolled===true;
         if(!confirmed)throw new Error('Firebase returned without confirming the enrolled face.');
       }catch(err){lastErr=err;if(attempt<5)await new Promise(r=>setTimeout(r,500*attempt));}
     }
     if(!confirmed)throw lastErr||new Error('Firebase did not confirm the face enrollment.');
     const employee=state.employees.find(e=>e.id===id);
     $("enrollStatus").textContent="✓ Employee enrolled successfully.";
     $("enrollResult").innerHTML=`<div class="enrolled-success"><div class="enrolled-check">✓</div><strong>EMPLOYEE ENROLLED</strong><span>${employee?.name||''}</span><small>${id} • 5 face samples saved to Firebase</small></div>`;
     refresh();
     setTimeout(()=>{closeEnrollmentModal();const nav=document.querySelector('.side-nav[data-tab="employees"]');if(nav)nav.click();const form=$("employeeForm");if(form){form.reset();$("empStart").value='08:00';$("empHireDate").value=today();updateEmployeeIdPreview();}$("empFirstName")?.focus();},1400);
     enrollmentRunning=false;return true;
   }catch(err){
     console.error('Face enrollment cloud save failed:',err);const detail=[err?.code,err?.message].filter(Boolean).join(' — ')||'Unknown Firebase error';
     $("enrollStatus").textContent="Cloud save could not be confirmed.";
     $("enrollResult").innerHTML=`<div class="result late-result">Face samples captured, but Firebase did not confirm the save.<br><small>${detail}</small></div>`;
     setEnrollmentRetryVisible(true);
   }
 }else{$("enrollStatus").textContent="Enrollment failed — all 5 face samples are required.";$("enrollResult").innerHTML='<div class="result late-result">All 5 guided face samples are required.</div>';setEnrollmentRetryVisible(true)}
 enrollmentRunning=false;return false;
}
async function startEnrollmentCamera(){
 if(!await loadModels())return false;
 try{
   stopEnrollmentCamera();
   enrollStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:720},height:{ideal:720}},audio:false});
   const video=$("enrollCamera");
   video.srcObject=enrollStream;
   await new Promise(resolve=>{
     if(video.readyState>=2)return resolve();
     video.onloadedmetadata=()=>resolve();
   });
   try{await video.play();}catch(e){}
   $("enrollStatus").textContent="Camera ready — position your face inside the oval.";
   return true;
 }catch(e){
   console.error(e);
   $("enrollStatus").textContent="Camera permission denied or unavailable. Please allow camera access and try again.";
   return false;
 }
}
async function openEnrollmentModal(id){
 const employee=state.employees.find(e=>e.id===id);
 if(!employee)return;
 const modal=$("enrollmentModal"),select=$("enrollEmployee");
 if(select){select.innerHTML=`<option value="${employee.id}">${employee.name} (${employee.id})</option>`;select.value=employee.id;}
 $("enrollmentEmployeeName").textContent=employee.name;
 $("enrollmentEmployeeId").textContent=employee.id;
 $("enrollmentEmployeeLabel").textContent="Position your face inside the oval. Enrollment will start automatically.";
 $("enrollResult").innerHTML='';
 setEnrollmentRetryVisible(false);
 $("enrollOvalFrame")?.classList.remove('oval-green');
 $("enrollOvalFrame")?.classList.add('oval-red');
 modal?.classList.remove('hidden');
 const cameraReady=await startEnrollmentCamera();
 if(cameraReady) await runAutoEnrollment();
}
$("startEnrollCamera").onclick=startEnrollmentCamera;
$("enrollFace").onclick=runAutoEnrollment;
$("retryEnrollment").onclick=async()=>{setEnrollmentRetryVisible(false);if(!enrollStream){const ready=await startEnrollmentCamera();if(!ready){setEnrollmentRetryVisible(true);return;}}await runAutoEnrollment();};
$("closeEnrollmentModal").onclick=closeEnrollmentModal;
$("enrollmentModal")?.querySelector('.enrollment-modal-backdrop')?.addEventListener('click',()=>{if(!enrollmentRunning)closeEnrollmentModal();});

function dtrMinutes(a){
 const start=a?.clockInAt?new Date(a.clockInAt):null, end=a?.clockOutAt?new Date(a.clockOutAt):null;
 if(start&&end&&!Number.isNaN(start.getTime())&&!Number.isNaN(end.getTime()))return Math.max(0,(end-start)/60000);
 if(a?.clockIn&&a?.clockOut){const [h1,m1,s1=0]=a.clockIn.split(":").map(Number),[h2,m2,s2=0]=a.clockOut.split(":").map(Number);return Math.max(0,(h2*60+m2+s2/60)-(h1*60+m1+s1/60));}
 return null;
}
function dtrHours(a){const mins=dtrMinutes(a);return mins==null?"—":(mins/60).toFixed(2)+" hrs";}
function renderEmployeeDtr(id){
 const box=$("employeeDtrProfile"); if(!box)return;
 const e=state.employees.find(x=>String(x.id)===String(id));
 if(!e){box.className="employee-dtr-profile empty-dtr";box.innerHTML='<div class="dtr-empty-icon">◷</div><h3>Select an employee</h3><p class="muted">The employee\'s DTR details will appear here.</p>';return;}
 selectedDtrEmployeeId=e.id;
 const rows=state.attendance.filter(a=>String(a.employeeId)===String(e.id)).slice().sort((a,b)=>(b.date||"").localeCompare(a.date||"")||(b.clockInAt||b.clockIn||"").localeCompare(a.clockInAt||a.clockIn||""));
 const totalSales=state.sales.filter(x=>String(x.employeeId)===String(e.id)).reduce((t,x)=>t+Number(x.amount||0),0);
 const completed=rows.filter(a=>a.clockIn&&a.clockOut); const totalMinutes=completed.reduce((t,a)=>t+(dtrMinutes(a)||0),0);
 const todayRecord=rows.find(a=>a.date===today()); const todaySales=state.sales.filter(x=>String(x.employeeId)===String(e.id)&&x.date===today()).reduce((t,x)=>t+Number(x.amount||0),0);
 const rate=commRate(todayRecord?.status||"awol");
 const commission=todaySales*rate;
 const type=e.type==="full"?"Full Time":e.type==="semi"?"Semi Full Time":"Part Time";
 const history=rows.length?rows.map(a=>{
   const sales=state.sales.filter(x=>String(x.employeeId)===String(e.id)&&x.date===a.date).reduce((t,x)=>t+Number(x.amount||0),0);
   const r=commRate(a.status||"awol");
   return [dateLabel(a.date),e.start||"—",a.clockIn||"—",a.clockOut||"—",dtrHours(a),money(sales),`${Math.round(r*100)}%`,money(sales*r),statusBadge(a.status||"awol")];
 }):[];
 box.className="employee-dtr-profile";
 box.innerHTML=`<div class="dtr-employee-header"><div class="dtr-avatar">${(e.name||"?").split(/\s+/).map(x=>x[0]).slice(0,2).join("").toUpperCase()}</div><div class="dtr-employee-main"><span class="section-kicker">EMPLOYEE DTR PROFILE</span><h3>${e.name}</h3><p>${e.id} · ${type} · Schedule ${e.start||"—"}</p></div><button type="button" class="dtr-print" onclick="window.print()">PRINT DTR</button></div>
 <div class="dtr-kpi-grid"><div class="dtr-kpi"><span>TIME IN TODAY</span><b>${todayRecord?.clockIn||"—"}</b><small>${todayRecord?statusBadge(todayRecord.status||"awol"):"No record yet"}</small></div><div class="dtr-kpi"><span>TIME OUT TODAY</span><b>${todayRecord?.clockOut||"—"}</b><small>${todayRecord?.clockOut?dtrHours(todayRecord):"Pending"}</small></div><div class="dtr-kpi"><span>TODAY'S SALES</span><b>${money(todaySales)}</b><small>Commission ${Math.round(rate*100)}%</small></div><div class="dtr-kpi"><span>TOTAL SALES</span><b>${money(totalSales)}</b><small>${rows.length} attendance record${rows.length===1?"":"s"}</small></div><div class="dtr-kpi"><span>TOTAL HOURS</span><b>${(totalMinutes/60).toFixed(2)}</b><small>Completed shifts</small></div><div class="dtr-kpi"><span>TODAY COMMISSION</span><b>${money(commission)}</b><small>${Math.round(rate*100)}% of today's sales</small></div></div>
 <div class="dtr-table-wrap">${history.length?table(history,["DATE","SCHEDULE","TIME IN","TIME OUT","HOURS","SALES","COMMISSION %","COMMISSION","STATUS"]):'<p class="muted dtr-no-records">No DTR history for this employee yet.</p>'}</div>`;
}
function refreshDtrSelector(){
 const select=$("dtrEmployeeSelect"); if(!select)return;
 const current=selectedDtrEmployeeId||select.value||"";
 select.innerHTML='<option value="">Select Employee</option>'+state.employees.map(e=>`<option value="${e.id}">${e.name} — ${e.id}</option>`).join("");
 if(state.employees.some(e=>String(e.id)===String(current))){select.value=current;renderEmployeeDtr(current);}else{select.value="";selectedDtrEmployeeId="";renderEmployeeDtr("");}
}

function showEmployeeHistory(id){
 const e=state.employees.find(x=>x.id===id);
 if(!e)return;
 const rows=state.attendance.filter(a=>a.employeeId===id).slice().sort((a,b)=>(b.date||"").localeCompare(a.date||"")||(b.clockIn||"").localeCompare(a.clockIn||""));
 const html=rows.length?table(rows.map(a=>{
   const sales=state.sales.filter(x=>x.employeeId===id&&x.date===a.date).reduce((t,x)=>t+Number(x.amount||0),0);
   const hours=a.clockIn&&a.clockOut?((minutes(a.clockOut)-minutes(a.clockIn))/60).toFixed(2):"—";
   return [a.date,a.clockIn||"—",a.clockOut||"—",statusBadge(a.status||"awol"),hours,money(sales),money(pay(e,a.date))];
 }),["DATE","TIME IN","TIME OUT","STATUS","HOURS","SALES","DAILY PAY"]):'<p class="muted">No DTR history for this employee yet.</p>';
 const box=$("employeeHistory");
 if(box){
   box.innerHTML=`<div class="history-head"><div><h3>${e.name} — DTR History</h3><p class="muted">${e.id}</p></div><button type="button" id="closeHistory">CLOSE</button></div>${html}`;
   box.classList.remove("hidden");
   $("closeHistory").onclick=()=>box.classList.add("hidden");
   box.scrollIntoView({behavior:"smooth",block:"nearest"});
 }
}
async function deleteEmployee(id){
 const employee=state.employees.find(e=>e.id===id);
 if(!employee)return;
 const ok=confirm(`Delete employee ${employee.name} (${employee.id})?\n\nThis will also delete the employee's enrolled face, attendance records, and sales records from Firebase.`);
 if(!ok)return;
 try{
   if(window.BigGuysCloud?.deleteEmployee){
     state=await window.BigGuysCloud.deleteEmployee(id);
   }else{
     state.employees=state.employees.filter(e=>e.id!==id);
     state.attendance=state.attendance.filter(a=>a.employeeId!==id);
     state.sales=state.sales.filter(s=>s.employeeId!==id);
     delete state.faces[id];
     await save();
   }
   cacheState();
   refresh();
 }catch(err){
   console.error('Employee delete failed:',err);
   alert(`Employee could not be deleted from Firebase: ${err?.code||err?.message||err}`);
 }
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
async function saveDailyReport(){
 const date=$("reportDate").value||today();
 const cash=Number($("reportCash").value||0),expenses=Number($("reportExpenses").value||0);
 const remittedValue=$("reportCashRemitted").value;
 const report={cash,expenses,cashRemitted:remittedValue===""?null:Number(remittedValue)};
 state.dailyReports[date]=report;
 try{
   if(window.BigGuysCloud?.saveDailyReport){ state=await window.BigGuysCloud.saveDailyReport(date,report); }
   else { state=await save(); }
   cacheState();
   makeReport("daily");
 }catch(err){ console.error(err); alert(`Daily report cloud save failed: ${err?.code||err?.message||err}`); }
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
$("dtrEmployeeSelect")?.addEventListener("change",e=>{selectedDtrEmployeeId=e.target.value||"";renderEmployeeDtr(selectedDtrEmployeeId);});
$("reportDate").value=today();
$("reportDate").addEventListener("change",loadDailyReportInputs);
$("saveDailyReport").onclick=saveDailyReport;


function startClock(){
 const tick=()=>{const n=new Date();const time=n.toLocaleTimeString("en-PH",{hour:"numeric",minute:"2-digit",second:"2-digit"});const date=n.toLocaleDateString("en-PH",{weekday:"long",month:"long",day:"numeric",year:"numeric"});const day=n.toLocaleDateString("en-PH",{weekday:"long"});const long=n.toLocaleDateString("en-PH",{month:"long",day:"numeric",year:"numeric"});if($("digitalClock"))$("digitalClock").textContent=time;if($("rightDate"))$("rightDate").textContent=date;if($("headerDay"))$("headerDay").textContent=day;if($("headerDate"))$("headerDate").textContent=long};tick();clearInterval(window.bigGuysClock);window.bigGuysClock=setInterval(tick,1000);
}
function activateTab(tab){
 document.querySelectorAll(".side-nav[data-tab]").forEach(x=>x.classList.toggle("active",x.dataset.tab===tab));
 document.querySelectorAll(".tab-panel").forEach(x=>x.classList.add("hidden"));
 const panel=$(tab);if(panel)panel.classList.remove("hidden");
 if(tab!=="sales")document.getElementById("salesSubnav")?.classList.remove("open");
 document.getElementById("adminSidebar")?.classList.remove("open");
}
document.querySelectorAll(".side-nav[data-tab]").forEach(btn=>btn.addEventListener("click",(ev)=>{ev.preventDefault();if(btn.id==="salesNav"){const sub=document.getElementById("salesSubnav");sub?.classList.toggle("open");activateTab("sales");}else activateTab(btn.dataset.tab)}));
document.querySelectorAll("[data-tab-target]").forEach(btn=>btn.addEventListener("click",(ev)=>{ev.preventDefault();activateTab(btn.dataset.tabTarget)}));
document.querySelectorAll("[data-report-mode]").forEach(btn=>btn.addEventListener("click",(ev)=>{ev.preventDefault();activateTab("reports");makeReport(btn.dataset.reportMode)}));
window.addEventListener("storage",()=>{syncStateFromStorage();if(!document.getElementById("dashboard")?.classList.contains("hidden"))refresh()});
window.addEventListener("bigguys:cloud-state",ev=>{const remote=ev.detail;if(!remote)return;state=remote;cacheState();if(!document.getElementById("dashboard")?.classList.contains("hidden"))refresh();});
async function initCloud(){ if(window.BigGuysCloud){ await window.BigGuysCloud.init(state,remote=>{ state=remote; cacheState(); if(!document.getElementById("dashboard")?.classList.contains("hidden"))refresh(); }); } }
setInterval(()=>{if(!document.getElementById("dashboard")?.classList.contains("hidden")){refresh()}},2000); window.addEventListener("load",initCloud);
$("salesChartPeriod")?.addEventListener("change",refreshDashboardCharts);$("carwashChartPeriod")?.addEventListener("change",refreshDashboardCharts);
$("mobileMenu")?.addEventListener("click",()=>$("adminSidebar")?.classList.toggle("open"));

setInterval(()=>{const el=$("cloudStatus");if(!el)return;const c=window.BIGGUYS_CLOUD||{};if(c.ready&&c.lastSyncError)el.textContent="Cloud sync: ERROR — "+(c.lastSyncError.message||"write/read failed");else if(c.ready)el.textContent="Cloud sync: CONNECTED to Firebase";else if(c.status==="error")el.textContent="Cloud sync: ERROR — "+(c.error?.message||c.lastSyncError?.message||"Firebase connection failed");else if(c.status==="authenticated")el.textContent="Cloud sync: authenticated — starting Firestore…";else el.textContent=window.BigGuysCloud?.configured?"Cloud sync: waiting for Admin login":"Cloud sync: local mode";},1000);
