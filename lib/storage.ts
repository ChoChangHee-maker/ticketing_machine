import { parseState, STORAGE_KEY, type AppState } from './booking';

export function readState(): AppState {
  try { return parseState(window.localStorage.getItem(STORAGE_KEY)); }
  catch (error) {
    if (error instanceof DOMException) throw new Error('브라우저 저장 공간을 사용할 수 없습니다. 사이트 저장 권한을 확인해주세요.');
    throw error;
  }
}

// Serialize cooperating tabs. This is a device-local demo, not server inventory.
export async function updateState(transform: (state: AppState) => AppState): Promise<AppState> {
  const update = () => {
    const next = transform(readState());
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); }
    catch { throw new Error('저장 공간이 부족하거나 차단되어 예매를 저장하지 못했습니다. 브라우저 설정을 확인해주세요.'); }
    return next;
  };
  return navigator.locks ? navigator.locks.request(STORAGE_KEY, update) : update();
}
