export function getOrCreateUserId() {
  let id = localStorage.getItem('mp_user_id');
  if (!id) {
    id = 'web_' + crypto.randomUUID();
    try { localStorage.setItem('mp_user_id', id); } catch (e) {}
  }
  return id;
}

export function getOrCreateSessionId() {
  let id = sessionStorage.getItem('mp_session_id');
  if (!id) {
    id = 'sess_' + crypto.randomUUID();
    try { sessionStorage.setItem('mp_session_id', id); } catch (e) {}
  }
  return id;
}
