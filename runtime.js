/* runtime.js — מחליף את יכולות Claude כשהאפליקציה רצה עצמאית (GitHub Pages / מקומית).
   - sample: קריאה ל-API של Anthropic עם מפתח של המשתמש (נשמר רק בדפדפן הזה)
   - downloads: שמירת קובץ רגילה מהדפדפן
   - db / user: לא קיימים — הנתונים נשמרים במכשיר, וגיבוי/העברה דרך קובץ */
(function(){
  'use strict';
  const CFG_KEY='taxwiz.cfg';
  const DEFAULT_MODEL='claude-sonnet-5-5';
  const getCfg=()=>{try{return Object.assign({key:'',model:DEFAULT_MODEL},JSON.parse(localStorage.getItem(CFG_KEY)||'{}'));}catch(e){return{key:'',model:DEFAULT_MODEL};}};
  const setCfg=c=>{try{localStorage.setItem(CFG_KEY,JSON.stringify(c));}catch(e){}};

  async function toJpegB64(blob){ // downscale to ~1600px long side, JPEG
    const bmp=await createImageBitmap(blob);const max=1600,sc=Math.min(1,max/Math.max(bmp.width,bmp.height));
    const c=document.createElement('canvas');c.width=Math.round(bmp.width*sc);c.height=Math.round(bmp.height*sc);
    const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);g.drawImage(bmp,0,0,c.width,c.height);
    const out=await new Promise(r=>c.toBlob(r,'image/jpeg',.88));
    const buf=new Uint8Array(await out.arrayBuffer());let s='';for(let i=0;i<buf.length;i+=0x8000)s+=String.fromCharCode.apply(null,buf.subarray(i,i+0x8000));
    return btoa(s);
  }
  function parseLoose(t){
    try{return JSON.parse(t);}catch(e){}
    const f=t.match(/```(?:json)?\s*([\s\S]*?)```/);if(f){try{return JSON.parse(f[1]);}catch(e){}}
    const a=t.search(/[\[{]/),b=Math.max(t.lastIndexOf('}'),t.lastIndexOf(']'));
    if(a>=0&&b>a)return JSON.parse(t.slice(a,b+1));
    throw new Error('no json');
  }
  function makeSample(){
    const sample=async(input,opts={})=>{
      const cfg=getCfg();if(!cfg.key)throw{code:'not_granted',message:'no api key'};
      let msgs=typeof input==='string'?[{role:'user',content:input}]:input.map(m=>({role:m.role,content:m.content}));
      const imgs=opts.images?(opts.images instanceof Blob?[opts.images]:Array.from(opts.images)):[];
      if(imgs.length){const blocks=[];for(const b of imgs)blocks.push({type:'image',source:{type:'base64',media_type:'image/jpeg',data:await toJpegB64(b)}});
        const last=msgs.length-1;msgs[last]={role:'user',content:[...blocks,{type:'text',text:msgs[last].content}]};}
      let res;
      try{res=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',signal:opts.signal,
        headers:{'content-type':'application/json','x-api-key':cfg.key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
        body:JSON.stringify({model:cfg.model||DEFAULT_MODEL,max_tokens:8000,messages:msgs})});}
      catch(e){if(opts.signal&&opts.signal.aborted)throw{code:'cancelled',message:'aborted'};throw{code:'upstream_error',message:String(e)};}
      if(!res.ok){const t=await res.text().catch(()=>'');
        throw{code:(res.status===401||res.status===403)?'bad_key':res.status===429?'rate_limited':res.status===413?'prompt_too_large':res.status===404?'bad_model':'upstream_error',message:t};}
      const data=await res.json();const text=(data.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('');
      if(!text.trim())throw{code:'empty_completion',message:'empty'};
      if(typeof opts.onText==='function'){try{opts.onText({text,delta:text});}catch(e){}}
      return{text,truncated:data.stop_reason==='max_tokens',modelTierApplied:'default'};
    };
    sample.json=async(input,opts)=>{const{text}=await sample(input,opts);try{return parseLoose(text);}catch(e){throw{code:'invalid_json',message:'invalid json',text};}};
    sample.limits=async()=>({maxPromptBytes:262144,images:{maxCount:5,maxInputBytes:20e6,mediaTypes:['image/jpeg','image/png','image/webp','image/gif']}});
    return sample;
  }
  const downloads={save:async({filename,data})=>{
    const blob=data instanceof Blob?data:new Blob([data]);const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),5000);}};

  if(!window.claude){
    window.claude={use:async name=>{
      if(name==='sample')return getCfg().key?makeSample():null;
      if(name==='downloads')return downloads;
      return null; // db, user, ...: local-only build
    }};
  }

  /* ---------- settings dialog ---------- */
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function backup(){
    const out={app:'taxwiz',version:3,exportedAt:new Date().toISOString(),data:{}};
    for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k.startsWith('taxwiz.v3'))out.data[k]=localStorage.getItem(k);}
    downloads.save({filename:`taxwiz-backup-${new Date().toISOString().slice(0,10)}.json`,data:new Blob([JSON.stringify(out,null,1)],{type:'application/json'})});
  }
  async function restore(file){
    try{const o=JSON.parse(await file.text());if(o.app!=='taxwiz'||!o.data)throw 0;
      if(!confirm('לשחזר את הגיבוי? הנתונים הנוכחיים במכשיר הזה יוחלפו בשנים שבגיבוי.'))return;
      Object.entries(o.data).forEach(([k,v])=>{if(k.startsWith('taxwiz.v3'))localStorage.setItem(k,v);});location.reload();}
    catch(e){alert('הקובץ אינו גיבוי תקין של האשף.');}
  }
  function openSettings(){
    let d=document.getElementById('settings');
    if(!d){d=document.createElement('dialog');d.id='settings';d.setAttribute('aria-labelledby','setTitle');document.body.appendChild(d);
      d.addEventListener('click',e=>{if(e.target===d)d.close();});}
    const c=getCfg();
    d.innerHTML=`<div style="padding:20px 22px;max-width:560px">
      <h2 id="setTitle" style="font-family:var(--serif);margin:0 0 12px">הגדרות</h2>
      <h3 style="margin:0 0 4px;font-size:17px">פענוח אוטומטי ויועץ</h3>
      <p class="hint" style="margin:0 0 10px">טפסי PDF דיגיטליים מפוענחים גם בלי מפתח, לפי קודי השדות שבטקסט. לסריקות, לצילומים ולפענוח מדויק יותר, הזינו מפתח API של Anthropic. המפתח נשמר רק בדפדפן הזה, והמסמך נשלח ל־Anthropic רק כשמפענחים או שואלים את היועץ.</p>
      <label class="f">מפתח API<input type="password" id="setKey" autocomplete="off" value="${esc(c.key)}" placeholder="sk-ant-..."></label>
      <label class="f" style="margin-top:10px">מודל<input type="text" id="setModel" value="${esc(c.model)}"></label>
      <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button class="btn small" id="setSave">שמירה</button><button class="btn ghost small" id="setTest">בדיקת חיבור</button><button class="btn ghost small" id="setDel">מחיקת המפתח</button></div>
      <p id="setMsg" class="hint" role="status" style="min-height:1.4em;margin:8px 0 0"></p>
      <h3 style="margin:16px 0 4px;font-size:17px">גיבוי והעברה בין מכשירים</h3>
      <p class="hint" style="margin:0 0 10px">הנתונים נשמרים במכשיר הזה בלבד. כדי להעביר למכשיר אחר, שמרו גיבוי ופתחו אותו שם. המפתח לא נכלל בגיבוי.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn ghost small" id="setBackup">שמירת גיבוי</button><button class="btn ghost small" id="setRestore">שחזור מגיבוי</button><input type="file" id="setFile" accept="application/json,.json" class="hidden"></div>
      <div style="display:flex;justify-content:flex-end;margin-top:18px"><button class="btn" id="setClose">סגירה</button></div></div>`;
    const msg=t=>{d.querySelector('#setMsg').textContent=t;};
    const changed=()=>window.dispatchEvent(new Event('ai-config-changed'));
    d.querySelector('#setSave').onclick=()=>{setCfg({key:d.querySelector('#setKey').value.trim(),model:d.querySelector('#setModel').value.trim()||DEFAULT_MODEL});msg('נשמר.');changed();};
    d.querySelector('#setDel').onclick=()=>{setCfg({key:'',model:getCfg().model});d.querySelector('#setKey').value='';msg('המפתח נמחק.');changed();};
    d.querySelector('#setTest').onclick=async()=>{setCfg({key:d.querySelector('#setKey').value.trim(),model:d.querySelector('#setModel').value.trim()||DEFAULT_MODEL});changed();msg('בודק…');
      try{await makeSample()('Reply with the single word OK');msg('החיבור תקין.');}
      catch(e){msg({bad_key:'המפתח נדחה. בדקו שהעתקתם אותו במלואו.',bad_model:'שם המודל לא נמצא. בדקו את שם המודל.',rate_limited:'יותר מדי בקשות, או שנגמרה המכסה בחשבון.',not_granted:'הזינו מפתח.'}[e.code]||'החיבור נכשל. בדקו את החיבור לאינטרנט.');}};
    d.querySelector('#setBackup').onclick=backup;
    d.querySelector('#setRestore').onclick=()=>d.querySelector('#setFile').click();
    d.querySelector('#setFile').onchange=e=>{const f=e.target.files[0];if(f)restore(f);e.target.value='';};
    d.querySelector('#setClose').onclick=()=>d.close();
    if(!d.open)d.showModal();
  }
  document.addEventListener('DOMContentLoaded',()=>{
    const slot=document.querySelector('header.top > div:last-child');
    if(slot){const b=document.createElement('button');b.className='btn ghost small';b.id='settingsBtn';b.textContent='הגדרות';b.onclick=openSettings;slot.appendChild(b);}
    const st=document.createElement('style');st.textContent='dialog#settings{border:0;padding:0;border-radius:16px;background:var(--surface);color:var(--ink);width:min(600px,94vw)}dialog#settings::backdrop{background:rgba(10,20,22,.55)}dialog#settings input[type=password],dialog#settings input#setModel{font:inherit;font-size:16px;color:var(--ink);background:var(--sunk);border:1px solid var(--line);border-radius:8px;padding:9px 11px;width:100%;direction:ltr;text-align:left}';document.head.appendChild(st);
  });
  if('serviceWorker' in navigator&&location.protocol.startsWith('http'))window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
})();
