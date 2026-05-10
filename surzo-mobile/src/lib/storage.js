import { supabase } from './supabase';

export async function getUserId() {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function getSessions() {
  const uid = await getUserId();
  const [{ data, error }, { data: photos }] = await Promise.all([
    supabase.from('sessions').select('data').eq('user_id', uid).order('created_at', { ascending: false }),
    supabase.from('session_photos').select('session_id, photo_url').eq('user_id', uid),
  ]);
  if (error) throw error;
  const photoMap = Object.fromEntries((photos ?? []).map(p => [p.session_id, p.photo_url]));
  return data.map(r => {
    const s = r.data;
    if (!s.photoUri?.startsWith('https://') && photoMap[s.id]) s.photoUri = photoMap[s.id];
    return s;
  });
}

export async function saveSession(session) {
  const uid = await getUserId();
  if (!uid) return;
  await supabase.from('sessions').upsert({
    id: session.id,
    user_id: uid,
    data: session,
    updated_at: new Date().toISOString(),
  });
}

export async function uploadPhoto(sessionId, localUri) {
  const uid = await getUserId();
  if (!uid) return localUri;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return localUri;

    const ts = Date.now();
    const path = `${uid}/${sessionId}_${ts}.jpg`;
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;

    const formData = new FormData();
    formData.append('file', { uri: localUri, name: `${sessionId}_${ts}.jpg`, type: 'image/jpeg' });

    const res = await fetch(`${supabaseUrl}/storage/v1/object/session-photos/${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'x-upsert': 'true' },
      body: formData,
    });

    if (!res.ok) { console.warn('[uploadPhoto] http', res.status, await res.text()); return localUri; }
    const { data } = supabase.storage.from('session-photos').getPublicUrl(path);
    return data.publicUrl;
  } catch (e) {
    console.warn('[uploadPhoto] catch:', e);
    return localUri;
  }
}

async function _patchSessionPhotoUri(sessionId, photoUrl) {
  const { data: row } = await supabase.from('sessions').select('data').eq('id', sessionId).maybeSingle();
  if (!row?.data) return;
  await supabase.from('sessions').update({
    data: { ...row.data, photoUri: photoUrl }, updated_at: new Date().toISOString(),
  }).eq('id', sessionId);
}

export async function saveSessionPhoto(sessionId, photoUrl) {
  const uid = await getUserId();
  if (!uid || !photoUrl?.startsWith('https://')) return;
  await supabase.from('session_photos').upsert({ session_id: sessionId, user_id: uid, photo_url: photoUrl });
  try {
    await supabase.from('session_photo_gallery').upsert(
      { session_id: sessionId, user_id: uid, photo_url: photoUrl, is_cover: true },
      { onConflict: 'session_id,photo_url' }
    );
  } catch (_e) {}
  try { await _patchSessionPhotoUri(sessionId, photoUrl); } catch (_e) {}
}

export async function getSessionPhoto(sessionId) {
  const { data } = await supabase.from('session_photos')
    .select('photo_url').eq('session_id', sessionId).maybeSingle();
  return data?.photo_url ?? null;
}

export async function getSessionPhotos(sessionId) {
  const { data } = await supabase.from('session_photo_gallery')
    .select('photo_url, is_cover').eq('session_id', sessionId)
    .order('created_at', { ascending: true });
  return data ?? [];
}

export async function addSessionPhoto(sessionId, photoUrl) {
  if (!photoUrl?.startsWith('https://')) return;
  const uid = await getUserId();
  if (!uid) return;
  const { count } = await supabase.from('session_photo_gallery')
    .select('*', { count: 'exact', head: true }).eq('session_id', sessionId);
  const isFirst = (count ?? 0) === 0;
  try {
    await supabase.from('session_photo_gallery').upsert(
      { session_id: sessionId, user_id: uid, photo_url: photoUrl, is_cover: isFirst },
      { onConflict: 'session_id,photo_url' }
    );
  } catch (_e) {}
  if (isFirst) await saveSessionPhoto(sessionId, photoUrl);
}

export async function setCoverPhoto(sessionId, photoUrl) {
  if (!photoUrl?.startsWith('https://')) return;
  const uid = await getUserId();
  if (!uid) return;
  await supabase.from('session_photo_gallery').update({ is_cover: false }).eq('session_id', sessionId);
  await supabase.from('session_photo_gallery').update({ is_cover: true })
    .eq('session_id', sessionId).eq('photo_url', photoUrl);
  await supabase.from('session_photos').upsert({ session_id: sessionId, user_id: uid, photo_url: photoUrl });
  try { await _patchSessionPhotoUri(sessionId, photoUrl); } catch (_e) {}
}

export async function sendPhoneEvent(sessionId, type) {
  const uid = await getUserId();
  if (!uid) return;
  await supabase.from('phone_events').insert({
    user_id: uid, session_id: sessionId, type, ts: new Date().toISOString(),
  });
}

export async function sendSessionCommand(command, data = {}) {
  const uid = await getUserId();
  if (!uid) return;
  await supabase.from('session_commands').insert({ user_id: uid, command, data });
}
