/**
 * 따요 처치 출석 PoC — Google Apps Script 웹앱 백엔드 (다음 단계용)
 *
 * [사용법]
 * 1) Google Sheets 새 문서 생성 → 확장 프로그램 > Apps Script
 * 2) 이 코드를 붙여넣고 저장
 * 3) 배포 > 새 배포 > 유형 '웹 앱'
 *      - 실행 계정: 나
 *      - 액세스 권한: 모든 사용자
 * 4) 배포 후 나오는 웹 앱 URL(.../exec)을 attendance-pwa/config.js 의 ENDPOINT 에 입력
 *
 * PWA 가 보내는 형식(JSON, text/plain):
 *   { church, device, token, records:[ { code, date, ts, source }, ... ] }
 *
 * [중복 안전장치] date+code+device 가 같으면 다시 저장하지 않습니다(오프라인 재전송 대비).
 *
 * [공유 토큰 보호] 자동 스캔봇의 무단 쓰기를 줄이기 위한 선택적 장치입니다.
 *   - Apps Script 편집기 > 프로젝트 설정(톱니) > 스크립트 속성 에서
 *     이름 SHARED_TOKEN, 값은 config.js 의 TOKEN 과 똑같이 넣고 저장한 뒤 재배포하세요.
 *   - 스크립트 속성 SHARED_TOKEN 이 설정돼 있으면, 토큰이 일치하지 않는 요청은 거부합니다.
 *   - 설정하지 않으면(속성 없음) 검증을 건너뜁니다(기존 동작 유지).
 */
var SHEET_NAME = "출석";
var HEADERS = ["기록시각", "출석일", "성도번호", "기기", "방식", "교회"];

function doPost(e){
  var lock = LockService.getScriptLock();
  lock.tryLock(20000);
  try{
    var body = JSON.parse(e.postData.contents);
    // 공유 토큰 검증: 스크립트 속성에 SHARED_TOKEN 이 있으면 요청 토큰과 일치해야 함
    var expected = PropertiesService.getScriptProperties().getProperty("SHARED_TOKEN");
    if(expected && String(body.token || "") !== expected){
      return json_({ ok:false, error:"unauthorized" });
    }
    var sheet = getSheet_();
    var seen = existingKeys_(sheet);           // "date__code__device" 집합
    var now = new Date();
    var saved = 0, skipped = 0;
    (body.records || []).forEach(function(r){
      var key = r.date + "__" + String(r.code) + "__" + (body.device || "");
      if(seen[key]){ skipped++; return; }       // 이미 있으면 건너뜀
      sheet.appendRow([ now, r.date, "'" + String(r.code), body.device || "", r.source || "scan", body.church || "" ]);
      seen[key] = true; saved++;
    });
    return json_({ ok:true, saved:saved, skipped:skipped });
  }catch(err){
    return json_({ ok:false, error:String(err) });
  }finally{
    lock.releaseLock();
  }
}

function doGet(){ return json_({ ok:true, service:"tayo-attendance" }); }

function getSheet_(){
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if(!sh){ sh = ss.insertSheet(SHEET_NAME); sh.appendRow(HEADERS); }
  return sh;
}

function existingKeys_(sheet){
  var out = {};
  var last = sheet.getLastRow();
  if(last < 2) return out;
  // 열: [기록시각, 출석일, 성도번호, 기기, ...]
  var rows = sheet.getRange(2, 2, last - 1, 3).getValues(); // 출석일, 성도번호, 기기
  rows.forEach(function(row){
    var date = row[0], code = String(row[1]).replace(/^'/, ""), dev = row[2];
    out[date + "__" + code + "__" + dev] = true;
  });
  return out;
}

function json_(obj){
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
