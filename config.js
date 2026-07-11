/* 따요 처치 출석 PoC — 설정
 * Google Apps Script 웹앱을 배포한 뒤, 그 URL(.../exec)을 ENDPOINT 에 넣으세요.
 * 비워두면("") 서버 전송 없이 폰(IndexedDB)에만 저장합니다. (1차 localhost PoC 기본값)
 *
 * TOKEN: 서버(Apps Script)와 공유하는 비밀 토큰입니다. 자동 스캔봇의 무단 쓰기를 줄입니다.
 *   - 이 값과 똑같은 값을 Apps Script 편집기의 '프로젝트 설정 > 스크립트 속성'에
 *     SHARED_TOKEN 이라는 이름으로 넣고 재배포해야 검증이 켜집니다.
 *   - 주의: 이 파일은 브라우저로 내려가는 클라이언트 코드라 토큰이 완전 비밀은 아닙니다.
 *     자동 봇 차단용이며, 완벽 차단이 필요하면 저장소를 비공개로 두세요.
 */
window.TAYO_CONFIG = {
  CHURCH: "따요 처치",
  ENDPOINT: "https://script.google.com/macros/s/AKfycbxQlmNmEANk2PnkAOE3pWGU-DymG8O5OadG9JDrGsZYw1u-vL9WnOpqZkSPy6sk3N2Y/exec",
  TOKEN: "1efff3f460f7c180795f82d741edd999"
};
