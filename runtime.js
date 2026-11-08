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
      <h3 style="margin:16px 0 4px;font-size:17px">בדיקת תקינות</h3>
      <p class="hint" style="margin:0 0 8px">בודק שכל רכיבי הפענוח נמצאים באתר ונטענים: קריאת PDF, זיהוי טקסט ונתוני העברית.</p>
      <button class="btn ghost small" id="setHealth">הרצת בדיקה</button>
      <pre id="healthOut" style="white-space:pre-wrap;font-size:13px;margin:8px 0 0;direction:rtl"></pre>
      <h3 style="margin:16px 0 4px;font-size:17px">גרסה ועדכונים</h3>
      <p class="hint" style="margin:0 0 10px">הגרסה שפועלת עכשיו: <b><bdi dir="ltr">${APP_VERSION}</bdi></b>. אם העלית גרסה חדשה והיא לא מופיעה, "עדכון מלא" מוחק את העותק השמור של האפליקציה וטוען אותה מחדש. הנתונים שלך לא נמחקים.</p>
      <button class="btn ghost small" id="setRefresh">עדכון מלא</button>
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
    d.querySelector('#setHealth').onclick=async()=>{const out=d.querySelector('#healthOut');out.textContent='בודק…';const L=[];
      const files=['pdf.min.js','pdf.worker.min.js','tesseract.min.js','worker.min.js','./tesseract-core-lstm.wasm.js','./tesseract-core-simd-lstm.wasm.js','./heb.traineddata.gz','./eng.traineddata.gz','pdf-lib.min.js','fontkit.umd.min.js'];
      let miss=0;for(const f of files){try{const r=await fetch(f+'?check='+Date.now(),{method:'HEAD',cache:'no-store'});if(!r.ok){miss++;L.push('✗ חסר באתר: '+f);}}catch(e){miss++;L.push('✗ לא נגיש: '+f);}}
      let fm=0;for(const k of ['135-2025','1301-2025']){try{const r=await fetch(''+k+'.pdf',{method:'HEAD',cache:'no-store'});if(!r.ok)fm++;}catch(e){fm++;}}
      if(!miss)L.push('✓ כל קובצי הפענוח נמצאים באתר');
      else L.push(`⚠ ${miss} קבצים חסרים. האפליקציה תטען אותם מהאינטרנט (CDN), אז הפענוח יעבוד, אבל לא בלי חיבור. כדי לתקן: להעלות את התיקייה vendor למאגר, באותה רמה של index.html.`);
      L.push(fm?'✗ הטפסים הרשמיים חסרים (התיקייה forms). דפי מילוי יעבדו, מילוי הטופס הרשמי לא.':'✓ הטפסים הרשמיים נמצאים באתר');
      if(!window.pdfjsLib&&typeof ensurePdfJs==='function')await ensurePdfJs();
      L.push(window.pdfjsLib?'✓ קריאת PDF נטענה':'✗ קריאת PDF לא נטענה');
      {try{out.textContent=L.join('\n')+'\nבודק זיהוי טקסט (עד דקה בפעם הראשונה)…';const w=await getOcr();
        const c=document.createElement('canvas');c.width=900;c.height=200;const g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,900,200);g.fillStyle='#000';g.font='56px Arial, sans-serif';g.fillText('158     42,772',80,120);
        const {data}=await w.recognize(await new Promise(res=>c.toBlob(res)));L.push(/158/.test(data.text)&&/772/.test(data.text)?'✓ זיהוי טקסט עובד':'⚠ זיהוי טקסט רץ, אבל קרא רק: '+data.text.trim()+' (בבדיקה הזו זה לא בהכרח תקלה; נסו טופס אמיתי)');}
        catch(e){L.push('✗ זיהוי טקסט נכשל: '+(e&&e.message||e));}}
      L.push('גרסה: '+APP_VERSION+(getCfg().key?' · מפתח API מוגדר':' · בלי מפתח API'));
      out.textContent=L.join('\n');};
    d.querySelector('#setRefresh').onclick=async()=>{msg('מעדכן…');
      try{const regs=await navigator.serviceWorker?.getRegistrations?.()||[];await Promise.all(regs.map(x=>x.unregister()));
        const ks=await caches.keys();await Promise.all(ks.map(k=>caches.delete(k)));}catch(e){}
      location.replace(location.pathname+'?v='+Date.now());};
    if(!d.open)d.showModal();
  }
  document.addEventListener('DOMContentLoaded',()=>{
    const slot=document.querySelector('header.top > div:last-child');
    if(slot){const b=document.createElement('button');b.className='btn ghost small';b.id='settingsBtn';b.textContent='הגדרות';b.onclick=openSettings;slot.appendChild(b);}
    const st=document.createElement('style');st.textContent='dialog#settings{border:0;padding:0;border-radius:16px;background:var(--surface);color:var(--ink);width:min(600px,94vw)}dialog#settings::backdrop{background:rgba(10,20,22,.55)}dialog#settings input[type=password],dialog#settings input#setModel{font:inherit;font-size:16px;color:var(--ink);background:var(--sunk);border:1px solid var(--line);border-radius:8px;padding:9px 11px;width:100%;direction:ltr;text-align:left}';document.head.appendChild(st);
  });
  if('serviceWorker' in navigator&&location.protocol.startsWith('http'))window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));

  /* ---------- distribution build: version, local OCR, terms, updates ---------- */
  window.CDN_FALLBACK={ // used only when a bundled file is missing on the site (needs internet)
    'html2canvas.min.js':'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
    'jspdf.umd.min.js':'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    'pdf-lib.min.js':'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js',
    'fontkit.umd.min.js':'https://cdn.jsdelivr.net/npm/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js',
    'assistant-hebrew-400-normal.woff':'https://cdn.jsdelivr.net/npm/@fontsource/assistant@5.1.0/files/assistant-hebrew-400-normal.woff',
    'tesseract.min.js':'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js'
  };
  const APP_VERSION='1.0.8-beta';
  const TERMS_VER='1';

  /* local OCR for scans and photos (Tesseract, Hebrew) — runs in the browser, nothing is uploaded */
  let ocrWorker=null;
  let ocrLocal=null;
  async function getOcr(onProg){
    if(ocrLocal===null){try{const h=await fetch('./heb.traineddata.gz',{method:'HEAD',cache:'no-store'});ocrLocal=h.ok;}catch(e){ocrLocal=false;}}
    if(!window.Tesseract)await new Promise((res,rej)=>{const sc=document.createElement('script');sc.src=ocrLocal?'tesseract.min.js':window.CDN_FALLBACK['tesseract.min.js'];sc.onload=res;sc.onerror=rej;document.head.appendChild(sc);});
    // bundled files when present; otherwise tesseract.js defaults (worker, core and language data from jsDelivr)
    const paths=ocrLocal?{workerPath:'worker.min.js',corePath:'.',langPath:'.',gzip:true}:{};
    if(!ocrWorker)ocrWorker=await Tesseract.createWorker(['heb','eng'],1,{...paths,
      logger:m=>{if(m.status==='recognizing text'&&window.__ocrProg)window.__ocrProg(Math.round(m.progress*100));}});
    return ocrWorker;
  }
  window.maybeOcr=async function(doc,text,imgs,force){
    const real=String(text||'').replace(/\s|-|עמוד|\d/g,'').length;
    if(!imgs||!imgs.length||(real>=60&&!force))return text;
    const tick=pct=>{doc.err=`מזהה טקסט בצילום, במכשיר שלך… ${pct}%`;try{render();}catch(e){}};
    try{
      tick(0);const w=await getOcr();let out='';
      for(let i=0;i<imgs.length;i++){window.__ocrProg=pct=>tick(Math.round((i*100+pct)/imgs.length));const {data}=await w.recognize(imgs[i]);out+=data.text+'\n';}
      window.__ocrProg=null;doc.ocr=true;
      try{RAW.set(doc.id,out);}catch(e){}
      return out;
    }catch(e){window.__ocrProg=null;doc.ocrFailed=true;doc.ocrErr=(e&&(e.message||e.type))?String(e.message||e.type).slice(0,120):'רכיב זיהוי הטקסט לא נטען';return text;}
  };

  const TERMS_HTML=`<h2 id="termsTitle" style="font-family:var(--serif);margin:0 0 8px">תנאי שימוש</h2>
   <p style="margin:0 0 10px;color:var(--muted)">גרסה <bdi dir="ltr">${APP_VERSION}</bdi>. גרסת בטא.</p>
   <ol style="padding-inline-start:20px;margin:0;line-height:1.6">
    <li><b>כלי עזר בלבד.</b> האשף מחשב הערכה לפי כללי רשות המסים לשנה שנבחרה. הוא אינו ייעוץ מס, אינו ייצוג ואינו מחליף רואה חשבון או יועץ מס.</li>
    <li><b>לא רשמי.</b> הכלי אינו של רשות המסים ואינו קשור אליה. הטפסים הרשמיים מצורפים ללא שינוי, לצורך מילוי בלבד.</li>
    <li><b>האחריות שלך.</b> לפני הגשה צריך לבדוק כל נתון מול המסמכים, ומומלץ להשוות לסימולטור הרשמי של רשות המסים. בקשת החזר פותחת את השנה לבדיקה, ועלולה להסתיים גם בחיוב.</li>
    <li><b>מגבלות ידועות.</b> החישוב שנתי ולא חודשי. אין חישוב טופס 134, משמרות, פטור נכות והכנסות מחו״ל. לעצמאים, החלוקה של הפקדות הפנסיה בין ניכוי לזיכוי משוערת. פענוח צילומים במכשיר עלול לטעות, ולכן כל שדה עובר בקרה.</li>
    <li><b>פרטיות.</b> הנתונים והמסמכים נשמרים רק בדפדפן שלך, ולא נשלחים לשום שרת. אם הגדרת מפתח API, מסמך נשלח ל־Anthropic רק כשמפענחים אותו או שואלים את היועץ. מספרי זהות ופרטי בנק נשמרים רק אם בחרת בכך.</li>
    <li><b>בלי אחריות.</b> הכלי מסופק כמות שהוא. המפתחים אינם אחראים לנזק שייגרם מהשימוש בו או מהסתמכות על תוצאותיו.</li>
   </ol>`;
  function showTerms(force){
    let d=document.getElementById('terms');
    if(!d){d=document.createElement('dialog');d.id='terms';d.setAttribute('aria-labelledby','termsTitle');document.body.appendChild(d);}
    const agreed=localStorage.getItem('taxwiz.terms')===TERMS_VER;
    d.innerHTML=`<div style="padding:20px 22px;max-width:640px">${TERMS_HTML}
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px">${agreed?'<button class="btn" id="termsClose">סגירה</button>':'<button class="btn" id="termsOk">קראתי ואני מסכים/ה</button>'}</div></div>`;
    d.addEventListener('cancel',e=>{if(!agreed)e.preventDefault();});
    const ok=d.querySelector('#termsOk');if(ok)ok.onclick=()=>{try{localStorage.setItem('taxwiz.terms',TERMS_VER);}catch(e){}d.close();};
    const cl=d.querySelector('#termsClose');if(cl)cl.onclick=()=>d.close();
    if(!d.open&&(force||!agreed))d.showModal();
  }
  function banner(html,btn,onClick){
    let b=document.getElementById('appBanner');
    if(!b){b=document.createElement('div');b.id='appBanner';b.setAttribute('role','status');document.body.appendChild(b);}
    b.innerHTML=`<span>${html}</span>${btn?`<button class="btn small" id="appBannerBtn">${btn}</button>`:''}<button class="btn ghost small" id="appBannerX" aria-label="סגירה">×</button>`;
    if(btn)b.querySelector('#appBannerBtn').onclick=onClick;b.querySelector('#appBannerX').onclick=()=>b.remove();
  }
  document.addEventListener('DOMContentLoaded',()=>{
    const st=document.createElement('style');st.textContent=`dialog#terms{border:0;padding:0;border-radius:16px;background:var(--surface);color:var(--ink);width:min(680px,94vw)}dialog#terms::backdrop{background:rgba(10,20,22,.55)}
      #appBanner{position:fixed;inset-inline:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:60;display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;background:var(--surface);border:1px solid var(--line);border-inline-start:4px solid var(--warn);border-radius:12px;padding:10px 14px;box-shadow:0 8px 30px rgba(0,0,0,.18)}
      .beta{font-size:12px;font-weight:700;color:var(--warn);border:1px solid currentColor;border-radius:999px;padding:1px 8px;vertical-align:middle;margin-inline-start:8px}`;
    document.head.appendChild(st);
    const h1=document.querySelector('header.top h1');if(h1)h1.insertAdjacentHTML('beforeend',`<span class="beta" title="גרסה ${APP_VERSION}">בטא <bdi dir="ltr">${APP_VERSION.replace('-beta','')}</bdi></span>`);
    const slot=document.querySelector('header.top > div:last-child');
    if(slot){const t=document.createElement('button');t.className='btn ghost small';t.textContent='תנאי שימוש';t.onclick=()=>showTerms(true);slot.appendChild(t);}
    showTerms(false);
    // tax data not yet updated for the last closed year
    try{const last=new Date().getFullYear()-1;const max=Math.max(...YEARS);
      if(last>max)banner(`נתוני המס באפליקציה עודכנו עד שנת ${max}. לשנת ${last} החישוב עלול להיות שגוי עד שתתעדכן הגרסה.`);}catch(e){}
  });
  // new version: the service worker activates itself; tell the user to reload
  if('serviceWorker' in navigator&&location.protocol.startsWith('http')){
    const hadController=!!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange',()=>{if(hadController)banner('הותקנה גרסה חדשה של האפליקציה.','רענון',()=>location.reload());});
    window.addEventListener('load',()=>{navigator.serviceWorker.getRegistration().then(r=>{if(!r)return;
      document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')r.update().catch(()=>{});});
      setInterval(()=>r.update().catch(()=>{}),60*60*1000);});});
  }
})();
