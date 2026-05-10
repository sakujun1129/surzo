import { useState, useMemo } from 'react';
import {
  View, Text, FlatList, StyleSheet, SafeAreaView,
  TouchableOpacity, ScrollView,
} from 'react-native';

const PERIODS = ['1h', '1日', '1週', '1月', '1年'];
const SCOPES  = ['世界', '国別', 'フレンド'];

function scoreColor(s) {
  return s >= 70 ? '#d4f57a' : s >= 40 ? '#ffd60a' : '#ff453a';
}

// ─── Mock data ────────────────────────────────────────────────────────────────
// "Quantity" leaders – many sessions, solid avg → dominate total ranking
// "Quality" players – high avg, fewer sessions → dominate avg ranking
// This creates clear divergence between total and avg orderings
const MOCK_BASE = [
  { id:'1',  name:'Park Jimin',   flag:'🇰🇷', country:'Korea',    total:10800, avg:84, sessions:128 },
  { id:'2',  name:'Lin Wei',      flag:'🇨🇳', country:'China',    total:9936,  avg:72, sessions:138 },
  { id:'3',  name:'Mateo García', flag:'🇪🇸', country:'Spain',    total:9164,  avg:79, sessions:116 },
  { id:'4',  name:'山本 葵',      flag:'🇯🇵', country:'Japan',    total:8470,  avg:77, sessions:110 },
  { id:'5',  name:'Léa Martin',   flag:'🇫🇷', country:'France',   total:7800,  avg:75, sessions:104 },
  { id:'6',  name:'Omar Hassan',  flag:'🇪🇬', country:'Egypt',    total:6900,  avg:69, sessions:100 },
  { id:'me', name:'You',          flag:'🇯🇵', country:'Japan',    total:6384,  avg:76, sessions:84, isMe:true },
  { id:'8',  name:'Carlos Lima',  flag:'🇧🇷', country:'Brazil',   total:4800,  avg:60, sessions:80  },
  { id:'9',  name:'Alex Kim',     flag:'🇺🇸', country:'USA',      total:5848,  avg:68, sessions:86  },
  { id:'10', name:'鈴木 海斗',    flag:'🇯🇵', country:'Japan',    total:5590,  avg:65, sessions:86  },
  { id:'11', name:'田中 蓮',      flag:'🇯🇵', country:'Japan',    total:4700,  avg:94, sessions:50  },
  { id:'12', name:'Emma Weber',   flag:'🇩🇪', country:'Germany',  total:4095,  avg:91, sessions:45  },
  { id:'13', name:'Sofia Rossi',  flag:'🇮🇹', country:'Italy',    total:3784,  avg:88, sessions:43  },
  { id:'14', name:'Hana Novak',   flag:'🇨🇿', country:'Czech',    total:5166,  avg:63, sessions:82  },
  { id:'15', name:'Yui Tanaka',   flag:'🇯🇵', country:'Japan',    total:4350,  avg:58, sessions:75  },
  { id:'16', name:'Tom Baker',    flag:'🇬🇧', country:'UK',       total:3960,  avg:55, sessions:72  },
  { id:'17', name:'Nadia Petrov', flag:'🇷🇺', country:'Russia',   total:3588,  avg:52, sessions:69  },
  { id:'18', name:'David Chen',   flag:'🇹🇼', country:'Taiwan',   total:3200,  avg:50, sessions:64  },
  { id:'19', name:'Aisha Osei',   flag:'🇬🇭', country:'Ghana',    total:2784,  avg:48, sessions:58  },
  { id:'20', name:'Ivan Petrov',  flag:'🇧🇬', country:'Bulgaria', total:2385,  avg:45, sessions:53  },
];

// フレンドデータ（少人数）
const FRIENDS_DATA = [
  { id:'f1', name:'前田 颯太',   flag:'🇯🇵', country:'Japan', total:8100, avg:83, sessions:97 },
  { id:'me', name:'You',         flag:'🇯🇵', country:'Japan', total:6384, avg:76, sessions:84, isMe:true },
  { id:'f2', name:'Kenji Mori',  flag:'🇯🇵', country:'Japan', total:5200, avg:71, sessions:73 },
  { id:'f3', name:'Sara Wells',  flag:'🇺🇸', country:'USA',   total:3900, avg:88, sessions:44 },
  { id:'f4', name:'中村 結衣',   flag:'🇯🇵', country:'Japan', total:3200, avg:59, sessions:54 },
];

// 国別（Japanのみ）
const COUNTRY_DATA = MOCK_BASE.filter(u => u.country === 'Japan');

function getRows(scope, period, metric) {
  let base = scope === 'フレンド' ? FRIENDS_DATA
           : scope === '国別'    ? COUNTRY_DATA
           : MOCK_BASE;

  // period multiplier (simulate different time windows)
  const mult = { '1h':0.02, '1日':0.12, '1週':0.6, '1月':1, '1年':5 }[period] ?? 1;

  base = base.map(u => ({
    ...u,
    displayScore: metric === '合計'
      ? Math.round(u.total * mult)
      : u.avg,
    displaySessions: Math.max(1, Math.round(u.sessions * mult)),
  }));

  return [...base].sort((a, b) => b.displayScore - a.displayScore);
}

function medal(r) {
  return r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : null;
}

function fmtScore(n, metric) {
  if (metric === '合計') {
    return n >= 1000 ? `${(n/1000).toFixed(1)}k` : String(n);
  }
  return String(n);
}

// ─── Components ───────────────────────────────────────────────────────────────
function PillRow({ items, active, onSelect }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={c.pillScroll} contentContainerStyle={c.pillWrap}>
      {items.map(item => (
        <TouchableOpacity
          key={item}
          style={[c.pill, active === item && c.pillActive]}
          onPress={() => onSelect(item)}
          activeOpacity={0.7}>
          <Text style={[c.pillText, active === item && c.pillTextActive]}>{item}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

function ScopeTab({ items, active, onSelect }) {
  return (
    <View style={c.scopeRow}>
      {items.map(item => (
        <TouchableOpacity
          key={item}
          style={[c.scopeTab, active === item && c.scopeTabActive]}
          onPress={() => onSelect(item)}
          activeOpacity={0.7}>
          <Text style={[c.scopeText, active === item && c.scopeTextActive]}>{item}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function RankRow({ item, rank, metric }) {
  const m = medal(rank);
  const color = scoreColor(item.displayScore);
  return (
    <View style={[c.row, item.isMe && c.rowMe]}>
      <View style={c.rankBox}>
        {m
          ? <Text style={c.medal}>{m}</Text>
          : <Text style={[c.rankNum, rank <= 10 && { color: '#fff' }]}>{rank}</Text>}
      </View>
      <Text style={c.flag}>{item.flag}</Text>
      <View style={c.info}>
        <Text style={[c.name, item.isMe && { color: '#d4f57a' }]} numberOfLines={1}>{item.name}</Text>
        <Text style={c.sub}>{item.displaySessions} sessions</Text>
      </View>
      <Text style={[c.score, { color }]}>{fmtScore(item.displayScore, metric)}</Text>
    </View>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function RankingScreen() {
  const [period, setPeriod] = useState('1月');
  const [scope,  setScope]  = useState('世界');
  const [metric, setMetric] = useState('合計');

  const rows = useMemo(() => getRows(scope, period, metric), [scope, period, metric]);

  return (
    <SafeAreaView style={c.root}>
      <FlatList
        data={rows}
        keyExtractor={item => item.id}
        renderItem={({ item, index }) => (
          <RankRow item={item} rank={index + 1} metric={metric} />
        )}
        contentContainerStyle={c.list}
        ListHeaderComponent={
          <View>
            <Text style={c.heading}>Ranking</Text>

            {/* Period */}
            <PillRow items={PERIODS} active={period} onSelect={setPeriod} />

            {/* Scope */}
            <ScopeTab items={SCOPES} active={scope} onSelect={setScope} />

            {/* Metric toggle */}
            <View style={c.metricRow}>
              {['合計', '平均'].map(m => (
                <TouchableOpacity
                  key={m}
                  style={[c.metricBtn, metric === m && c.metricBtnActive]}
                  onPress={() => setMetric(m)}
                  activeOpacity={0.7}>
                  <Text style={[c.metricText, metric === m && c.metricTextActive]}>
                    {m === '合計' ? '合計 Work Score' : '平均 Work Score'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Column headers */}
            <View style={c.colHeader}>
              <Text style={c.colLabel}>Rank</Text>
              <View style={{ flex: 1 }} />
              <Text style={c.colLabel}>{metric === '合計' ? 'Total' : 'Avg'}</Text>
            </View>
          </View>
        }
        ListEmptyComponent={<Text style={c.empty}>データなし</Text>}
      />
    </SafeAreaView>
  );
}

const c = StyleSheet.create({
  root:    { flex: 1, backgroundColor: '#000' },
  list:    { paddingHorizontal: 16, paddingBottom: 40 },
  heading: { fontSize: 34, fontWeight: '900', color: '#fff', letterSpacing: -1.5, paddingTop: 16, marginBottom: 20 },

  // Period pills
  pillScroll: { marginBottom: 14 },
  pillWrap:   { gap: 8, paddingRight: 4 },
  pill:       { backgroundColor: '#111', borderRadius: 20, paddingHorizontal: 18, paddingVertical: 9 },
  pillActive: { backgroundColor: '#d4f57a' },
  pillText:   { fontSize: 14, fontWeight: '700', color: '#48484a' },
  pillTextActive: { color: '#000' },

  // Scope tabs
  scopeRow:     { flexDirection: 'row', backgroundColor: '#111', borderRadius: 14, padding: 4, marginBottom: 14 },
  scopeTab:     { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10 },
  scopeTabActive: { backgroundColor: '#1c1c1e' },
  scopeText:    { fontSize: 14, fontWeight: '700', color: '#3a3a3c' },
  scopeTextActive: { color: '#fff' },

  // Metric
  metricRow:     { flexDirection: 'row', gap: 8, marginBottom: 14 },
  metricBtn:     { flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: '#111', alignItems: 'center' },
  metricBtnActive: { backgroundColor: '#222' },
  metricText:    { fontSize: 13, fontWeight: '600', color: '#3a3a3c' },
  metricTextActive: { color: '#d4f57a' },

  // Column header
  colHeader: { flexDirection: 'row', paddingHorizontal: 4, marginBottom: 8 },
  colLabel:  { fontSize: 11, fontWeight: '600', color: '#2a2a2e', letterSpacing: 1 },

  // Rows
  row:    { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 14, marginBottom: 8 },
  rowMe:  { borderWidth: 1.5, borderColor: '#d4f57a40', backgroundColor: '#0f1a00' },
  rankBox:{ width: 32, alignItems: 'center' },
  medal:  { fontSize: 20 },
  rankNum:{ fontSize: 15, fontWeight: '800', color: '#2a2a2e' },
  flag:   { fontSize: 20, marginHorizontal: 10 },
  info:   { flex: 1 },
  name:   { fontSize: 15, fontWeight: '700', color: '#fff' },
  sub:    { fontSize: 11, color: '#3a3a3c', marginTop: 2 },
  score:  { fontSize: 26, fontWeight: '900', letterSpacing: -1 },
  empty:  { textAlign: 'center', color: '#3a3a3c', marginTop: 60, fontSize: 14 },
});
