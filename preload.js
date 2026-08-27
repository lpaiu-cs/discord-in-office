/* 리본 버튼 → 메인 프로세스 통로.

   주입 스크립트는 페이지의 메인 월드에서 돌기 때문에 ipcRenderer 에 직접 닿지
   못한다(contextIsolation 을 켠 채로 두려면 그래야 한다). 여기서 노출한 것만
   window.dioBridge 로 보인다.

   단축키와 메뉴는 이미 메인 프로세스가 처리하므로, 버튼도 같은 곳으로 보내야
   설정 저장·메뉴 라벨 갱신이 한 경로로 모인다. 렌더러에서 혼자 토글하면
   그 둘이 어긋난다. */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dioBridge', {
  toggleEmoji: () => ipcRenderer.send('dio:toggle-emoji'),
  togglePanels: () => ipcRenderer.send('dio:toggle-panels')
});
