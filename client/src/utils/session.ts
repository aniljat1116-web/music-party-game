const TOKEN_KEY = 'mpg_session_token';
const ROOM_KEY = 'mpg_room_code';

export function saveSession(token: string, roomCode: string): void {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(ROOM_KEY, roomCode.toUpperCase());
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(ROOM_KEY, roomCode.toUpperCase());
  } catch (e) {
    console.error('Failed to save session to storage', e);
  }
}

export function getSavedSession(): { token: string | null; roomCode: string | null } {
  try {
    const token = sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
    const roomCode = sessionStorage.getItem(ROOM_KEY) || localStorage.getItem(ROOM_KEY);
    return { token, roomCode };
  } catch {
    return { token: null, roomCode: null };
  }
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(ROOM_KEY);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ROOM_KEY);
  } catch (e) {
    console.error('Failed to clear session', e);
  }
}
