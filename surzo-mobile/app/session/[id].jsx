import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, SafeAreaView, TouchableOpacity, Share, Image, Alert, FlatList } from 'react-native';
import Svg, { Path, Line, Circle } from 'react-native-svg';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getSessions, saveSession, uploadPhoto, getSessionPhoto, getSessionPhotos, addSessionPhoto, setCoverPhoto } from '../../src/lib/storage';

function smoothPath(pts) {
  if (pts.length < 2) return '';
  const segs = [`M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    segs.push(`C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`);
  }
  return segs.join(' ');
}

function scoreColor(score) {
  if (score >= 70) return '#d4f57a';
  if (score >= 40) return '#ffd60a';
  return '#ff453a';
}

function fmtMin(min) {
  if (!min) return '0m';
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}

function fmtScore(n) {
  if (!n || n < 1) return '0';
  if (n >= 1_000_000) return `${parseFloat((n / 1_000_000).toFixed(2))}M`;
  if (n >= 1_000)     return `${parseFloat((n / 1_000).toFixed(2))}k`;
  return String(Math.round(n));
}

function Row({ label, value, valueColor }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={[s.rowValue, valueColor && { color: valueColor }]}>{value}</Text>
    </View>
  );
}

function ScoreLine({ series }) {
  const [w, setW] = useState(0);
  if (!series || series.length < 2) {
    return <Text style={{ color: '#3a3a3c', textAlign: 'center', paddingVertical: 20, fontSize: 13 }}>記録データなし</Text>;
  }
  const H = 90, PAD = 8;
  const W = w || 300;
  const maxT = series[series.length - 1].t || 1;
  const pts  = series.map(({ t, s }) => ({
    x: PAD + (t / maxT) * (W - PAD * 2),
    y: PAD + (1 - s / 100) * (H - PAD * 2),
  }));
  const d    = smoothPath(pts);
  const area = `${d} L${pts[pts.length - 1].x},${H} L${pts[0].x},${H} Z`;
  const last  = series[series.length - 1].s;
  const color = last >= 70 ? '#d4f57a' : last >= 40 ? '#ffd60a' : '#ff453a';
  const y40   = (PAD + (1 - 0.4) * (H - PAD * 2)).toFixed(1);
  const y70   = (PAD + (1 - 0.7) * (H - PAD * 2)).toFixed(1);
  return (
    <View onLayout={e => setW(e.nativeEvent.layout.width)}>
      <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <Line x1={PAD} y1={y70} x2={W - PAD} y2={y70} stroke="#d4f57a" strokeOpacity="0.15" strokeWidth="1" strokeDasharray="3,4" />
        <Line x1={PAD} y1={y40} x2={W - PAD} y2={y40} stroke="#ffd60a" strokeOpacity="0.15" strokeWidth="1" strokeDasharray="3,4" />
        <Path d={area} fill={color} fillOpacity="0.08" />
        <Path d={d} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {pts.map((p, i) => (
          <Circle key={i} cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r="2.5" fill={color} fillOpacity="0.7" />
        ))}
      </Svg>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
        <Text style={{ fontSize: 11, color: '#3a3a3c' }}>0m</Text>
        <Text style={{ fontSize: 11, color: '#3a3a3c' }}>{maxT}m</Text>
      </View>
    </View>
  );
}

function ScoreBreakdown({ breakdown }) {
  const items = [
    { label: 'Focus',     value: breakdown.focusConsistency ?? 0,  color: '#d4f57a' },
    { label: 'Task',      value: breakdown.taskAlignment ?? 0,      color: '#38bdf8' },
    { label: 'Deep Work', value: breakdown.deepWorkRatio ?? 0,      color: '#a78bfa' },
    { label: 'Activity',  value: breakdown.activitySignal ?? 0,     color: '#fb923c' },
    { label: 'Recovery',  value: breakdown.recoveryReturn ?? 0,     color: '#34d399' },
  ];
  return (
    <View style={s.chart}>
      {items.map(item => (
        <View key={item.label} style={s.chartRow}>
          <Text style={s.chartLabel}>{item.label}</Text>
          <View style={s.chartBarBg}>
            <View style={[s.chartBarFill, { width: `${Math.min(100, item.value)}%`, backgroundColor: item.color }]} />
          </View>
          <Text style={s.chartValue}>{Math.round(item.value)}</Text>
        </View>
      ))}
    </View>
  );
}

export default function SessionDetail() {
  const { id, from } = useLocalSearchParams();
  const router  = useRouter();
  const handleBack = () => from === 'track' ? router.replace('/records') : router.back();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [photos,  setPhotos]  = useState([]);

  const handleShare = () => {
    if (!session) return;
    const sc = Math.round(session.averageWorkScore ?? 0);
    const icon = sc >= 90 ? '🔥' : sc >= 75 ? '⚡' : sc >= 60 ? '💪' : '📊';
    Share.share({
      message: `${icon} Work Session — surzo\n\n"${session.title}"\n${fmtMin(session.durationMinutes)} · Score: ${sc}\nDeep work: ${session.deepWorkBlocks ?? 0} blocks · Phone: ${session.phoneDistractionCount ?? 0}x\n\n#surzo #focusmode`,
    });
  };

  const handlePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('カメラ許可が必要です');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: true,
      aspect: [3, 4],
    });
    if (!result.canceled && result.assets?.[0]) {
      const url = await uploadPhoto(session.id, result.assets[0].uri);
      if (url?.startsWith('https://')) {
        await addSessionPhoto(session.id, url);
        const updated = { ...session, photoUri: session.photoUri || url };
        setSession(updated);
        await saveSession(updated);
        getSessionPhotos(session.id).then(setPhotos);
      }
    }
  };

  const handlePickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: true,
      aspect: [3, 4],
    });
    if (!result.canceled && result.assets?.[0]) {
      const url = await uploadPhoto(session.id, result.assets[0].uri);
      if (url?.startsWith('https://')) {
        await addSessionPhoto(session.id, url);
        const updated = { ...session, photoUri: session.photoUri || url };
        setSession(updated);
        await saveSession(updated);
        getSessionPhotos(session.id).then(setPhotos);
      }
    }
  };

  const handleSetCover = async (url) => {
    setSession(prev => ({ ...prev, photoUri: url }));
    await setCoverPhoto(session.id, url);
    getSessionPhotos(session.id).then(setPhotos);
  };

  const handlePhotoPress = () => {
    Alert.alert('写真を追加', '', [
      { text: 'カメラで撮る', onPress: handlePhoto },
      { text: 'ライブラリから選ぶ', onPress: handlePickPhoto },
      { text: 'キャンセル', style: 'cancel' },
    ]);
  };

  useEffect(() => {
    let alive = true;
    getSessions().then(async all => {
      if (!alive) return;
      const found = all.find(s => s.id === id) ?? null;
      if (found && !found.photoUri?.startsWith('https://')) {
        const url = await getSessionPhoto(id);
        if (url?.startsWith('https://')) found.photoUri = url;
      }
      setSession(found);
      setLoading(false);
    });
    const fetchPhotos = () =>
      getSessionPhotos(id).then(list => { if (alive) setPhotos(list); });
    fetchPhotos();
    // Polls to catch uploads that complete after navigation
    const t1 = setTimeout(fetchPhotos, 3000);
    const t2 = setTimeout(fetchPhotos, 8000);
    return () => { alive = false; clearTimeout(t1); clearTimeout(t2); };
  }, [id]);

  if (loading) {
    return (
      <SafeAreaView style={s.root}>
        <View style={s.center}><ActivityIndicator color="#d4f57a" /></View>
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={s.root}>
        <View style={s.center}><Text style={s.empty}>セッションが見つかりません</Text></View>
      </SafeAreaView>
    );
  }

  const score = Math.round(session.averageWorkScore ?? 0);
  const sb    = session.scoreBreakdown ?? {};
  const date  = new Date(session.startedAt).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <SafeAreaView style={s.root}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Nav */}
        <View style={s.nav}>
          <TouchableOpacity onPress={handleBack} style={s.navBtn}>
            <Text style={s.navBtnText}>← 戻る</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleShare} style={s.shareBtn}>
            <Text style={s.shareBtnText}>共有</Text>
          </TouchableOpacity>
        </View>

        {/* Photo */}
        <TouchableOpacity onPress={handlePhotoPress} style={s.photoWrap} activeOpacity={0.85}>
          {session.photoUri?.startsWith('https://') ? (
            <Image source={{ uri: session.photoUri }} style={s.photo} resizeMode="cover" />
          ) : (
            <View style={s.photoPlaceholder}>
              <Text style={s.photoIcon}>📷</Text>
              <Text style={s.photoHint}>写真を追加</Text>
            </View>
          )}
        </TouchableOpacity>
        {/* Gallery — multiple photos */}
        {photos.length > 1 && (
          <View style={{ marginBottom: 16 }}>
            <FlatList
              horizontal
              data={photos}
              keyExtractor={p => p.photo_url}
              showsHorizontalScrollIndicator={false}
              renderItem={({ item: p }) => (
                <TouchableOpacity onPress={() => handleSetCover(p.photo_url)} activeOpacity={0.8}
                  style={[s.thumb, p.photo_url === session.photoUri && s.thumbActive]}>
                  <Image source={{ uri: p.photo_url }} style={s.thumbImg} resizeMode="cover" />
                  <Text style={s.thumbStar}>{p.photo_url === session.photoUri ? '★' : '☆'}</Text>
                </TouchableOpacity>
              )}
              contentContainerStyle={{ gap: 8 }}
            />
            <Text style={s.galleryHint}>★ でトップ画面に使う写真を選択</Text>
          </View>
        )}

        <View style={s.hero}>
          <Text style={s.title} numberOfLines={2}>{session.title}</Text>
          <Text style={s.date}>{date} · {fmtMin(session.durationMinutes)}</Text>
          <Text style={[s.bigScore, { color: scoreColor(score) }]}>{fmtScore(session.totalWorkScore ?? score * (session.durationMinutes || 1) * 60)}</Text>
          <Text style={s.scoreLabel}>avg {score}</Text>
        </View>

        <View style={s.section}>
          <Row label="最大集中ブロック" value={fmtMin(session.bestFocusMinutes)} />
          <Row label="深作業ブロック"   value={`${session.deepWorkBlocks ?? 0}回`} />
          <Row label="スマホ離脱"       value={`${session.phoneDistractionCount ?? 0}回`}
               valueColor={session.phoneDistractionCount > 0 ? '#ff9f0a' : null} />
          <Row label="スマホ時間"       value={fmtMin(session.totalPhoneDistractionMinutes)} />
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Focus Timeline</Text>
          <ScoreLine series={session.scoreSeries} />
        </View>

        {Object.keys(sb).length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Focus Breakdown</Text>
            <ScoreBreakdown breakdown={sb} />
          </View>
        )}

        {session.positiveReasons?.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>良かった点</Text>
            {session.positiveReasons.map((r, i) => (
              <Text key={i} style={s.reason}>+ {r}</Text>
            ))}
          </View>
        )}

        {session.negativeReasons?.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>改善点</Text>
            {session.negativeReasons.map((r, i) => (
              <Text key={i} style={[s.reason, { color: '#ff9f0a' }]}>→ {r}</Text>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#000' },
  scroll: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 48 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty:  { color: '#3a3a3c', fontSize: 14 },

  nav:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  navBtn:     { paddingVertical: 6 },
  navBtnText: { fontSize: 14, color: '#48484a' },
  shareBtn:   { backgroundColor: '#1c1c1e', borderRadius: 20, paddingHorizontal: 18, paddingVertical: 8 },
  shareBtnText: { fontSize: 13, fontWeight: '700', color: '#d4f57a' },

  thumb:           { width: 64, height: 86, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#2a2a2e' },
  thumbActive:     { borderColor: '#d4f57a', borderWidth: 2 },
  thumbImg:        { width: '100%', height: '100%' },
  thumbStar:       { position: 'absolute', top: 3, right: 4, fontSize: 10, color: '#d4f57a' },
  galleryHint:     { fontSize: 10, color: '#3a3a3c', marginTop: 6 },
  photoWrap:       { width: '100%', aspectRatio: 3/4, borderRadius: 20, overflow: 'hidden', marginBottom: 12, backgroundColor: '#111' },
  photo:           { width: '100%', height: '100%' },
  photoPlaceholder:{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  photoIcon:       { fontSize: 36 },
  photoHint:       { fontSize: 13, color: '#3a3a3c', fontWeight: '600' },

  hero:       { marginBottom: 28 },
  title:      { fontSize: 24, fontWeight: '800', color: '#fff', letterSpacing: -0.5, marginBottom: 6 },
  date:       { fontSize: 13, color: '#48484a', marginBottom: 20 },
  bigScore:   { fontSize: 80, fontWeight: '900', letterSpacing: -3, lineHeight: 86 },
  scoreLabel: { fontSize: 13, color: '#3a3a3c', marginTop: 2 },

  section:      { backgroundColor: '#111', borderRadius: 18, padding: 18, marginBottom: 10 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: '#3a3a3c', letterSpacing: 1.5, marginBottom: 12 },
  row:          { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7 },
  rowLabel:     { fontSize: 14, color: '#48484a' },
  rowValue:     { fontSize: 14, fontWeight: '600', color: '#fff' },
  reason:       { fontSize: 14, color: '#48484a', paddingVertical: 4, lineHeight: 20 },
  chart:        { gap: 10 },
  chartRow:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
  chartLabel:   { fontSize: 12, color: '#48484a', width: 68 },
  chartBarBg:   { flex: 1, height: 6, backgroundColor: '#1c1c1e', borderRadius: 3, overflow: 'hidden' },
  chartBarFill: { height: '100%', borderRadius: 3 },
  chartValue:   { fontSize: 12, fontWeight: '700', color: '#fff', width: 28, textAlign: 'right' },
});
