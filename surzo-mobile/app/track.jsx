import { useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TouchableOpacity,
  ScrollView, TextInput, AppState, ActivityIndicator, Alert, Image, Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { supabase } from '../src/lib/supabase';
import { getUserId, getSessions, saveSession, sendSessionCommand, uploadPhoto, saveSessionPhoto, addSessionPhoto, sendPhoneEvent } from '../src/lib/storage';
import { startPhoneTracking } from '../src/lib/phoneTracker';

const CATEGORIES = ['Programming', 'Writing', 'Design', 'Research', 'Study', 'Admin / Email', 'Free Work', 'General Work'];

function getZone(score) {
  if (score >= 85) return { label: 'DEEP FOCUS', color: '#d4f57a' };
  if (score >= 70) return { label: 'ON TRACK',   color: '#34d399' };
  if (score >= 55) return { label: 'FOCUSED',     color: '#38bdf8' };
  if (score >= 38) return { label: 'DRIFTING',    color: '#ffd60a' };
  if (score >= 20) return { label: 'OFF TASK',    color: '#ff9f0a' };
  return               { label: 'DISTRACTED',  color: '#ff453a' };
}

function fmtTimer(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function calcScore(elapsedMins, phoneCount, phoneMins) {
  const base = 75;
  const penalty = Math.min(35, phoneCount * 5 + phoneMins * 0.8);
  return Math.round(Math.max(15, base - penalty));
}

function calcMobileScore(durationMins, phoneCount, phoneMins) {
  const phoneRatio    = durationMins > 0 ? phoneMins / durationMins : 0;
  const distractRate  = durationMins > 0 ? phoneCount / durationMins : 0;

  const focus   = Math.max(0, 100 - phoneRatio * 120 - distractRate * 600);
  const endur   = Math.min(100, 50 + durationMins * 1.2);
  const recov   = Math.max(0, 100 - phoneCount * 8);
  const consist = Math.max(0, 100 - phoneRatio * 100);

  const weighted = focus * 0.40 + endur * 0.25 + recov * 0.20 + consist * 0.15;
  return Math.round(Math.max(10, Math.min(99, weighted)));
}

function buildFeedback(durationMins, phoneCount, phoneMins, score) {
  const phoneRatio = durationMins > 0 ? phoneMins / durationMins : 0;
  const breakdown = {
    focusConsistency: Math.max(0, 100 - phoneRatio * 120),
    taskAlignment:    durationMins >= 25 ? 80 : Math.min(80, durationMins * 3),
    deepWorkRatio:    phoneCount <= 1 ? 90 : Math.max(10, 90 - phoneCount * 12),
    activitySignal:   Math.min(100, 50 + durationMins * 1.5),
    recoveryReturn:   Math.max(0, 100 - phoneCount * 10),
  };

  const pos = [];
  const neg = [];

  if (durationMins >= 45) pos.push('長時間の集中セッションを達成しました');
  else if (durationMins >= 25) pos.push(`${durationMins}分の深作業ブロックを完了しました`);

  if (phoneCount === 0) pos.push('スマホなしで集中を維持できました 🎯');
  else if (phoneCount <= 2) pos.push('スマホ使用を最小限に抑えられました');

  if (score >= 80) pos.push('非常に高い集中スコアを達成しました');
  else if (score >= 65) pos.push('良好な集中状態を維持できました');
  else if (score >= 50) pos.push('セッションを最後まで完了しました');

  if (phoneCount >= 5) neg.push(`スマホを${phoneCount}回確認しました。次回は通知をオフにしてみましょう`);
  else if (phoneCount >= 3) neg.push('スマホの確認が集中を妨げることがあります');

  if (phoneRatio > 0.2) neg.push(`セッション時間の${Math.round(phoneRatio*100)}%をスマホに使いました`);

  if (durationMins < 15) neg.push('より長いセッションを目指しましょう（25分以上が理想）');

  if (pos.length === 0) pos.push('セッションを完了しました');

  return { pos, neg, breakdown };
}

// ─── PC Live View ─────────────────────────────────────────────────────────────
function PcLiveView({ session, stopping, onStop }) {
  const [pcCheckActive, setPcCheckActive] = useState(false);
  const [livePhotos,    setLivePhotos]    = useState([]);
  const pcCheckStartRef = useRef(null);

  const score   = session?.score ?? 50;
  const zone    = getZone(score);
  const elapsed = session?.elapsed ?? 0;
  const planned = session?.planned_minutes ?? 0;
  const progress = planned > 0 ? Math.min(100, (elapsed / 60 / planned) * 100) : 0;

  const handleCheckPhone = async () => {
    if (!pcCheckActive) {
      pcCheckStartRef.current = Date.now();
      setPcCheckActive(true);
      await sendPhoneEvent(session.session_id, 'start');
    } else {
      setPcCheckActive(false);
      await sendPhoneEvent(session.session_id, 'end');
    }
  };

  const handlePhotoPress = () => {
    if (livePhotos.length >= 3) return;
    const addPhoto = (localUri) => {
      setLivePhotos(prev => [...prev, localUri].slice(0, 3));
      uploadPhoto(session.session_id, localUri)
        .then(url => {
          if (url?.startsWith('https://')) {
            setLivePhotos(prev => prev.map(p => p === localUri ? url : p));
            addSessionPhoto(session.session_id, url);
          }
        })
        .catch(() => {});
    };
    Alert.alert('写真を追加', `${livePhotos.length}/3`, [
      { text: 'カメラで撮る', onPress: async () => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') { Alert.alert('カメラ許可が必要です'); return; }
        const result = await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: true, aspect: [3, 4] });
        if (!result.canceled && result.assets?.[0]) addPhoto(result.assets[0].uri);
      }},
      { text: 'ライブラリから', onPress: async () => {
        const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.7, allowsEditing: true, aspect: [3, 4] });
        if (!result.canceled && result.assets?.[0]) addPhoto(result.assets[0].uri);
      }},
      { text: 'キャンセル', style: 'cancel' },
    ]);
  };

  if (stopping) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: '#48484a', fontSize: 15, fontWeight: '600' }}>終了処理中...</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={lv.scroll} showsVerticalScrollIndicator={false}>
      <View style={lv.badge}>
        <View style={lv.dot} />
        <Text style={lv.liveLabel}>PC · LIVE</Text>
        {session?.session_title ? <Text style={lv.title} numberOfLines={1}>{session.session_title}</Text> : null}
      </View>

      <View style={lv.hero}>
        <Text style={[lv.zone, { color: zone.color }]}>{zone.label}</Text>
        <Text style={[lv.score, { color: zone.color }]}>{score}</Text>
        <View style={lv.barTrack}>
          <View style={[lv.barFill, { width: `${score}%`, backgroundColor: zone.color }]} />
        </View>
      </View>

      <View style={lv.card}>
        <Text style={lv.timer}>{fmtTimer(elapsed)}</Text>
        {planned > 0 && (
          <View style={lv.prog}>
            <Text style={lv.progPct}>{Math.round(progress)}%</Text>
            <View style={lv.progTrack}>
              <View style={[lv.progFill, { width: `${progress}%` }]} />
            </View>
            <Text style={lv.progLabel}>{planned}m</Text>
          </View>
        )}
      </View>

      {session?.current_app ? <Text style={lv.app}>▶  {session.current_app}</Text> : null}

      <View style={lv.card}>
        <Text style={lv.phoneLabel}>スマホ離脱</Text>
        <Text style={[lv.phoneCount, (session?.phone_count ?? 0) > 0 && { color: '#ff9f0a' }]}>
          {session?.phone_count ?? 0}回  {(session?.phone_count ?? 0) === 0 ? '🎯' : '📱'}
        </Text>
      </View>

      <View style={lv.actionRow}>
        <TouchableOpacity
          style={[lv.checkBtn, pcCheckActive && lv.checkBtnActive]}
          onPress={handleCheckPhone} activeOpacity={0.8}>
          <Text style={[lv.checkBtnText, pcCheckActive && lv.checkBtnTextActive]}>
            {pcCheckActive ? '✓ 戻る' : '📱 Check Phone'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[lv.addPhotoBtn, livePhotos.length >= 3 && lv.addPhotoBtnFull]}
          onPress={handlePhotoPress} activeOpacity={0.8} disabled={livePhotos.length >= 3}>
          <Text style={lv.addPhotoBtnText}>
            {livePhotos.length >= 3 ? '📷 3/3' : `📷 Add Photos${livePhotos.length > 0 ? ` (${livePhotos.length}/3)` : ''}`}
          </Text>
        </TouchableOpacity>
      </View>

      {livePhotos.length > 0 && (
        <TouchableOpacity onPress={handlePhotoPress} activeOpacity={0.85} style={{ marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', gap: 4, borderRadius: 16, overflow: 'hidden' }}>
            {livePhotos.map((uri, i) => (
              <View key={i} style={{ flex: 1, aspectRatio: livePhotos.length === 1 ? 4/3 : 3/4 }}>
                <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              </View>
            ))}
          </View>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={lv.stopBtn} onPress={onStop} activeOpacity={0.8}>
        <Text style={lv.stopBtnText}>PCセッションを終了</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─── Mobile Active Session ────────────────────────────────────────────────────
function MobileSession({ session, onEnd, onPhotoTaken, checkPhoneActive, onCheckPhone }) {
  const elapsed    = session.elapsed;
  const phoneCount = session.phoneCount;
  const phoneMins  = session.phoneMins;
  const phoneStart = session.phoneStart;

  const score = calcScore(elapsed / 60, phoneCount, phoneMins + (phoneStart ? (Date.now() - phoneStart) / 60000 : 0));
  const zone  = getZone(score);

  const photoCount = session.photos?.length ?? 0;

  const handlePhotoPress = () => {
    if (photoCount >= 3) return;
    Alert.alert('写真を追加', `${photoCount}/3`, [
      { text: 'カメラで撮る', onPress: async () => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') { Alert.alert('カメラ許可が必要です'); return; }
        const result = await ImagePicker.launchCameraAsync({ quality: 0.8, allowsEditing: true, aspect: [3, 4] });
        if (!result.canceled && result.assets?.[0]) onPhotoTaken(result.assets[0].uri);
      }},
      { text: 'ライブラリから', onPress: async () => {
        const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.8, allowsEditing: true, aspect: [3, 4] });
        if (!result.canceled && result.assets?.[0]) onPhotoTaken(result.assets[0].uri);
      }},
      { text: 'キャンセル', style: 'cancel' },
    ]);
  };

  return (
    <ScrollView contentContainerStyle={lv.scroll} showsVerticalScrollIndicator={false}>
      <View style={lv.badge}>
        <View style={lv.dot} />
        <Text style={lv.liveLabel}>LIVE</Text>
        {session.title ? <Text style={lv.title} numberOfLines={1}>{session.title}</Text> : null}
      </View>

      <View style={lv.hero}>
        <Text style={[lv.zone, { color: zone.color }]}>{zone.label}</Text>
        <Text style={[lv.score, { color: zone.color }]}>{score}</Text>
        <View style={lv.barTrack}>
          <View style={[lv.barFill, { width: `${score}%`, backgroundColor: zone.color }]} />
        </View>
      </View>

      <View style={lv.card}>
        <Text style={lv.timer}>{fmtTimer(elapsed)}</Text>
        {session.plannedMinutes > 0 && (
          <View style={lv.prog}>
            <Text style={lv.progPct}>{Math.round(Math.min(100, elapsed / 60 / session.plannedMinutes * 100))}%</Text>
            <View style={lv.progTrack}>
              <View style={[lv.progFill, { width: `${Math.min(100, elapsed / 60 / session.plannedMinutes * 100)}%` }]} />
            </View>
            <Text style={lv.progLabel}>{session.plannedMinutes}m</Text>
          </View>
        )}
      </View>

      <View style={lv.card}>
        <Text style={lv.phoneLabel}>スマホ離脱</Text>
        <Text style={[lv.phoneCount, phoneCount > 0 && { color: '#ff9f0a' }]}>
          {phoneCount}回  {phoneCount === 0 ? '🎯' : '📱'}
        </Text>
      </View>

      <View style={lv.actionRow}>
        <TouchableOpacity
          style={[lv.checkBtn, checkPhoneActive && lv.checkBtnActive]}
          onPress={onCheckPhone} activeOpacity={0.8}>
          <Text style={[lv.checkBtnText, checkPhoneActive && lv.checkBtnTextActive]}>
            {checkPhoneActive ? '✓ 戻る' : '📱 Check Phone'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[lv.addPhotoBtn, photoCount >= 3 && lv.addPhotoBtnFull]}
          onPress={handlePhotoPress} activeOpacity={0.8} disabled={photoCount >= 3}>
          <Text style={lv.addPhotoBtnText}>
            {photoCount >= 3 ? '📷 3/3' : `📷 Add Photos${photoCount > 0 ? ` (${photoCount}/3)` : ''}`}
          </Text>
        </TouchableOpacity>
      </View>

      {photoCount > 0 && (
        <TouchableOpacity onPress={handlePhotoPress} activeOpacity={0.85} style={{ marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', gap: 4, borderRadius: 16, overflow: 'hidden' }}>
            {session.photos.map((uri, i) => (
              <View key={i} style={{ flex: 1, aspectRatio: photoCount === 1 ? 4/3 : 3/4 }}>
                <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              </View>
            ))}
          </View>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={lv.endBtn} onPress={onEnd} activeOpacity={0.8}>
        <Text style={lv.endBtnText}>セッションを終了</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function autoTitle(category) {
  const h = new Date().getHours();
  const time = h < 5 ? '深夜' : h < 12 ? '午前' : h < 17 ? '午後' : '夜';
  return `${time}の${category}`;
}

// ─── Start Screen ─────────────────────────────────────────────────────────────
function StartScreen({ onStartPhone, onStartMac }) {
  const [mode,     setMode]     = useState(null);
  const [title,    setTitle]    = useState('');
  const [category, setCategory] = useState('General Work');
  const [planned,  setPlanned]  = useState('25');
  const [showCats, setShowCats] = useState(false);
  const [sending,  setSending]  = useState(false);

  if (!mode) {
    return (
      <ScrollView contentContainerStyle={st.homeWrap} showsVerticalScrollIndicator={false}>
        <View style={st.homeHeader}>
          <Text style={st.homeLogo}>surzo</Text>
          <Text style={st.homeSub}>Your focus, measured.</Text>
        </View>
        <TouchableOpacity style={[st.heroBtn, st.heroBtnPhone]} onPress={() => setMode('phone')} activeOpacity={0.88}>
          <Text style={st.heroBtnEmoji}>📱</Text>
          <Text style={st.heroBtnTitle}>iPhone で集中</Text>
          <Text style={st.heroBtnDesc}>タイマー + スマホ離脱追跡</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[st.heroBtn, st.heroBtnMac]} onPress={() => setMode('mac')} activeOpacity={0.88}>
          <Text style={st.heroBtnEmoji}>💻</Text>
          <Text style={[st.heroBtnTitle, { color: '#fff' }]}>Mac で集中</Text>
          <Text style={[st.heroBtnDesc, { color: 'rgba(255,255,255,0.55)' }]}>PCのアクティビティを追跡</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  const handleSubmit = async () => {
    const finalTitle = title.trim() || autoTitle(category);
    const config = { title: finalTitle, category, plannedMinutes: parseInt(planned) || 25 };
    if (mode === 'phone') {
      onStartPhone(config);
    } else {
      setSending(true);
      await onStartMac(config);
      setSending(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={st.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <TouchableOpacity onPress={() => setMode(null)} style={{ marginBottom: 8 }}>
        <Text style={st.back}>← 戻る</Text>
      </TouchableOpacity>
      <Text style={st.heading}>{mode === 'mac' ? '💻 Mac で集中' : '📱 iPhone で集中'}</Text>

      <Text style={st.label}>タイトル <Text style={st.labelOpt}>（省略可）</Text></Text>
      <TextInput style={st.input} placeholder={autoTitle(category)} placeholderTextColor="#3a3a3c"
        value={title} onChangeText={setTitle} />

      <Text style={st.label}>カテゴリ</Text>
      <TouchableOpacity style={st.picker} onPress={() => setShowCats(v => !v)} activeOpacity={0.7}>
        <Text style={st.pickerText}>{category}</Text>
        <Text style={st.pickerArrow}>{showCats ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {showCats && (
        <View style={st.catList}>
          {CATEGORIES.map(c => (
            <TouchableOpacity key={c} style={[st.catItem, c === category && st.catItemActive]}
              onPress={() => { setCategory(c); setShowCats(false); }}>
              <Text style={[st.catText, c === category && st.catTextActive]}>{c}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <Text style={st.label}>予定時間（分）</Text>
      <TextInput style={st.input} value={planned} onChangeText={setPlanned}
        keyboardType="number-pad" placeholder="25" placeholderTextColor="#3a3a3c" />

      <TouchableOpacity
        style={[st.startBtn, sending && st.startBtnDisabled]}
        onPress={handleSubmit} disabled={sending} activeOpacity={0.85}>
        <Text style={st.startBtnText}>
          {sending ? '送信中...' : mode === 'mac' ? 'Macで開始' : '開始'}
        </Text>
      </TouchableOpacity>
      {mode === 'mac' && (
        <Text style={st.macNote}>PCでSurzoが起動している必要があります</Text>
      )}
    </ScrollView>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function TrackScreen() {
  const [pcSession,     setPcSession]     = useState(null);
  const [mobileSession, setMobileSession] = useState(null);
  const [stoppingPc,    setStoppingPc]    = useState(false);
  const timerRef        = useRef(null);
  const phoneRef        = useRef(null);
  const stopPcRef       = useRef(null);
  const bgStartRef      = useRef(null);
  const notifIdRef      = useRef(null);
  const prevPcRef       = useRef(null);
  const prevPcScoreRef  = useRef(null);
  const fetchRef        = useRef(null);
  const checkPhoneRef   = useRef(false);
  const checkStartRef   = useRef(null);
  const mountedRef      = useRef(true);
  const [checkPhoneActive, setCheckPhoneActive] = useState(false);

  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  // Register Expo push token for PC → mobile alerts
  useEffect(() => {
    if (Platform.OS === 'web') return;
    async function register() {
      try {
        const { data: token } = await Notifications.getExpoPushTokenAsync();
        if (!token) return;
        const uid = await getUserId();
        if (!uid) return;
        await supabase.from('user_push_tokens').upsert({
          user_id: uid, push_token: token, updated_at: new Date().toISOString(),
        });
      } catch (e) { /* ignore — simulator or permissions not granted */ }
    }
    register();
  }, []);

  // PC session watcher: Realtime + polling fallback
  useEffect(() => {
    let mounted = true;
    let channel = null;
    let prevTitle = null;

    async function fetchAndSet() {
      try {
        const uid = await getUserId();
        if (!uid || !mounted) return;
        const { data } = await supabase.from('live_sessions').select('*').eq('user_id', uid).maybeSingle();
        if (!mounted) return;
        // Stale check: if updated_at is older than 10 minutes, auto-clear
        if (data?.updated_at) {
          const age = Date.now() - new Date(data.updated_at).getTime();
          if (age > 10 * 60 * 1000) {
            supabase.from('live_sessions').delete().eq('user_id', uid).then(() => {});
            setPcSession(null);
            return;
          }
        }
        setPcSession(data ?? null);
        if (data && data.session_title !== prevTitle) {
          prevTitle = data.session_title;
          if (Platform.OS !== 'web') Notifications.scheduleNotificationAsync({
            content: { title: 'PCセッション開始', body: `"${data.session_title}" が始まりました` },
            trigger: null,
          }).catch(() => {});
        }
      } catch (_e) { /* ignore network errors */ }
    }

    fetchRef.current = fetchAndSet;

    async function setup() {
      // Wait for auth to be ready (up to 4s)
      let uid = null;
      for (let i = 0; i < 8 && !uid && mounted; i++) {
        uid = await getUserId();
        if (!uid) await new Promise(r => setTimeout(r, 500));
      }
      await fetchAndSet();
      if (!uid || !mounted) return;
      channel = supabase.channel(`live-${uid}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'live_sessions', filter: `user_id=eq.${uid}` },
          (p) => { if (mounted) setPcSession(p.eventType === 'DELETE' ? null : p.new); })
        .subscribe();
    }
    setup();

    // Polling fallback every 2s (catches Realtime misses)
    const poll = setInterval(fetchAndSet, 2000);

    return () => {
      mounted = false;
      clearInterval(poll);
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  // Detect when PC session ends → navigate to latest session result
  useEffect(() => {
    if (prevPcRef.current && !pcSession) {
      setStoppingPc(true); // show spinner regardless of how session ended
      setTimeout(() => {
        getSessions().then(sessions => {
          setStoppingPc(false);
          if (!sessions?.length) { router.replace('/records'); return; }
          const sorted = [...sessions].sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
          router.push({ pathname: `/session/${sorted[0].id}`, params: { from: 'track' } });
        }).catch(() => { setStoppingPc(false); router.replace('/records'); });
      }, 5000);
    }
    if (pcSession) {
      setStoppingPc(false);
    }
    prevPcRef.current = pcSession;
  }, [pcSession]);

  // Red zone notification: fire when Mac score drops below 20
  useEffect(() => {
    if (!pcSession) { prevPcScoreRef.current = null; return; }
    const prev = prevPcScoreRef.current;
    const cur  = pcSession.score ?? 50;
    if (prev !== null && prev >= 20 && cur < 20) {
      if (Platform.OS !== 'web') Notifications.scheduleNotificationAsync({
        content: {
          title: '⚠ PCの集中が切れています',
          body: `Work Score: ${cur} — 作業に戻りましょう`,
          sound: true,
        },
        trigger: null,
      }).catch(() => {});
    }
    prevPcScoreRef.current = cur;
  }, [pcSession?.score]);

  // PC phone tracking
  useEffect(() => {
    if (pcSession && !stopPcRef.current) {
      stopPcRef.current = startPhoneTracking(pcSession.session_id);
    } else if (!pcSession && stopPcRef.current) {
      stopPcRef.current();
      stopPcRef.current = null;
    }
  }, [pcSession]);

  // Session active: background detection → phone distraction + notification
  useEffect(() => {
    const hasSession = !!(mobileSession || pcSession);
    if (!hasSession) return;
    bgStartRef.current = null;

    const sub = AppState.addEventListener('change', async (state) => {
      if (state !== 'active') {
        // Check Phone already active → user pressed button first, skip auto-tracking
        if (checkPhoneRef.current) return;
        bgStartRef.current = Date.now();
        try {
          if (Platform.OS !== 'web') {
            const id = await Notifications.scheduleNotificationAsync({
              content: { title: 'セッション中', body: '作業に戻りましょう 💪', sound: true },
              trigger: { seconds: 120 },
            });
            notifIdRef.current = id;
          }
        } catch (_e) {}
      } else {
        if (notifIdRef.current) {
          Notifications.cancelScheduledNotificationAsync(notifIdRef.current).catch(() => {});
          notifIdRef.current = null;
        }
        if (checkPhoneRef.current) {
          // Returning from an intentional Check Phone break
          const mins = (Date.now() - (checkStartRef.current || Date.now())) / 60000;
          checkPhoneRef.current = false;
          checkStartRef.current = null;
          setCheckPhoneActive(false);
          setMobileSession(prev => prev ? { ...prev, phoneMins: prev.phoneMins + mins } : prev);
        } else if (bgStartRef.current && mobileSession) {
          // Unintentional background → count as distraction
          const durMins = (Date.now() - bgStartRef.current) / 60000;
          setMobileSession(prev => {
            if (!prev) return prev;
            return { ...prev, phoneCount: prev.phoneCount + 1, phoneMins: prev.phoneMins + durMins };
          });
        }
        bgStartRef.current = null;
      }
    });
    return () => {
      sub.remove();
      if (notifIdRef.current && Platform.OS !== 'web') {
        Notifications.cancelScheduledNotificationAsync(notifIdRef.current).catch(() => {});
        notifIdRef.current = null;
      }
    };
  }, [!!mobileSession, !!pcSession]);

  // Mobile timer
  useEffect(() => {
    if (mobileSession && !timerRef.current) {
      timerRef.current = setInterval(() => {
        setMobileSession(prev => {
          if (!prev) return prev;
          const newElapsed = prev.elapsed + 1;
          const elapsedMin = Math.floor(newElapsed / 60);
          const curScore   = calcScore(newElapsed / 60, prev.phoneCount, prev.phoneMins);
          let { scoreSeries, lastSeriesMinute } = prev;
          if (elapsedMin > lastSeriesMinute && elapsedMin > 0) {
            scoreSeries      = [...scoreSeries, { t: elapsedMin, s: curScore }];
            lastSeriesMinute = elapsedMin;
          }
          return { ...prev, elapsed: newElapsed, totalRawScore: (prev.totalRawScore || 0) + curScore, scoreSeries, lastSeriesMinute };
        });
      }, 1000);
    }
    if (!mobileSession && timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  }, [!!mobileSession]);

  const handleStartPhone = ({ title, category, plannedMinutes }) => {
    setMobileSession({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      title, category, plannedMinutes,
      startedAt: Date.now(),
      elapsed: 0,
      phoneCount: 0,
      phoneMins: 0,
      phoneStart: null,
      scoreSeries: [],
      lastSeriesMinute: -1,
      totalRawScore: 0,
      photos: [],
    });
  };

  const handleCheckPhone = () => {
    if (!checkPhoneRef.current) {
      checkPhoneRef.current = true;
      checkStartRef.current = Date.now();
      setCheckPhoneActive(true);
      setMobileSession(prev => prev ? { ...prev, phoneCount: prev.phoneCount + 1 } : prev);
    } else {
      const mins = (Date.now() - checkStartRef.current) / 60000;
      checkPhoneRef.current = false;
      checkStartRef.current = null;
      setCheckPhoneActive(false);
      setMobileSession(prev => prev ? { ...prev, phoneMins: prev.phoneMins + mins } : prev);
    }
  };

  const handlePhotoTaken = async (uri) => {
    if (!mobileSession || (mobileSession.photos?.length ?? 0) >= 3) return;
    setMobileSession(prev => prev ? { ...prev, photos: [...(prev.photos || []), uri].slice(0, 3) } : prev);
    const url = await uploadPhoto(mobileSession.id, uri);
    if (url?.startsWith('https://')) {
      setMobileSession(prev => {
        if (!prev) return prev;
        return { ...prev, photos: (prev.photos || []).map(p => p === uri ? url : p) };
      });
      addSessionPhoto(mobileSession.id, url);
    }
  };

  const handleStartMac = async ({ title, category, plannedMinutes }) => {
    await sendSessionCommand('start', { title, category, plannedMinutes, trackPhone: true });
    // Re-poll with retries — Mac takes 1-3s to process and write live_sessions
    fetchRef.current?.();
    setTimeout(() => fetchRef.current?.(), 1000);
    setTimeout(() => fetchRef.current?.(), 2500);
    setTimeout(() => fetchRef.current?.(), 4000);
  };

  const handleStopPc = async () => {
    setStoppingPc(true);
    try {
      await sendSessionCommand('stop', {});
    } catch (_e) {
      setStoppingPc(false);
      return;
    }
    // Fallback: if PC doesn't respond within 8s, force-clear the live session
    setTimeout(async () => {
      if (!mountedRef.current) return;
      const uid = await getUserId();
      if (!uid) return;
      const { data } = await supabase.from('live_sessions').select('session_id').eq('user_id', uid).maybeSingle();
      if (data && mountedRef.current) {
        await supabase.from('live_sessions').delete().eq('user_id', uid);
        setPcSession(null);
      }
    }, 8000);
  };

  const handleEnd = async () => {
    if (!mobileSession) return;
    clearInterval(timerRef.current);
    timerRef.current = null;

    const durationMins = Math.max(1, Math.round(mobileSession.elapsed / 60));
    const score = calcMobileScore(durationMins, mobileSession.phoneCount, mobileSession.phoneMins);

    const { pos, neg, breakdown } = buildFeedback(durationMins, mobileSession.phoneCount, mobileSession.phoneMins, score);

    const result = {
      id: mobileSession.id,
      title: mobileSession.title,
      category: mobileSession.category,
      plannedMinutes: mobileSession.plannedMinutes,
      startedAt: mobileSession.startedAt,
      endedAt: Date.now(),
      durationMinutes: durationMins,
      averageWorkScore: score,
      totalWorkScore: Math.round(durationMins * score / 10),
      bestFocusMinutes: Math.max(1, durationMins - Math.round(mobileSession.phoneMins)),
      deepWorkBlocks: durationMins >= 25 && mobileSession.phoneCount <= 1 ? 1 : 0,
      phoneDistractionCount: mobileSession.phoneCount,
      totalPhoneDistractionMinutes: Math.round(mobileSession.phoneMins * 10) / 10,
      scoreBreakdown: breakdown,
      scoreSeries: mobileSession.scoreSeries || [],
      positiveReasons: pos,
      negativeReasons: neg,
      source: 'mobile',
      photoUri: (mobileSession.photos || []).find(p => p?.startsWith('https://')) ?? null,
      totalWorkScore: mobileSession.totalRawScore || Math.round(durationMins * 60 * score),
    };

    try { await saveSession(result); } catch (e) { console.warn('save failed', e); }
    setMobileSession(null);
    router.push({ pathname: `/session/${result.id}`, params: { from: 'track' } });
  };

  // Priority: mobile session > PC session > spinner (stopping) > idle
  if (mobileSession) {
    return (
      <SafeAreaView style={s.root}>
        <MobileSession
          session={mobileSession}
          onEnd={handleEnd}
          onPhotoTaken={handlePhotoTaken}
          checkPhoneActive={checkPhoneActive}
          onCheckPhone={handleCheckPhone}
        />
      </SafeAreaView>
    );
  }

  if (pcSession || stoppingPc) {
    return (
      <SafeAreaView style={s.root}>
        {pcSession ? (
          <PcLiveView session={pcSession} stopping={stoppingPc} onStop={handleStopPc} />
        ) : (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator color="#d4f57a" size="large" />
            <Text style={{ color: '#48484a', marginTop: 16, fontSize: 15, fontWeight: '600' }}>記録を取得中...</Text>
          </View>
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.root}>
      <StartScreen onStartPhone={handleStartPhone} onStartMac={handleStartMac} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({ root: { flex: 1, backgroundColor: '#000' } });

const lv = StyleSheet.create({
  scroll:     { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40 },
  badge:      { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 32 },
  dot:        { width: 7, height: 7, borderRadius: 4, backgroundColor: '#d4f57a' },
  liveLabel:  { fontSize: 11, fontWeight: '800', color: '#3a3a3c', letterSpacing: 2 },
  title:      { flex: 1, fontSize: 13, color: '#48484a' },
  hero:       { alignItems: 'center', marginBottom: 28 },
  zone:       { fontSize: 12, fontWeight: '800', letterSpacing: 3, marginBottom: 6 },
  score:      { fontSize: 112, fontWeight: '900', lineHeight: 120, letterSpacing: -4 },
  barTrack:   { width: '100%', height: 3, backgroundColor: '#1c1c1e', borderRadius: 2, overflow: 'hidden', marginTop: 8 },
  barFill:    { height: '100%', borderRadius: 2 },
  card:       { backgroundColor: '#111', borderRadius: 18, paddingHorizontal: 20, paddingVertical: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  timer:      { fontSize: 44, fontWeight: '900', color: '#fff', letterSpacing: -2 },
  prog:       { alignItems: 'flex-end', gap: 4 },
  progPct:    { fontSize: 12, color: '#48484a' },
  progTrack:  { width: 72, height: 4, backgroundColor: '#1c1c1e', borderRadius: 2, overflow: 'hidden' },
  progFill:   { height: '100%', backgroundColor: '#d4f57a40', borderRadius: 2 },
  progLabel:  { fontSize: 11, color: '#3a3a3c' },
  app:        { fontSize: 13, color: '#3a3a3c', marginBottom: 10, marginLeft: 4 },
  phoneLabel: { fontSize: 12, fontWeight: '700', color: '#3a3a3c', letterSpacing: 1 },
  phoneCount: { fontSize: 26, fontWeight: '800', color: '#2a2a2e', letterSpacing: -0.5 },
  endBtn:      { backgroundColor: '#1c1c1e', borderRadius: 16, paddingVertical: 18, alignItems: 'center', marginTop: 8 },
  endBtnText:  { fontSize: 15, fontWeight: '700', color: '#ff453a' },
  stopBtn:     { backgroundColor: '#1c1c1e', borderRadius: 16, paddingVertical: 18, alignItems: 'center', marginTop: 8 },
  stopBtnText: { fontSize: 15, fontWeight: '700', color: '#ff453a' },
  actionRow:         { flexDirection: 'row', gap: 8, marginBottom: 10 },
  checkBtn:          { flex: 1, backgroundColor: '#111', borderRadius: 16, paddingVertical: 18, alignItems: 'center' },
  checkBtnActive:    { backgroundColor: '#d4f57a20', borderWidth: 1, borderColor: '#d4f57a40' },
  checkBtnText:      { fontSize: 14, fontWeight: '700', color: '#8a8a8e' },
  checkBtnTextActive:{ color: '#d4f57a' },
  addPhotoBtn:       { flex: 1, backgroundColor: '#d4f57a15', borderWidth: 1, borderColor: '#d4f57a30', borderRadius: 16, paddingVertical: 18, alignItems: 'center' },
  addPhotoBtnFull:   { opacity: 0.35 },
  addPhotoBtnText:   { fontSize: 14, fontWeight: '700', color: '#d4f57a' },
});

const st = StyleSheet.create({
  homeWrap:        { paddingHorizontal: 20, paddingTop: 64, paddingBottom: 40, flexGrow: 1 },
  homeHeader:      { marginBottom: 48 },
  homeLogo:        { fontSize: 44, fontWeight: '900', color: '#fff', letterSpacing: -2 },
  homeSub:         { fontSize: 14, color: '#3a3a3c', marginTop: 6 },
  heroBtn:         { borderRadius: 28, paddingHorizontal: 28, paddingVertical: 32, marginBottom: 14, alignItems: 'flex-start' },
  heroBtnPhone:    { backgroundColor: '#d4f57a' },
  heroBtnMac:      { backgroundColor: '#4f46e5' },
  heroBtnEmoji:    { fontSize: 40, marginBottom: 16 },
  heroBtnTitle:    { fontSize: 30, fontWeight: '900', color: '#000', letterSpacing: -1.2, marginBottom: 6 },
  heroBtnDesc:     { fontSize: 14, color: 'rgba(0,0,0,0.55)' },
  back:            { fontSize: 14, color: '#48484a', marginBottom: 8 },
  scroll:          { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 60 },
  heading:         { fontSize: 28, fontWeight: '800', color: '#fff', letterSpacing: -1, marginBottom: 24 },
  label:           { fontSize: 12, fontWeight: '700', color: '#3a3a3c', letterSpacing: 1, marginBottom: 8, marginTop: 20 },
  labelOpt:        { fontSize: 11, color: '#2a2a2e', fontWeight: '400', letterSpacing: 0 },
  input:           { backgroundColor: '#111', borderRadius: 14, paddingHorizontal: 18, paddingVertical: 16, fontSize: 16, color: '#fff' },
  picker:          { backgroundColor: '#111', borderRadius: 14, paddingHorizontal: 18, paddingVertical: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pickerText:      { fontSize: 16, color: '#fff' },
  pickerArrow:     { fontSize: 11, color: '#3a3a3c' },
  catList:         { backgroundColor: '#111', borderRadius: 14, overflow: 'hidden', marginTop: 2 },
  catItem:         { paddingHorizontal: 18, paddingVertical: 14 },
  catItemActive:   { backgroundColor: '#1c1c1e' },
  catText:         { fontSize: 15, color: '#48484a' },
  catTextActive:   { color: '#d4f57a', fontWeight: '600' },
  startBtn:        { backgroundColor: '#d4f57a', borderRadius: 16, paddingVertical: 20, alignItems: 'center', marginTop: 36 },
  startBtnDisabled:{ opacity: 0.3 },
  startBtnText:    { fontSize: 17, fontWeight: '800', color: '#000', letterSpacing: -0.3 },
  macNote:         { fontSize: 12, color: '#3a3a3c', textAlign: 'center', marginTop: 12 },
});
