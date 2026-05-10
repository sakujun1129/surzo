import { AppState } from 'react-native';
import { supabase } from './supabase';
import { getUserId } from './storage';

// AppState: 'active' = Surzoが前面 = スマホ触ってない
//           'background'/'inactive' = 他アプリ or 画面オフ = 触ってる
export function startPhoneTracking(sessionId) {
  let currentState = AppState.currentState;

  async function sendEvent(type) {
    const uid = await getUserId();
    await supabase.from('phone_events').insert({
      user_id: uid,
      session_id: sessionId,
      type,
      ts: new Date().toISOString(),
    });
  }

  // 起動時点でバックグラウンドなら即送信
  if (currentState !== 'active') sendEvent('start');

  const sub = AppState.addEventListener('change', (nextState) => {
    if (currentState === 'active' && nextState !== 'active') {
      sendEvent('start'); // スマホ触り始め
    } else if (currentState !== 'active' && nextState === 'active') {
      sendEvent('end'); // Surzoに戻った
    }
    currentState = nextState;
  });

  return () => sub.remove();
}
