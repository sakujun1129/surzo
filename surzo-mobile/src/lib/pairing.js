import * as SecureStore from 'expo-secure-store';
import { supabase } from './supabase';

export async function getLinkedUserId() {
  return SecureStore.getItemAsync('surzo-user-id');
}

export async function linkWithCode(code) {
  const { data, error } = await supabase
    .from('pairing_codes')
    .select('user_id, expires_at')
    .eq('code', code)
    .maybeSingle();

  if (error || !data) throw new Error('コードが見つかりません');
  if (new Date(data.expires_at) < new Date()) throw new Error('コードの有効期限が切れています');

  await SecureStore.setItemAsync('surzo-user-id', data.user_id);
  await supabase.from('pairing_codes').delete().eq('code', code);
  return data.user_id;
}
