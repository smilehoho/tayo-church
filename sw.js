/* 따요 처치 출석 PoC — 서비스 워커 (오프라인 캐싱) */
var CACHE = "tayo-att-v4";
var ASSETS = [
  "./", "./index.html", "./app.js", "./config.js",
  "./manifest.webmanifest", "./icon.svg", "./proposal.html",
  "./vendor/html5-qrcode.min.js"
];

// 설치: 앱 껍데기를 폰에 저장
self.addEventListener("install", function(e){
  e.waitUntil(
    caches.open(CACHE).then(function(c){ return c.addAll(ASSETS); }).then(function(){ return self.skipWaiting(); })
  );
});

// 활성화: 옛 캐시 정리
self.addEventListener("activate", function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k!==CACHE; }).map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

// 요청 처리: 캐시 우선, 없으면 네트워크
self.addEventListener("fetch", function(e){
  var req = e.request;
  if(req.method !== "GET") return;                 // 동기화 POST 등은 그대로 네트워크
  var url = new URL(req.url);
  if(url.origin !== self.location.origin) return;  // 외부(서버 엔드포인트 등)는 캐시 안 함

  if(req.mode === "navigate"){                      // 페이지 열기
    // 요청한 실제 경로를 우선 존중(proposal.html 등): 캐시 → 네트워크 →
    // 둘 다 실패하면(오프라인·미캐시) 앱 껍데기(index.html)로 폴백
    e.respondWith(
      caches.match(req).then(function(cached){
        return cached || fetch(req).catch(function(){ return caches.match("./index.html"); });
      })
    );
    return;
  }
  e.respondWith(
    caches.match(req).then(function(cached){
      return cached || fetch(req).then(function(res){
        var copy = res.clone();
        caches.open(CACHE).then(function(c){ c.put(req, copy); });
        return res;
      }).catch(function(){ return cached; });
    })
  );
});
