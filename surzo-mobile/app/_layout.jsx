import { useEffect, useState, useRef } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Modal, Dimensions, StyleSheet,
} from 'react-native';
import { Tabs, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../src/lib/supabase';

const { width: W } = Dimensions.get('window');

const SLIDES = [
  { icon: '🎯', title: 'Surzoとは', body: 'MacとiPhoneを連携させて、作業セッションの集中度を記録するアプリです。PCの使用状況とスマホのチェック回数をもとにWork Scoreを算出します。' },
  { icon: '📊', title: 'Work Score', body: 'Macで使用中のアプリをもとに、集中度を0〜100のスコアで表示します。スコアは5段階のゾーン（DEEP FOCUS / ON TRACK / FOCUSED / DRIFTING / OFF TASK）に分類されます。' },
  { icon: '📱', title: 'スマホチェックの記録', body: 'セッション中にスマホを確認するときは「Check Phone」をタップします。タップした時間帯のみスマホ使用として記録され、それ以外の時間はカウントされません。' },
  { icon: '📸', title: 'セッションの記録', body: 'セッション終了後、Work Score・作業時間・カテゴリが自動で保存されます。写真を1〜3枚追加することができます。過去の記録はいつでも確認できます。' },
  { icon: '⚙️', title: 'はじめ方', body: '同じアカウントでMacとiPhoneにログインすると、自動的に連携されます。連携後はスマホからセッションの開始・終了を操作できます。' },
];

function OnboardingModal({ visible, onClose }) {
  const [idx, setIdx] = useState(0);
  const listRef = useRef(null);
  const goTo = (i) => { setIdx(i); listRef.current?.scrollToIndex({ index: i, animated: true }); };
  const isLast = idx === SLIDES.length - 1;
  return (
    <Modal visible={visible} animationType="fade" statusBarTranslucent>
      <View style={ob.root}>
        <StatusBar style="light" />
        <TouchableOpacity style={ob.closeBtn} onPress={onClose} activeOpacity={0.7}>
          <Text style={ob.closeText}>閉じる</Text>
        </TouchableOpacity>
        <FlatList ref={listRef} data={SLIDES} horizontal pagingEnabled showsHorizontalScrollIndicator={false}
          keyExtractor={(_, i) => String(i)}
          getItemLayout={(_, i) => ({ length: W, offset: W * i, index: i })}
          onMomentumScrollEnd={e => setIdx(Math.round(e.nativeEvent.contentOffset.x / W))}
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
          <TouchableOpacity style={[ob.btnNext, idx === 0 && { flex: 1 }]}
            onPress={isLast ? onClose : () => goTo(idx + 1)} activeOpacity={0.8}>
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

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const TAB = { backgroundColor: '#000', borderTopColor: '#111', paddingTop: 4 };
const opts = (title, icon) => ({
  title,
  tabBarIcon: ({ color, size }) => <Ionicons name={icon} size={size} color={color} />,
  tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
});

export default function RootLayout() {
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    Notifications.requestPermissionsAsync();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.replace('/pair');
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') router.replace('/pair');
    });
    AsyncStorage.getItem('surzo-onboarding-v4').then(val => {
      if (!val) setShowOnboarding(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleCloseOnboarding = async () => {
    await AsyncStorage.setItem('surzo-onboarding-v4', '1');
    setShowOnboarding(false);
  };

  return (
    <>
      <StatusBar style="light" />
      <OnboardingModal visible={showOnboarding} onClose={handleCloseOnboarding} />
      <Tabs initialRouteName="track" screenOptions={{
        headerShown: false,
        tabBarStyle: TAB,
        tabBarActiveTintColor: '#d4f57a',
        tabBarInactiveTintColor: '#3a3a3c',
      }}>
        <Tabs.Screen name="track"   options={opts('集中', 'radio-button-on')} />
        <Tabs.Screen name="records" options={opts('記録', 'list')} />
        <Tabs.Screen name="index"   options={{ href: null }} />
        <Tabs.Screen name="ranking" options={opts('Ranking', 'trophy-outline')} />
        <Tabs.Screen name="profile" options={opts('Profile', 'person-outline')} />
        <Tabs.Screen name="session/[id]" options={{ href: null }} />
        <Tabs.Screen name="pair"         options={{ href: null }} />
      </Tabs>
    </>
  );
}
