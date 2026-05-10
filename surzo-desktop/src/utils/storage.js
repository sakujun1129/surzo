import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabase =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

// Supabase Auth ベースのユーザーID
let _userId = null;
supabase?.auth.getSession().then(({ data: { session } }) => {
  _userId = session?.user?.id ?? null;
});
supabase?.auth.onAuthStateChange((_, session) => {
  _userId = session?.user?.id ?? null;
});
export function getUserId() { return _userId; }

export function getSupabase() { return supabase; }

const api = () => window.electronAPI;

async function getLocalSessions() {
  if (api()) return api().getSessions();
  try { return JSON.parse(localStorage.getItem('surzo_v1') || '[]'); } catch { return []; }
}

async function saveLocalSession(session) {
  if (api()) return api().saveSession(session);
  const all = await getLocalSessions();
  const idx = all.findIndex(s => s.id === session.id);
  if (idx >= 0) all[idx] = session; else all.push(session);
  localStorage.setItem('surzo_v1', JSON.stringify(all));
}

export async function getSessions() {
  if (supabase) {
    const uid = getUserId();
    const [{ data, error }, { data: photos }] = await Promise.all([
      supabase.from('sessions').select('data').eq('user_id', uid).order('created_at', { ascending: false }),
      supabase.from('session_photos').select('session_id, photo_url').eq('user_id', uid),
    ]);
    if (!error && data) {
      const photoMap = Object.fromEntries((photos ?? []).map(p => [p.session_id, p.photo_url]));
      return data.map(r => {
        const s = r.data;
        if (!s.photoUri?.startsWith('https://') && photoMap[s.id]) s.photoUri = photoMap[s.id];
        return s;
      });
    }
  }
  return getLocalSessions();
}

export async function saveSession(session) {
  if (supabase) {
    const { error } = await supabase.from('sessions').upsert({
      id: session.id,
      user_id: getUserId(),
      data: session,
      updated_at: new Date().toISOString(),
    });
    if (error) console.error('[supabase] saveSession error:', error);
  }
  return saveLocalSession(session);
}

export async function generatePairingCode() {
  if (!supabase) return null;
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await supabase.from('pairing_codes').upsert({ code, user_id: getUserId(), expires_at });
  return code;
}

export async function setLiveSession(sessionId, meta = {}) {
  if (!supabase) return;
  await supabase.from('live_sessions').upsert({
    user_id: getUserId(),
    session_id: sessionId,
    score: 50,
    elapsed: 0,
    current_app: '',
    phone_count: 0,
    session_title: meta.title || '',
    category: meta.category || '',
    planned_minutes: meta.plannedMinutes || 0,
    updated_at: new Date().toISOString(),
  });
}

export async function updateLiveScore(score, elapsed, currentApp, phoneCount) {
  if (!supabase) return;
  await supabase.from('live_sessions').update({
    score,
    elapsed,
    current_app: currentApp || '',
    phone_count: phoneCount || 0,
    updated_at: new Date().toISOString(),
  }).eq('user_id', getUserId());
}

export async function clearLiveSession() {
  if (!supabase) return;
  await supabase.from('live_sessions').delete().eq('user_id', getUserId());
}

export function subscribePhoneEvents(sessionId, onEvent) {
  if (!supabase) return () => {};
  const channel = supabase
    .channel(`phone-${sessionId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'phone_events',
      filter: `session_id=eq.${sessionId}`,
    }, payload => onEvent(payload.new))
    .subscribe();
  return () => supabase.removeChannel(channel);
}

async function _patchSessionPhotoUri(sessionId, photoUrl) {
  if (!supabase) return;
  const { data: row } = await supabase.from('sessions').select('data').eq('id', sessionId).maybeSingle();
  if (!row?.data) return;
  await supabase.from('sessions').update({
    data: { ...row.data, photoUri: photoUrl }, updated_at: new Date().toISOString(),
  }).eq('id', sessionId);
}

export async function getSessionPhoto(sessionId) {
  if (!supabase) return null;
  const { data } = await supabase.from('session_photos')
    .select('photo_url').eq('session_id', sessionId).maybeSingle();
  return data?.photo_url ?? null;
}

export async function getSessionPhotos(sessionId) {
  if (!supabase) return [];
  const { data } = await supabase.from('session_photo_gallery')
    .select('photo_url, is_cover').eq('session_id', sessionId)
    .order('created_at', { ascending: true });
  return data ?? [];
}

export async function addSessionPhoto(sessionId, photoUrl) {
  if (!supabase || !photoUrl?.startsWith('https://')) return;
  const uid = getUserId();
  if (!uid) return;
  const { count } = await supabase.from('session_photo_gallery')
    .select('*', { count: 'exact', head: true }).eq('session_id', sessionId);
  const isFirst = (count ?? 0) === 0;
  try {
    await supabase.from('session_photo_gallery').upsert(
      { session_id: sessionId, user_id: uid, photo_url: photoUrl, is_cover: isFirst },
      { onConflict: 'session_id,photo_url' }
    );
  } catch {}
  if (isFirst) await saveSessionPhoto(sessionId, photoUrl);
}

export async function setCoverPhoto(sessionId, photoUrl) {
  if (!supabase || !photoUrl?.startsWith('https://')) return;
  const uid = getUserId();
  if (!uid) return;
  await supabase.from('session_photo_gallery').update({ is_cover: false }).eq('session_id', sessionId);
  await supabase.from('session_photo_gallery').update({ is_cover: true })
    .eq('session_id', sessionId).eq('photo_url', photoUrl);
  await supabase.from('session_photos').upsert({ session_id: sessionId, user_id: uid, photo_url: photoUrl });
  try { await _patchSessionPhotoUri(sessionId, photoUrl); } catch {}
}

export async function uploadPhotoFromFile(sessionId, file) {
  if (!supabase) return null;
  const uid = getUserId();
  if (!uid) return null;
  try {
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${uid}/${sessionId}_${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('session-photos').upload(path, file, { upsert: true });
    if (error) { console.warn('[uploadPhotoFromFile]', error); return null; }
    const { data } = supabase.storage.from('session-photos').getPublicUrl(path);
    const photoUrl = data.publicUrl;
    await addSessionPhoto(sessionId, photoUrl);
    return photoUrl;
  } catch (e) {
    console.warn('[uploadPhotoFromFile] catch:', e);
    return null;
  }
}

export async function saveSessionPhoto(sessionId, photoUrl) {
  if (!supabase || !photoUrl?.startsWith('https://')) return;
  const uid = getUserId();
  if (!uid) return;
  await supabase.from('session_photos').upsert({ session_id: sessionId, user_id: uid, photo_url: photoUrl });
  try {
    await supabase.from('session_photo_gallery').upsert(
      { session_id: sessionId, user_id: uid, photo_url: photoUrl, is_cover: true },
      { onConflict: 'session_id,photo_url' }
    );
  } catch {}
  try { await _patchSessionPhotoUri(sessionId, photoUrl); } catch {}
}

export function subscribeSessionPhoto(sessionId, onPhoto) {
  if (!supabase) return () => {};
  const ch = supabase.channel(`photo-${sessionId}`)
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'session_photos',
      filter: `session_id=eq.${sessionId}`,
    }, p => { if (p.new?.photo_url) onPhoto(p.new.photo_url); })
    .subscribe();
  return () => supabase.removeChannel(ch);
}

export async function sendMobileAlert(score) {
  const uid = getUserId();
  if (!supabase || !uid) return;
  try {
    const { data } = await supabase.from('user_push_tokens').select('push_token').eq('user_id', uid).maybeSingle();
    if (!data?.push_token) return;
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: data.push_token,
        title: '⚠ 集中が切れています',
        body: `Work Score: ${score} — 作業に戻りましょう`,
        sound: 'default',
        priority: 'high',
      }),
    });
  } catch (e) {
    console.warn('[Alert] Mobile push failed', e);
  }
}
