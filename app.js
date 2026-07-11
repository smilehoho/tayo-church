/* 따요 처치 출석 PoC — 스캔·저장·동기화 로직 (외부 의존성 없음, html5-qrcode 만 사용) */
(function(){
  "use strict";
  var CFG = window.TAYO_CONFIG || { CHURCH:"따요 처치", ENDPOINT:"" };

  /* ---------- 작은 유틸 ---------- */
  function $(id){ return document.getElementById(id); }
  function pad(n){ return String(n).padStart(2,"0"); }
  function todayStr(){ var d=new Date(); return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate()); }
  function timeStr(ts){ var d=new Date(ts); return pad(d.getHours())+":"+pad(d.getMinutes()); }
  function deviceId(){
    var k="tayo_device_id", v=localStorage.getItem(k);
    if(!v){ v="T-"+Math.random().toString(36).slice(2,7).toUpperCase(); localStorage.setItem(k,v); }
    return v;
  }
  // QR 문자열에서 성도 번호만 뽑음: "MEMBER-0142" / "BAND-0142" / "0142" -> "0142"
  function normalizeCode(text){
    var t=String(text).trim();
    var m=t.match(/(\d{2,})\s*$/);
    return m ? m[1] : t;
  }

  /* ---------- IndexedDB (오프라인 저장소) ---------- */
  var DB_NAME="tayo-attendance", STORE="scans", db=null;
  function idb(){
    return new Promise(function(res,rej){
      if(db) return res(db);
      var req=indexedDB.open(DB_NAME,1);
      req.onupgradeneeded=function(e){
        var d=e.target.result;
        if(!d.objectStoreNames.contains(STORE)){
          var os=d.createObjectStore(STORE,{keyPath:"key"});
          os.createIndex("byDate","date",{unique:false});
        }
      };
      req.onsuccess=function(){ db=req.result; res(db); };
      req.onerror=function(){ rej(req.error); };
    });
  }
  function store(mode){ return idb().then(function(d){ return d.transaction(STORE,mode).objectStore(STORE); }); }
  function idbGet(key){ return store("readonly").then(function(s){ return new Promise(function(res,rej){ var r=s.get(key); r.onsuccess=function(){res(r.result);}; r.onerror=function(){rej(r.error);}; }); }); }
  function idbPut(rec){ return store("readwrite").then(function(s){ return new Promise(function(res,rej){ var r=s.put(rec); r.onsuccess=function(){res();}; r.onerror=function(){rej(r.error);}; }); }); }
  function idbAll(){ return store("readonly").then(function(s){ return new Promise(function(res,rej){ var r=s.getAll(); r.onsuccess=function(){res(r.result||[]);}; r.onerror=function(){rej(r.error);}; }); }); }

  /* ---------- 소리·진동·토스트 피드백 ---------- */
  var audioCtx=null;
  function beep(ok){
    try{
      audioCtx = audioCtx || new (window.AudioContext||window.webkitAudioContext)();
      var o=audioCtx.createOscillator(), g=audioCtx.createGain();
      o.frequency.value = ok?880:280; o.connect(g); g.connect(audioCtx.destination);
      g.gain.setValueAtTime(.15, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(.0001, audioCtx.currentTime+.18);
      o.start(); o.stop(audioCtx.currentTime+.19);
    }catch(e){}
    if(navigator.vibrate) navigator.vibrate(ok?80:[40,40,40]);
  }
  var toastTimer=null;
  function toast(msg,kind){
    var el=$("toast"); el.textContent=msg; el.className="toast "+(kind||""); el.hidden=false;
    clearTimeout(toastTimer); toastTimer=setTimeout(function(){ el.hidden=true; },1800);
  }

  /* ---------- 출석 기록 ---------- */
  var lastText="", lastAt=0;
  function recordScan(rawText, source){
    var now=Date.now();
    if(rawText===lastText && (now-lastAt)<2500) return;   // 연속 중복 스캔 무시
    lastText=rawText; lastAt=now;

    var code=normalizeCode(rawText);
    if(!code){ toast("코드를 읽지 못했어요","bad"); beep(false); return; }
    var date=todayStr();
    var key=date+"__"+code;                                 // 같은 사람·같은 날 = 1건
    idbGet(key).then(function(existing){
      if(existing){ beep(true); toast(code+" · 이미 출석했어요","dup"); return; }
      var rec={ key:key, code:code, date:date, ts:now, device:deviceId(), source:source||"scan", synced:false };
      idbPut(rec).then(function(){
        beep(true); toast(code+" · 출석 완료 ✓","ok"); refresh();
        if(navigator.onLine && CFG.ENDPOINT) sync();
      });
    });
  }

  /* ---------- QR 스캐너 (html5-qrcode) ---------- */
  var scanner=null, scanning=false;
  // qrbox 를 영상 크기에 맞춰 계산 (작은 폰에서도 안전)
  var scanCfg={ fps:10, qrbox:function(vw,vh){ var m=Math.floor(Math.min(vw,vh)*0.72); return {width:m,height:m}; } };
  function onScan(text){ recordScan(text,"scan"); }
  function camMsg(html){ var el=$("scanhint"); el.hidden=false; el.innerHTML=html; }
  function startWith(constraint, isRetry){
    scanner.start(constraint, scanCfg, onScan, function(){ /* 프레임별 미검출은 무시 */ })
      .then(function(){
        scanning=true;
        $("toggle").textContent="스캔 정지"; $("toggle").classList.add("on"); $("scanhint").hidden=true;
      })
      .catch(function(err){
        if(!isRetry){ startWith({facingMode:"user"}, true); }   // 후면 카메라 없을 때 전면으로 재시도
        else { camMsg("카메라를 열 수 없어요<br><small>"+(err&&err.name?err.name+": "+err.message:String(err))+"</small>"); toast("카메라 오류","bad"); }
      });
  }
  function startScan(){
    if(scanning) return;
    if(typeof Html5Qrcode==="undefined"){ camMsg("스캐너 로드 실패 — 새로고침 해보세요"); return; }
    if(!window.isSecureContext){ camMsg("보안 연결(HTTPS)이 아니어서<br>카메라를 쓸 수 없어요"); return; }
    if(!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)){
      camMsg("이 브라우저에서 카메라 API를 쓸 수 없어요<br><small>(인증서 신뢰가 필요할 수 있어요)</small>"); return;
    }
    scanner = scanner || new Html5Qrcode("reader");
    camMsg("카메라 준비 중…");
    startWith({facingMode:"environment"}, false);
  }
  function stopScan(){
    if(!scanning||!scanner) return;
    scanner.stop().then(function(){ try{scanner.clear();}catch(e){} }).finally(function(){
      scanning=false; $("toggle").textContent="스캔 시작"; $("toggle").classList.remove("on"); $("scanhint").hidden=false;
    });
  }

  /* ---------- 서버 동기화 (엔드포인트 설정 시) ---------- */
  var syncing=false;
  function setServerState(msg,kind){ var el=$("serverState"); el.textContent=msg; el.className="muted "+(kind||""); }
  function sync(){
    if(syncing) return;
    if(!CFG.ENDPOINT){ setServerState("서버 미설정 — 폰에만 저장 중","warn"); return; }
    if(!navigator.onLine){ setServerState("오프라인 — 연결되면 자동 전송","warn"); return; }
    idbAll().then(function(all){
      var pending=all.filter(function(r){ return !r.synced; });
      if(!pending.length){ setServerState("모두 전송됨 ✓","ok"); return; }
      syncing=true; setServerState("동기화 중… ("+pending.length+"건)","");
      var payload={ church:CFG.CHURCH, device:deviceId(), token:CFG.TOKEN||"",
        records:pending.map(function(r){ return {code:r.code,date:r.date,ts:r.ts,source:r.source}; }) };
      // text/plain 으로 보내 CORS preflight 를 피함 (Apps Script 호환)
      fetch(CFG.ENDPOINT, { method:"POST", headers:{"Content-Type":"text/plain;charset=utf-8"}, body:JSON.stringify(payload) })
        .then(function(res){ return res.text(); })
        .then(function(){ return Promise.all(pending.map(function(r){ r.synced=true; return idbPut(r); })); })
        .then(function(){ setServerState("동기화 완료 ✓","ok"); refresh(); })
        .catch(function(){ setServerState("전송 실패 — 연결되면 재시도","bad"); })
        .finally(function(){ syncing=false; });
    });
  }

  /* ---------- 화면 갱신 ---------- */
  function refresh(){
    idbAll().then(function(all){
      var t=todayStr();
      var todays=all.filter(function(r){ return r.date===t; });
      $("cntToday").textContent=todays.length;
      $("cntPending").textContent=all.filter(function(r){ return !r.synced; }).length;
      var ul=$("recent"); ul.innerHTML="";
      var recent=todays.slice().sort(function(a,b){ return b.ts-a.ts; }).slice(0,8);
      if(!recent.length){ ul.innerHTML='<li class="empty">아직 없음</li>'; return; }
      recent.forEach(function(r){
        var li=document.createElement("li");
        var rc=document.createElement("span"); rc.className="rc"; rc.textContent=r.code;
        var rt=document.createElement("span"); rt.className="rt"; rt.textContent=timeStr(r.ts)+(r.synced?"":" · 대기");
        li.appendChild(rc); li.appendChild(rt); ul.appendChild(li);
      });
    });
  }

  /* ---------- 네트워크 상태 ---------- */
  function netUpdate(){
    var el=$("net"), on=navigator.onLine;
    el.textContent = on?"연결됨":"오프라인";
    el.className="pill "+(on?"on":"off");
    if(on && CFG.ENDPOINT) sync();
  }

  /* ---------- 초기화 ---------- */
  function init(){
    $("dev").textContent=deviceId();
    $("toggle").addEventListener("click", function(){ scanning?stopScan():startScan(); });
    $("sync").addEventListener("click", sync);
    $("manualForm").addEventListener("submit", function(e){
      e.preventDefault();
      var v=$("manualInput").value.trim();
      if(v){ recordScan(v,"manual"); $("manualInput").value=""; }
    });
    $("clearDay").addEventListener("click", function(){
      if(!confirm("오늘 기록을 지울까요? (테스트용)")) return;
      var t=todayStr();
      idbAll().then(function(all){
        return store("readwrite").then(function(s){
          all.forEach(function(r){ if(r.date===t) s.delete(r.key); });
          return new Promise(function(res){ s.transaction.oncomplete=function(){ res(); }; });
        });
      }).then(refresh);
    });
    window.addEventListener("online", netUpdate);
    window.addEventListener("offline", netUpdate);
    netUpdate();
    if(!CFG.ENDPOINT) setServerState("서버 미설정 — 폰에만 저장 중","warn");
    refresh();

    if("serviceWorker" in navigator){
      navigator.serviceWorker.register("./sw.js").catch(function(e){ console.warn("SW 등록 실패", e); });
    }
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
