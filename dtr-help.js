(function () {
  'use strict';

  const HELP_ID = 'dtrHelpButton';
  if (document.getElementById(HELP_ID)) return;

  const style = document.createElement('style');
  style.textContent = `
    #${HELP_ID}{position:fixed;right:18px;top:18px;z-index:100005;display:flex;align-items:center;gap:8px;min-height:44px;padding:0 15px;border:1px solid rgba(111,177,255,.42);border-radius:999px;background:rgba(10,18,34,.94);color:#fff;font:800 13px/1 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;box-shadow:0 10px 32px rgba(0,0,0,.28);cursor:pointer;backdrop-filter:blur(12px)}
    #${HELP_ID}:hover{background:#15233e}#${HELP_ID}:focus-visible{outline:3px solid rgba(77,156,255,.42);outline-offset:3px}.dtr-help-q{display:grid;place-items:center;width:25px;height:25px;border-radius:50%;background:linear-gradient(135deg,#2584ff,#5b4dff);font-size:15px}
    .dtr-tour-overlay{position:fixed;inset:0;z-index:100001;background:rgba(2,6,15,.72);backdrop-filter:blur(2px)}
    .dtr-tour-highlight{position:fixed;z-index:100002;border:3px solid #6fb1ff;border-radius:18px;box-shadow:0 0 0 6px rgba(111,177,255,.16),0 0 32px rgba(67,145,255,.42);pointer-events:none;transition:all .22s ease}
    .dtr-tour-card{position:fixed;z-index:100003;width:min(390px,calc(100vw - 28px));box-sizing:border-box;padding:22px;border:1px solid rgba(111,177,255,.3);border-radius:20px;background:linear-gradient(145deg,#111c34,#080e1c);color:#fff;box-shadow:0 24px 70px rgba(0,0,0,.52);font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    .dtr-tour-top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:13px}.dtr-tour-step{font-size:11px;font-weight:900;letter-spacing:.12em;color:#6fb1ff}.dtr-tour-close{width:36px;height:36px;border:0;border-radius:10px;background:rgba(255,255,255,.07);color:#fff;font-size:20px;cursor:pointer}.dtr-tour-card h3{margin:0 0 8px;font-size:21px;line-height:1.2}.dtr-tour-card p{margin:0;color:#aebbd0;font-size:14px;line-height:1.55}.dtr-tour-tip{margin-top:13px!important;padding:11px 12px;border-radius:12px;background:rgba(77,156,255,.09);color:#dbe9ff!important;font-size:12px!important}.dtr-tour-progress{display:flex;gap:5px;margin:18px 0 14px}.dtr-tour-dot{height:4px;flex:1;border-radius:10px;background:rgba(255,255,255,.12)}.dtr-tour-dot.active,.dtr-tour-dot.done{background:#5d9fff}.dtr-tour-actions{display:flex;align-items:center;justify-content:space-between;gap:8px}.dtr-tour-actions-left,.dtr-tour-actions-right{display:flex;gap:8px}.dtr-tour-btn{min-height:42px;padding:0 14px;border-radius:11px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#fff;font-weight:800;cursor:pointer}.dtr-tour-btn.primary{border:0;background:linear-gradient(135deg,#2584ff,#5b4dff)}.dtr-tour-btn:disabled{opacity:.4;cursor:not-allowed}
    @media(max-width:520px){#${HELP_ID}{right:12px;top:12px;padding:0 12px}.dtr-help-label{display:none}.dtr-tour-card{left:14px!important;right:14px!important;bottom:14px!important;top:auto!important;width:auto}.dtr-tour-highlight{border-radius:14px}}
  `;
  document.head.appendChild(style);

  const help = document.createElement('button');
  help.type = 'button';
  help.id = HELP_ID;
  help.setAttribute('aria-label', 'Open DTR Help tutorial');
  help.innerHTML = '<span class="dtr-help-q">?</span><span class="dtr-help-label">Help</span>';
  document.body.appendChild(help);

  const steps = [
    {selector:'#dtrLocationGate .dtr-access-card',icon:'📍',title:'Verify Your Location',text:'The DTR first checks your GPS location. Allow location access when your browser asks. You must be inside an approved Big Guy\'s Carwash site to continue.',tip:'If location is denied or cannot be detected, turn on Location/GPS and tap “CHECK LOCATION AGAIN”.'},
    {selector:'#dtrAccessGate .dtr-access-card',icon:'🔐',title:'Unlock Employee DTR',text:'After your location is verified, enter the DTR password provided for employees, then select “UNLOCK DTR”.',tip:'The face scanner will only open after both the location check and password are accepted.'},
    {selector:'.camera-box',icon:'📷',title:'Position Your Face',text:'Look directly at the camera and place your face inside the oval. The scanner starts automatically, so you do not need to press a capture button.',tip:'For faster recognition, keep your face clearly visible and use good lighting.'},
    {selector:'#recognized',fallback:'.camera-box',icon:'✓',title:'Wait for Recognition',text:'Once your face is recognized, check that your name and attendance status appear correctly before recording your attendance.',tip:'If your face is not recognized, stay inside the oval and avoid covering your face.'},
    {selector:'.button-row',icon:'🕐',title:'Record Your Attendance',text:'Select “TIME IN” when starting your shift. Select “TIME OUT” only when ending your shift. The available button will activate after successful face recognition.',tip:'Do not close or refresh the page until the attendance result is shown.'},
    {selector:'#result',fallback:'.button-row',icon:'✅',title:'Check the Confirmation',text:'After Time In or Time Out, check the result message to make sure your attendance was recorded successfully.',tip:'You’re done once the system confirms the attendance record.'}
  ];

  let current = 0;
  let overlay, highlight, card;

  function visible(el){
    if(!el) return false;
    const s=getComputedStyle(el),r=el.getBoundingClientRect();
    return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0;
  }
  function targetFor(step){
    const main=document.querySelector(step.selector);
    if(visible(main)) return main;
    const fallback=step.fallback?document.querySelector(step.fallback):null;
    return visible(fallback)?fallback:null;
  }
  function closeTour(){
    [overlay,highlight,card].forEach(el=>el&&el.remove());
    overlay=highlight=card=null;
    help.focus();
  }
  function position(step){
    const target=targetFor(step);
    if(!target){highlight.style.display='none';card.style.left='50%';card.style.top='50%';card.style.transform='translate(-50%,-50%)';return;}
    const r=target.getBoundingClientRect(),pad=8;
    highlight.style.display='block';highlight.style.left=Math.max(6,r.left-pad)+'px';highlight.style.top=Math.max(6,r.top-pad)+'px';highlight.style.width=Math.min(innerWidth-12,r.width+pad*2)+'px';highlight.style.height=Math.min(innerHeight-12,r.height+pad*2)+'px';
    if(innerWidth<=520){card.style.transform='none';return;}
    card.style.transform='none';
    const cw=Math.min(390,innerWidth-28),spaceBelow=innerHeight-r.bottom,top=spaceBelow>300?Math.min(innerHeight-260,r.bottom+18):Math.max(14,r.top-260);
    let left=r.left+r.width/2-cw/2;left=Math.max(14,Math.min(innerWidth-cw-14,left));
    card.style.left=left+'px';card.style.top=top+'px';
  }
  function render(){
    const step=steps[current];
    card.innerHTML=`<div class="dtr-tour-top"><span class="dtr-tour-step">${step.icon} STEP ${current+1} OF ${steps.length}</span><button type="button" class="dtr-tour-close" aria-label="Close tutorial">×</button></div><h3>${step.title}</h3><p>${step.text}</p><p class="dtr-tour-tip">💡 ${step.tip}</p><div class="dtr-tour-progress">${steps.map((_,i)=>`<span class="dtr-tour-dot ${i===current?'active':i<current?'done':''}"></span>`).join('')}</div><div class="dtr-tour-actions"><div class="dtr-tour-actions-left"><button type="button" class="dtr-tour-btn dtr-skip">Skip</button></div><div class="dtr-tour-actions-right"><button type="button" class="dtr-tour-btn dtr-back" ${current===0?'disabled':''}>Back</button><button type="button" class="dtr-tour-btn primary dtr-next">${current===steps.length-1?'Finish':'Next'}</button></div></div>`;
    card.querySelector('.dtr-tour-close').addEventListener('click',closeTour);
    card.querySelector('.dtr-skip').addEventListener('click',closeTour);
    card.querySelector('.dtr-back').addEventListener('click',()=>{if(current>0){current--;render();}});
    card.querySelector('.dtr-next').addEventListener('click',()=>{if(current<steps.length-1){current++;render();}else closeTour();});
    requestAnimationFrame(()=>position(step));
  }
  function openTour(){
    if(overlay) return;
    current=0;
    overlay=document.createElement('div');overlay.className='dtr-tour-overlay';
    highlight=document.createElement('div');highlight.className='dtr-tour-highlight';
    card=document.createElement('section');card.className='dtr-tour-card';card.setAttribute('role','dialog');card.setAttribute('aria-modal','true');card.setAttribute('aria-label','Employee DTR tutorial');
    document.body.append(overlay,highlight,card);
    overlay.addEventListener('click',closeTour);
    render();
  }

  help.addEventListener('click',openTour);
  window.addEventListener('resize',()=>{if(card)position(steps[current]);});
  window.addEventListener('scroll',()=>{if(card)position(steps[current]);},{passive:true});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&overlay)closeTour();});
})();