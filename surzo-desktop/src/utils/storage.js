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

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
}

export async function getSessions() {
  const uid = getUserId();
  if (supabase && uid) {
    try {
      const [{ data, error }, { data: photos }] = await withTimeout(Promise.all([
        supabase.from('sessions').select('data').eq('user_id', uid).order('created_at', { ascending: false }),
        supabase.from('session_photos').select('session_id, photo_url').eq('user_id', uid),
      ]), 6000);
      if (!error && data?.length > 0) {
        const photoMap = Object.fromEntries((photos ?? []).map(p => [p.session_id, p.photo_url]));
        return data.map(r => {
          const s = r.data;
          if (!s.photoUri?.startsWith('https://') && photoMap[s.id]) s.photoUri = photoMap[s.id];
          return s;
        });
      }
    } catch {}
  }
  return getLocalSessions();
}

export async function saveSession(session) {
  const uid = getUserId();
  if (supabase && uid) {
    try {
      const { error } = await withTimeout(supabase.from('sessions').upsert({
        id: session.id,
        user_id: uid,
        data: session,
        updated_at: new Date().toISOString(),
      }), 6000);
      if (error) console.error('[supabase] saveSession error:', error);
      // Refresh leaderboard profile stats in background
      refreshMyProfileStats().catch(() => {});
    } catch {}
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

// ─── Social: user profile / leaderboard / friends ────────────────────────────

export async function getMyEmail() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data?.user?.email ?? null;
}

export async function ensureMyProfile() {
  if (!supabase) return null;
  const uid = getUserId();
  if (!uid) return null;
  const { data } = await supabase.auth.getUser();
  const email = data?.user?.email ?? '';
  const handle = email.split('@')[0] || 'user';
  await supabase.from('user_profiles').upsert({
    id: uid,
    email_handle: handle,
    display_name: handle,
  }, { onConflict: 'id', ignoreDuplicates: false });
  // Don't overwrite display_name if it already exists
  const { data: existing } = await supabase.from('user_profiles').select('*').eq('id', uid).maybeSingle();
  return existing;
}

function isSameDay(a, b) {
  const da = new Date(a), db = new Date(b);
  return da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate();
}

export async function refreshMyProfileStats() {
  if (!supabase) return;
  const uid = getUserId();
  if (!uid) return;
  try {
    const sessions = await getSessions();
    if (!sessions?.length) return;
    const calcPts = (x) => Math.round((x.averageWorkScore || 0) * (x.durationMinutes || 1));

    const total = sessions.reduce((s, x) => s + calcPts(x), 0);
    const avg = Math.round(sessions.reduce((s, x) => s + (x.averageWorkScore || 0), 0) / sessions.length);

    const now = Date.now();
    const today = sessions.filter(x => x.startedAt && isSameDay(x.startedAt, now));
    const dailyPts = today.reduce((s, x) => s + calcPts(x), 0);
    const dailyAvg = today.length ? Math.round(today.reduce((s, x) => s + (x.averageWorkScore || 0), 0) / today.length) : 0;
    const todayISO = new Date(now).toISOString().slice(0, 10);

    const last = sessions[0];

    // Always-exists columns first
    const baseUpdate = {
      total_pts: total,
      avg_score: avg,
      sessions_count: sessions.length,
      last_session_at: last?.startedAt ? new Date(last.startedAt).toISOString() : null,
      updated_at: new Date().toISOString(),
    };
    const { error: e1 } = await supabase.from('user_profiles').update(baseUpdate).eq('id', uid);
    if (e1) console.warn('[profile] base update failed', e1);

    // Daily columns may not exist yet (SQL migration). Update separately so a failure here
    // doesn't roll back the base stats.
    try {
      await supabase.from('user_profiles').update({
        daily_pts: dailyPts,
        daily_avg: dailyAvg,
        daily_sessions: today.length,
        daily_date: todayISO,
      }).eq('id', uid);
    } catch (_e) {}
  } catch (e) { console.warn('[profile] refresh failed', e); }
}

export async function updateDisplayName(name) {
  if (!supabase) return;
  const uid = getUserId();
  if (!uid) return;
  await supabase.from('user_profiles').update({
    display_name: name, updated_at: new Date().toISOString(),
  }).eq('id', uid);
}

// scope: 'all_time' | 'daily'
// metric: 'total' | 'avg'
export async function getLeaderboard({ scope = 'all_time', metric = 'total', limit = 50 } = {}) {
  if (!supabase) return [];
  let col;
  if (scope === 'daily') {
    col = metric === 'avg' ? 'daily_avg' : 'daily_pts';
  } else {
    col = metric === 'avg' ? 'avg_score' : 'total_pts';
  }
  let q = supabase.from('user_profiles').select('*').gt(col, 0)
    .order(col, { ascending: false }).limit(limit);
  if (scope === 'daily') {
    const today = new Date().toISOString().slice(0, 10);
    q = q.eq('daily_date', today);
  }
  const { data } = await q;
  return data ?? [];
}

export async function searchUsersByName(query, limit = 20) {
  if (!supabase || !query?.trim()) return [];
  const uid = getUserId();
  const q = query.trim().replace(/[%_]/g, ''); // sanitize SQL wildcards
  let req = supabase.from('user_profiles')
    .select('*')
    .ilike('display_name', `%${q}%`)
    .order('total_pts', { ascending: false })
    .limit(limit);
  if (uid) req = req.neq('id', uid);
  const { data } = await req;
  return data ?? [];
}

export async function getUserProfile(userId) {
  if (!supabase) return null;
  const { data } = await supabase.from('user_profiles').select('*').eq('id', userId).maybeSingle();
  return data;
}

// Top 3 sessions for a user (by total pts) — works only for self or accepted friends due to RLS
export async function getUserTopSessions(userId, limit = 3) {
  if (!supabase) return [];
  const { data } = await supabase.from('sessions')
    .select('data')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  const sessions = (data ?? []).map(r => r.data).filter(Boolean);
  // Sort by total pts desc
  return sessions.map(s => {
    const avg = Math.round(s.averageWorkScore ?? 0);
    const mins = s.durationMinutes || 1;
    const raw = s.totalWorkScore;
    const pts = Math.round(avg * mins);
    return { ...s, _pts: pts };
  }).sort((a, b) => b._pts - a._pts).slice(0, limit);
}

export async function getFriendships() {
  if (!supabase) return [];
  const uid = getUserId();
  if (!uid) return [];
  const { data } = await supabase.from('friendships').select('*')
    .or(`requester_id.eq.${uid},addressee_id.eq.${uid}`);
  return data ?? [];
}

export async function getFriendStatusWith(otherUserId) {
  if (!supabase) return 'none';
  const uid = getUserId();
  if (!uid) return 'none';
  const { data } = await supabase.from('friendships').select('*')
    .or(`and(requester_id.eq.${uid},addressee_id.eq.${otherUserId}),and(requester_id.eq.${otherUserId},addressee_id.eq.${uid})`)
    .maybeSingle();
  if (!data) return 'none';
  if (data.status === 'accepted') return 'accepted';
  if (data.requester_id === uid) return 'sent';
  return 'received';
}

export async function sendFriendRequest(targetUserId) {
  if (!supabase) return { ok: false };
  const uid = getUserId();
  if (!uid || uid === targetUserId) return { ok: false };
  const { error } = await supabase.from('friendships').upsert(
    { requester_id: uid, addressee_id: targetUserId, status: 'pending' },
    { onConflict: 'requester_id,addressee_id' }
  );
  return { ok: !error };
}

export async function acceptFriendRequest(friendshipId) {
  if (!supabase) return { ok: false };
  const { error } = await supabase.from('friendships').update({
    status: 'accepted', updated_at: new Date().toISOString(),
  }).eq('id', friendshipId);
  return { ok: !error };
}

export async function removeFriendship(friendshipId) {
  if (!supabase) return { ok: false };
  const { error } = await supabase.from('friendships').delete().eq('id', friendshipId);
  return { ok: !error };
}

// Get accepted friends with their profile
export async function getFriendsList() {
  if (!supabase) return [];
  const uid = getUserId();
  if (!uid) return [];
  const ships = await getFriendships();
  const accepted = ships.filter(f => f.status === 'accepted');
  if (!accepted.length) return [];
  const friendIds = accepted.map(f => f.requester_id === uid ? f.addressee_id : f.requester_id);
  const { data: profiles } = await supabase.from('user_profiles').select('*').in('id', friendIds);
  return (profiles ?? []).map(p => {
    const ship = accepted.find(f => f.requester_id === p.id || f.addressee_id === p.id);
    return { ...p, friendship_id: ship.id };
  });
}

// Get pending requests received
export async function getPendingRequests() {
  if (!supabase) return [];
  const uid = getUserId();
  if (!uid) return [];
  const { data: ships } = await supabase.from('friendships')
    .select('*').eq('addressee_id', uid).eq('status', 'pending');
  if (!ships?.length) return [];
  const ids = ships.map(s => s.requester_id);
  const { data: profiles } = await supabase.from('user_profiles').select('*').in('id', ids);
  return (profiles ?? []).map(p => {
    const ship = ships.find(s => s.requester_id === p.id);
    return { ...p, friendship_id: ship.id };
  });
}

// BeReal-style feed: recent sessions from friends (with photos)
export async function getFriendsFeed(limit = 30) {
  if (!supabase) return [];
  const friends = await getFriendsList();
  if (!friends.length) return [];
  const friendIds = friends.map(f => f.id);
  const profileById = Object.fromEntries(friends.map(f => [f.id, f]));
  const { data } = await supabase.from('sessions')
    .select('user_id, data, created_at')
    .in('user_id', friendIds)
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []).map(r => ({
    user: profileById[r.user_id],
    session: r.data,
    created_at: r.created_at,
  })).filter(x => x.user && x.session);
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
