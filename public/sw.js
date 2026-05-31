self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  // PWA 설치 조건을 충족하기 위한 최소한의 fetch 이벤트 리스너입니다.
});