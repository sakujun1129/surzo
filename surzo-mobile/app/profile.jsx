import { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  Alert, ScrollView,
} from 'react-native';
import { supabase } from '../src/lib/supabase';
import { getSessions } from '../src/lib/storage';

const CAT_ICONS = {
  Programming:'💻', Writing:'✍️', Design:'🎨', Research:'🔍',
  Study:'📚', 'Admin / Email':'📧', 'Free Work':'🌊', 'General Work':'⚡',
};

function scoreColor(s) {
  return s >= 70 ? '#d4f57a' : s >= 40 ? '#ffd60a' : '#ff453a';
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
function calcTotal(s) {
  const avg  = Math.round(s.averageWorkScore ?? 0);
  const mins = s.durationMinutes || 1;
  const raw  = s.totalWorkScore;
  if (!raw || raw < avg * mins) return Math.round(avg * mins * 60);
  return raw;
}
function medal(r) {
  return r === 1 ? '🥇' : r === 2 ? '🥈' : '🥉';
}
function fmtDate(ts) {
  return new Date(ts).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
}

export default function ProfileScreen() {
  const [email,   setEmail]   = useState('');
  const [stats,   setStats]   = useState({ count: 0, avg: 0, total: 0, totalScore: 0 });
  const [top3,    setTop3]    = useState([]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setEmail(user.email ?? '');
    });
    getSessions().then(sessions => {
      if (!sessions.length) return;
      const scores = sessions.map(s => s.averageWorkScore ?? 0);
      const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
      const totalMins = sessions.reduce((a, s) => a + (s.durationMinutes ?? 0), 0);
      const totalScore = sessions.reduce((a, s) => a + calcTotal(s), 0);
      setStats({ count: sessions.length, avg, total: totalMins, totalScore });
      const sorted = [...sessions].sort((a, b) => calcTotal(b) - calcTotal(a));
      setTop3(sorted.slice(0, 3));
    });
  }, []);

  const handleLogout = () => {
    Alert.alert('ログアウト', 'ログアウトしますか？', [
      { text: 'キャンセル', style: 'cancel' },
      { text: 'ログアウト', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ]);
  };

  return (
    <SafeAreaView style={s.root}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.heading}>Profile</Text>

        {/* Avatar */}
        <View style={s.avatarWrap}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{email ? email[0].toUpperCase() : '?'}</Text>
          </View>
          <Text style={s.email}>{email}</Text>
        </View>

        {/* Stats */}
        <View style={s.statsRow}>
          <View style={s.stat}>
            <Text style={s.statNum}>{stats.count}</Text>
            <Text style={s.statLabel}>Sessions</Text>
          </View>
          <View style={s.divider} />
          <View style={s.stat}>
            <Text style={[s.statNum, { color: scoreColor(stats.avg) }]}>{stats.avg || '—'}</Text>
            <Text style={s.statLabel}>Avg Score</Text>
          </View>
          <View style={s.divider} />
          <View style={s.stat}>
            <Text style={[s.statNum, { color: '#d4f57a' }]}>{fmtScore(stats.totalScore)}</Text>
            <Text style={s.statLabel}>Total Score</Text>
          </View>
        </View>

        {/* Top 3 */}
        {top3.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>BEST SESSIONS</Text>
            {top3.map((session, i) => {
              const avg   = Math.round(session.averageWorkScore ?? 0);
              const total = calcTotal(session);
              const color = scoreColor(avg);
              const icon  = CAT_ICONS[session.category] || '🎯';
              return (
                <View key={session.id} style={[s.topCard, i === 0 && s.topCard1]}>
                  <Text style={s.topMedal}>{medal(i + 1)}</Text>
                  <View style={s.topIcon}><Text style={{ fontSize: 22 }}>{icon}</Text></View>
                  <View style={s.topInfo}>
                    <Text style={s.topTitle} numberOfLines={1}>{session.title}</Text>
                    <Text style={s.topMeta}>{fmtDate(session.startedAt)} · avg {avg}</Text>
                  </View>
                  <Text style={[s.topScore, { color }]}>{fmtScore(total)}</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Logout */}
        <TouchableOpacity style={s.logoutBtn} onPress={handleLogout} activeOpacity={0.7}>
          <Text style={s.logoutText}>ログアウト</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#000' },
  scroll:  { paddingHorizontal: 20, paddingBottom: 48 },
  heading: { fontSize: 34, fontWeight: '900', color: '#fff', letterSpacing: -1.5, paddingTop: 16, marginBottom: 28 },

  avatarWrap: { alignItems: 'center', marginBottom: 32 },
  avatar:     { width: 80, height: 80, borderRadius: 40, backgroundColor: '#1c1c1e', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  avatarText: { fontSize: 32, fontWeight: '800', color: '#d4f57a' },
  email:      { fontSize: 14, color: '#48484a' },

  statsRow: { flexDirection: 'row', backgroundColor: '#111', borderRadius: 20, paddingVertical: 20, marginBottom: 32 },
  stat:     { flex: 1, alignItems: 'center' },
  divider:  { width: 1, backgroundColor: '#1c1c1e' },
  statNum:  { fontSize: 24, fontWeight: '900', color: '#fff', letterSpacing: -0.5 },
  statLabel:{ fontSize: 11, color: '#3a3a3c', marginTop: 4, fontWeight: '600' },

  section:      { marginBottom: 24 },
  sectionTitle: { fontSize: 11, fontWeight: '800', color: '#2a2a2e', letterSpacing: 2, marginBottom: 12 },

  topCard:  { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111', borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, marginBottom: 8 },
  topCard1: { borderWidth: 1, borderColor: '#d4f57a20', backgroundColor: '#0f1a00' },
  topMedal: { fontSize: 22, width: 30 },
  topIcon:  { width: 36, height: 36, borderRadius: 10, backgroundColor: '#1c1c1e', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  topInfo:  { flex: 1 },
  topTitle: { fontSize: 14, fontWeight: '700', color: '#fff' },
  topMeta:  { fontSize: 11, color: '#3a3a3c', marginTop: 2 },
  topScore: { fontSize: 28, fontWeight: '900', letterSpacing: -1 },

  logoutBtn:  { backgroundColor: '#111', borderRadius: 16, paddingVertical: 18, alignItems: 'center', marginTop: 8 },
  logoutText: { fontSize: 15, fontWeight: '600', color: '#ff453a' },
});
