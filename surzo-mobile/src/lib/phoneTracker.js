import { AppState, Platform } from 'react-native';
import { supabase } from './supabase';
import { getUserId } from './storage';

// AppState: 'active' = Surzoが前面 = スマホ触ってない
//           'background'/'inactive' = 他アプリ or 画面オフ = 触ってる
export function startPhoneTracking(sessionId) {
  async function sendEvent(type) {
    const uid = await getUserId();
    if (!uid) return;
    await supabase.from('phone_events').insert({
      user_id: uid,
      session_id: sessionId,
      type,
      ts: new Date().toISOString(),
    });
  }

  // Web: use visibilitychange directly (more reliable than AppState shim)
  if (Platform.OS === 'web') {
    const handler = () => {
      sendEvent(document.hidden ? 'start' : 'end');
    };
    document.addEventListener('visibilitychange', handler);
    if (document.hidden) sendEvent('start');
    return () => document.removeEventListener('visibilitychange', handler);
  }

  // Native iOS/Android: use AppState
  let currentState = AppState.currentState;
  if (currentState !== 'active') sendEvent('start');

  const sub = AppState.addEventListener('change', (nextState) => {
    if (currentState === 'active' && nextState !== 'active') {
      sendEvent('start');
    } else if (currentState !== 'active' && nextState === 'active') {
      sendEvent('end');
    }
    currentState = nextState;
  });

  return () => sub.remove();
}
