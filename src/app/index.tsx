import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, ScrollView, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AUTH_URL, APP_ID, APP_SECRET } from '../config';

export default function HomeScreen() {
  const router = useRouter();
  const [channel, setChannel] = useState('test-room');
  const [identity, setIdentity] = useState('user-' + Math.floor(Math.random() * 1000));
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);

  async function getToken() {
    setLoading(true);
    try {
      const r = await fetch(AUTH_URL + '/sdk/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: APP_ID, app_secret: APP_SECRET })
      });
      if (!r.ok) throw new Error('Server returned ' + r.status);
      const data = await r.json();
      if (!data.access_token) throw new Error('No token in response');
      setToken(data.access_token);
      return data.access_token;
    } catch(e: any) {
      Alert.alert('Connection Error', e.message + '\n\nIs the auth server running at ' + AUTH_URL + '?');
      return null;
    } finally { setLoading(false); }
  }

  async function joinVoice() {
    const t = token || await getToken();
    if (!t) return;
    router.push('/voice?channel=' + encodeURIComponent(channel) + '&identity=' + encodeURIComponent(identity) + '&token=' + encodeURIComponent(t));
  }

  async function joinVideo() {
    const t = token || await getToken();
    if (!t) return;
    router.push('/video?channel=' + encodeURIComponent(channel) + '&identity=' + encodeURIComponent(identity) + '&token=' + encodeURIComponent(t));
  }

  async function openMessages() {
    const t = token || await getToken();
    if (!t) return;
    router.push('/messages?identity=' + encodeURIComponent(identity) + '&token=' + encodeURIComponent(t));
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.header}>
          <Text style={s.logo}>RTC Platform</Text>
          <Text style={s.sub}>Android SDK Demo</Text>
        </View>

        <View style={s.card}>
          <Text style={s.label}>Channel Name</Text>
          <TextInput
            style={s.input}
            value={channel}
            onChangeText={setChannel}
            placeholder="e.g. my-room"
            placeholderTextColor='#555'
            autoCapitalize='none'
          />
          <Text style={s.label}>Your Identity</Text>
          <TextInput
            style={s.input}
            value={identity}
            onChangeText={setIdentity}
            placeholder="e.g. john"
            placeholderTextColor='#555'
            autoCapitalize='none'
          />
        </View>

        <TouchableOpacity style={[s.btn, loading && s.btnDisabled]} onPress={getToken} disabled={loading}>
          <Text style={s.btnText}>{loading ? 'Connecting...' : token ? '✓ Token Ready' : 'Get SDK Token'}</Text>
        </TouchableOpacity>

        {token ? <Text style={s.tokenHint}>Connected to {AUTH_URL}</Text> : null}

        <View style={s.row}>
          <TouchableOpacity style={[s.joinBtn, s.voiceBtn, !token && s.joinDisabled]} onPress={joinVoice}>
            <Text style={s.joinIcon}>🎙</Text>
            <Text style={s.joinText}>Voice Call</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.joinBtn, s.videoBtn, !token && s.joinDisabled]} onPress={joinVideo}>
            <Text style={s.joinIcon}>📹</Text>
            <Text style={s.joinText}>Video Call</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={[s.msgBtn, !token && s.joinDisabled]} onPress={openMessages} disabled={!token}>
          <Text style={s.msgIcon}>💬</Text>
          <Text style={s.msgText}>Direct Messages</Text>
        </TouchableOpacity>

        <View style={s.infoCard}>
          <Text style={s.infoTitle}>Platform Info</Text>
          <Text style={s.infoLine}>Auth: {AUTH_URL}</Text>
          <Text style={s.infoLine}>App ID: {APP_ID.slice(0, 20)}...</Text>
          <Text style={s.infoLine}>Status: {token ? '🟢 Authenticated' : '🔴 Not connected'}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0a0a0f' },
  scroll: { padding: 24 },
  header: { alignItems: 'center', marginBottom: 32, marginTop: 16 },
  logo: { fontSize: 28, fontWeight: '700', color: '#7c6af7', marginBottom: 4 },
  sub: { fontSize: 13, color: '#475569' },
  card: { backgroundColor: '#1a1d27', borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#2d3148' },
  label: { fontSize: 11, color: '#64748b', textTransform: 'uppercase', marginBottom: 6, marginTop: 8 },
  input: { backgroundColor: '#0a0a0f', borderWidth: 1, borderColor: '#2d3148', borderRadius: 8, padding: 12, color: '#e2e8f0', fontSize: 14 },
  btn: { backgroundColor: '#7c6af7', borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 8 },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  tokenHint: { fontSize: 11, color: '#4ade80', textAlign: 'center', marginBottom: 16 },
  row: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  joinBtn: { flex: 1, borderRadius: 12, padding: 20, alignItems: 'center', borderWidth: 1 },
  joinDisabled: { opacity: 0.4 },
  voiceBtn: { backgroundColor: '#1a1d27', borderColor: '#7c6af7' },
  videoBtn: { backgroundColor: '#1a1d27', borderColor: '#06b6d4' },
  joinIcon: { fontSize: 22, marginBottom: 6 },
  joinText: { color: '#e2e8f0', fontWeight: '600', fontSize: 15 },
  msgBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#1a1d27', borderRadius: 12, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: '#4ade80' },
  msgIcon: { fontSize: 20 },
  msgText: { color: '#e2e8f0', fontWeight: '600', fontSize: 15 },
  infoCard: { backgroundColor: '#1a1d27', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#2d3148' },
  infoTitle: { fontSize: 13, fontWeight: '600', color: '#7c6af7', marginBottom: 8 },
  infoLine: { fontSize: 12, color: '#475569', marginBottom: 4 },
});
