import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, SafeAreaView,
  Modal, FlatList, Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../src/lib/supabase';

const { width: W } = Dimensions.get('window');

const SLIDES = [
  {
    icon: '🎯',
    title: 'Surzoとは',
    body: 'MacとiPhoneを連携させて、作業セッションの集中度を記録するアプリです。PCの使用状況とスマホのチェック回数をもとにWork Scoreを算出します。',
  },
  {
    icon: '📊',
    title: 'Work Score',
    body: 'Macで使用中のアプリをもとに、集中度を0〜100のスコアで表示します。スコアは5段階のゾーン（DEEP FOCUS / ON TRACK / FOCUSED / DRIFTING / OFF TASK）に分類されます。',
  },
  {
    icon: '📱',
    title: 'スマホチェックの記録',
    body: 'セッション中にスマホを確認するときは「Check Phone」をタップします。タップした時間帯のみスマホ使用として記録され、それ以外の時間はカウントされません。',
  },
  {
    icon: '📸',
    title: 'セッションの記録',
    body: 'セッション終了後、Work Score・作業時間・カテゴリが自動で保存されます。写真を1〜3枚追加することができます。過去の記録はいつでも確認できます。',
  },
  {
    icon: '⚙️',
    title: 'はじめ方',
    body: '同じアカウントでMacとiPhoneにログインすると、自動的に連携されます。連携後はスマホからセッションの開始・終了を操作できます。',
  },
];

function OnboardingModal({ visible, onClose }) {
  const [idx, setIdx] = useState(0);
  const listRef = useRef(null);

  const goTo = (i) => {
    setIdx(i);
    listRef.current?.scrollToIndex({ index: i, animated: true });
  };

  const isLast = idx === SLIDES.length - 1;

  return (
    <Modal visible={visible} animationType="fade" statusBarTranslucent>
      <View style={ob.root}>
        <StatusBar style="light" />
        <TouchableOpacity style={ob.closeBtn} onPress={onClose} activeOpacity={0.7}>
          <Text style={ob.closeText}>閉じる</Text>
        </TouchableOpacity>
        <FlatList
          ref={listRef}
          data={SLIDES}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(_, i) => String(i)}
          getItemLayout={(_, i) => ({ length: W, offset: W * i, index: i })}
          onMomentumScrollEnd={e => {
            const i = Math.round(e.nativeEvent.contentOffset.x / W);
            setIdx(i);
          }}
          renderItem={({ item }) => (
            <View style={ob.slide}>
              <Text style={ob.icon}>{item.icon}</Text>
              <Text style={ob.title}>{item.title}</Text>
              <Text style={ob.body}>{item.body}</Text>
            </View>
          )}
        />
        <View style={ob.dots}>
          {SLIDES.map((_, i) => (
            <TouchableOpacity key={i} onPress={() => goTo(i)} activeOpacity={0.7}>
              <View style={[ob.dot, i === idx && ob.dotActive]} />
            </TouchableOpacity>
          ))}
        </View>
        <View style={ob.btnRow}>
          {idx > 0 && (
            <TouchableOpacity style={ob.btnBack} onPress={() => goTo(idx - 1)} activeOpacity={0.8}>
              <Text style={ob.btnBackText}>戻る</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[ob.btnNext, idx === 0 && { flex: 1 }]}
            onPress={isLast ? onClose : () => goTo(idx + 1)}
            activeOpacity={0.8}>
            <Text style={ob.btnNextText}>{isLast ? '始める' : '次へ'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const ob = StyleSheet.create({
  root:        { flex: 1, backgroundColor: '#000', paddingBottom: 48 },
  closeBtn:    { position: 'absolute', top: 56, right: 24, zIndex: 10 },
  closeText:   { color: '#48484a', fontSize: 15, fontWeight: '600' },
  slide:       { width: W, flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  icon:        { fontSize: 64, marginBottom: 32 },
  title:       { fontSize: 26, fontWeight: '900', color: '#fff', textAlign: 'center', marginBottom: 16, letterSpacing: -0.5 },
  body:        { fontSize: 15, color: '#8a8a8e', textAlign: 'center', lineHeight: 24 },
  dots:        { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 24 },
  dot:         { width: 8, height: 8, borderRadius: 4, backgroundColor: '#2a2a2e' },
  dotActive:   { width: 24, backgroundColor: '#d4f57a' },
  btnRow:      { flexDirection: 'row', gap: 12, paddingHorizontal: 24 },
  btnBack:     { flex: 1, paddingVertical: 16, borderRadius: 20, backgroundColor: '#1c1c1e', alignItems: 'center' },
  btnBackText: { color: '#aeaeb2', fontSize: 15, fontWeight: '700' },
  btnNext:     { flex: 1, paddingVertical: 16, borderRadius: 20, backgroundColor: '#d4f57a', alignItems: 'center' },
  btnNextText: { color: '#000', fontSize: 15, fontWeight: '700' },
});

export default function PairScreen() {
  const [mode,     setMode]     = useState('login');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [done,     setDone]     = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('surzo-onboarding-v4').then(val => {
      if (!val) setShowOnboarding(true);
    });
  }, []);

  const handleCloseOnboarding = async () => {
    await AsyncStorage.setItem('surzo-onboarding-v4', '1');
    setShowOnboarding(false);
  };

  const handle = async () => {
    if (!email || !password) return;
    setLoading(true);
    setError(null);
    const { error } = mode === 'login'
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });
    if (error) {
      setError(error.message);
    } else if (mode === 'login') {
      router.replace('/');
    } else {
      setDone(true);
    }
    setLoading(false);
  };

  if (done) {
    return (
      <SafeAreaView style={s.root}>
        <View style={s.doneWrap}>
          <Text style={s.doneIcon}>📬</Text>
          <Text style={s.doneTitle}>メールを確認してください</Text>
          <Text style={s.doneSub}>届いたリンクをタップしてから{'\n'}ログインしてください</Text>
          <TouchableOpacity style={s.switchBtn} onPress={() => { setDone(false); setMode('login'); }}>
            <Text style={s.switchText}>ログインに戻る</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.root}>
      <OnboardingModal visible={showOnboarding} onClose={handleCloseOnboarding} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.inner}>
        <View style={s.header}>
          <Text style={s.logo}>Surzo</Text>
          <Text style={s.tagline}>Work smarter. Track deeper.</Text>
        </View>

        <View style={s.form}>
          <TextInput
            style={s.input}
            placeholder="メールアドレス"
            placeholderTextColor="#3a3a3c"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TextInput
            style={s.input}
            placeholder="パスワード（8文字以上）"
            placeholderTextColor="#3a3a3c"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          {error ? <Text style={s.error}>{error}</Text> : null}

          <TouchableOpacity
            style={[s.btn, loading && { opacity: 0.5 }]}
            onPress={handle}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#000" />
              : <Text style={s.btnText}>{mode === 'login' ? 'ログイン' : 'アカウント作成'}</Text>}
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={s.switchBtn}
          onPress={() => { setMode(m => m === 'login' ? 'signup' : 'login'); setError(null); }}
        >
          <Text style={s.switchText}>
            {mode === 'login' ? 'アカウントをお持ちでない方' : 'すでにアカウントをお持ちの方'}
          </Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root:      { flex: 1, backgroundColor: '#000' },
  inner:     { flex: 1, paddingHorizontal: 28, justifyContent: 'center' },
  header:    { marginBottom: 48 },
  logo:      { fontSize: 40, fontWeight: '800', color: '#fff', letterSpacing: -1 },
  tagline:   { fontSize: 14, color: '#48484a', marginTop: 4 },
  form:      { gap: 12 },
  input: {
    backgroundColor: '#1c1c1e', borderRadius: 14,
    paddingHorizontal: 18, paddingVertical: 16,
    fontSize: 16, color: '#fff',
  },
  error:     { color: '#ff453a', fontSize: 13, paddingLeft: 4 },
  btn: {
    backgroundColor: '#d4f57a', borderRadius: 14,
    paddingVertical: 18, alignItems: 'center', marginTop: 4,
  },
  btnText:   { color: '#000', fontWeight: '800', fontSize: 16, letterSpacing: -0.3 },
  switchBtn: { alignItems: 'center', marginTop: 28 },
  switchText:{ color: '#48484a', fontSize: 14 },
  doneWrap:  { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  doneIcon:  { fontSize: 56, marginBottom: 20 },
  doneTitle: { fontSize: 22, fontWeight: '700', color: '#fff', marginBottom: 10 },
  doneSub:   { fontSize: 14, color: '#48484a', textAlign: 'center', lineHeight: 22 },
});
