import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator,
  TouchableOpacity, RefreshControl, SafeAreaView, Dimensions, Image, Animated,
} from 'react-native';
import { Link } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { getSessions } from '../src/lib/storage';

const W       = Dimensions.get('window').width;
const PAD     = 14;
const GAP     = 6;
const COL_W   = Math.round((W - PAD * 2 - GAP * 2) / 3);
const CARD_H  = Math.round(COL_W * 4 / 3);

function scoreColor(s) {
  if (s >= 70) return '#d4f57a';
  if (s >= 40) return '#ffd60a';
  return '#ff453a';
}

function fmtDate(ts) {
  const diff = (Date.now() - ts) / 86400000;
  if (diff < 1) return '今日';
  if (diff < 2) return '昨日';
  return new Date(ts).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
}

function fmtMin(m) {
  if (!m) return '0m';
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60}m`;
}

const CAT_ICONS = {
  Programming: '💻', Writing: '✍️', Design: '🎨', Research: '🔍',
  Study: '📚', 'Admin / Email': '📧', 'Free Work': '🌊', 'General Work': '⚡',
};

function fmtScore(n) {
  if (!n || n < 1) return '0';
  if (n >= 1_000_000) return `${parseFloat((n / 1_000_000).toFixed(2))}M`;
  if (n >= 1_000)     return `${parseFloat((n / 1_000).toFixed(2))}k`;
  return String(Math.round(n));
}

function calcTotal(item) {
  const avg  = Math.round(item.averageWorkScore ?? 0);
  const mins = item.durationMinutes || 1;
  const raw  = item.totalWorkScore;
  // Old formula gave mins*avg/10 (small). New formula is secs*avg (large).
  // If raw is missing or < avg*mins, it's old/invalid — recalculate.
  if (!raw || raw < avg * mins) return Math.round(avg * mins * 60);
  return raw;
}

function GridCard({ item }) {
  const avg   = Math.round(item.averageWorkScore ?? 0);
  const total = calcTotal(item);
  const color = scoreColor(avg);
  const icon  = CAT_ICONS[item.category] || '🎯';

  return (
    <Link href={`/session/${item.id}`} asChild>
      <TouchableOpacity style={gc.card} activeOpacity={0.8}>
        {item.photoUri
          ? <Image source={{ uri: item.photoUri }} style={gc.photo} resizeMode="cover" />
          : <View style={[gc.noPhoto, { borderTopColor: color }]}>
              <Text style={gc.icon}>{icon}</Text>
            </View>
        }
        <View style={gc.overlay}>
          <Text style={[gc.overlayScore, { color }]}>{fmtScore(total)}</Text>
          <Text style={gc.overlayAvg}>avg {avg}</Text>
          <Text style={gc.overlayTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={gc.overlayDate}>{fmtDate(item.startedAt)}</Text>
        </View>
      </TouchableOpacity>
    </Link>
  );
}

// Group sessions into rows of 3 for a stable, predictable layout
function groupRows(arr) {
  const rows = [];
  for (let i = 0; i < arr.length; i += 3) rows.push(arr.slice(i, i + 3));
  return rows;
}

export default function RecordsScreen() {
  const [sessions,   setSessions]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const load = useCallback(async () => {
    try {
      const data = await getSessions();
      setSessions([...data].sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0)));
      setError(null);
    } catch (_e) {
      setError('データを取得できませんでした');
    }
  }, []);

  useEffect(() => {
    load().finally(() => {
      setLoading(false);
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    });
  }, [load]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const todaySessions = sessions.filter(s => (Date.now() - (s.startedAt || 0)) / 86400000 < 1);
  const todayAvg = todaySessions.length
    ? Math.round(todaySessions.reduce((acc, s) => acc + (s.averageWorkScore || 0), 0) / todaySessions.length)
    : null;
  const todayTotal = todaySessions.reduce((acc, s) => acc + calcTotal(s), 0);

  const rows = groupRows(sessions);

  const Header = (
    <View style={s.header}>
      <Text style={s.heading}>記録</Text>
      {todaySessions.length > 0 && (
        <View style={s.statsRow}>
          <View style={s.statCard}>
            <Text style={[s.statNum, { color: scoreColor(todayAvg ?? 0) }]}>{fmtScore(todayTotal)}</Text>
            <Text style={s.statLbl}>今日の合計</Text>
          </View>
          {todayAvg !== null && (
            <View style={s.statCard}>
              <Text style={[s.statNum, { color: scoreColor(todayAvg) }]}>{todayAvg}</Text>
              <Text style={s.statLbl}>平均スコア</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={s.root}>
        <ActivityIndicator color="#d4f57a" style={{ marginTop: 80 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.root}>
      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        <FlatList
          data={rows}
          keyExtractor={(_, i) => String(i)}
          renderItem={({ item: row }) => (
            <View style={s.row}>
              {row.map(item => <GridCard key={item.id} item={item} />)}
            </View>
          )}
          contentContainerStyle={s.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#d4f57a" />}
          ListHeaderComponent={Header}
          ListEmptyComponent={
            <Text style={s.empty}>{error ?? 'セッションがありません'}</Text>
          }
        />
      </Animated.View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#000' },
  list:    { paddingHorizontal: PAD, paddingBottom: 40 },
  header:  { paddingTop: 16, marginBottom: 20 },
  heading: { fontSize: 34, fontWeight: '900', color: '#fff', letterSpacing: -1.5, marginBottom: 20 },

  statsRow: { flexDirection: 'row', gap: 12 },
  statCard: { flex: 1, backgroundColor: '#111', borderRadius: 22, paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  statNum:  { fontSize: 36, fontWeight: '900', color: '#fff', letterSpacing: -1.5, lineHeight: 40 },
  statLbl:  { fontSize: 12, color: '#48484a', marginTop: 5, fontWeight: '700', letterSpacing: 0.8 },

  row:   { flexDirection: 'row', gap: GAP, marginBottom: GAP },
  empty: { textAlign: 'center', color: '#3a3a3c', fontSize: 14, marginTop: 60 },
});

const gc = StyleSheet.create({
  card:    { width: COL_W, height: CARD_H, backgroundColor: '#111', borderRadius: 16, overflow: 'hidden' },
  photo:   { width: '100%', height: '100%', position: 'absolute' },
  noPhoto: { width: '100%', height: '100%', position: 'absolute', backgroundColor: '#111', borderTopWidth: 3, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 14 },
  icon:    { fontSize: 20 },
  overlay: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 8, paddingTop: 14, paddingBottom: 10, backgroundColor: 'rgba(0,0,0,0.65)' },
  overlayScore: { fontSize: 20, fontWeight: '900', letterSpacing: -0.5, lineHeight: 24 },
  overlayAvg:   { fontSize: 8,  color: 'rgba(255,255,255,0.45)', marginTop: 1 },
  overlayTitle: { fontSize: 9,  color: 'rgba(255,255,255,0.7)', fontWeight: '600', marginTop: 3 },
  overlayDate:  { fontSize: 8,  color: 'rgba(255,255,255,0.35)', marginTop: 1 },
});
