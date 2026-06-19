import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  TextInput, KeyboardAvoidingView, Platform, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Room, RoomEvent, DataPacket_Kind } from 'livekit-client';
import { AUTH_URL } from '../config';

// DM works by joining a special "dm" LiveKit room shared between two users
// Room name = sorted identities joined with "__dm__"

function dmRoomName(a: string, b: string) {
  return [a, b].sort().join('__dm__');
}

interface Contact {
  identity: string;
  unread: number;
  lastMessage: string;
  lastTime: number;
}

export default function MessagesScreen() {
  const { identity, token } = useLocalSearchParams<{ identity: string; token: string }>();
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [newContact, setNewContact] = useState('');

  function startChat(contactIdentity: string) {
    router.push(
      '/chat?identity=' + encodeURIComponent(identity) +
      '&contact=' + encodeURIComponent(contactIdentity) +
      '&token=' + encodeURIComponent(token)
    );
  }

  function addContact() {
    const c = newContact.trim();
    if (!c || c === identity) {
      Alert.alert('Invalid', 'Enter a valid identity that is not your own.');
      return;
    }
    if (contacts.find(x => x.identity === c)) {
      startChat(c);
      return;
    }
    setContacts(prev => [...prev, { identity: c, unread: 0, lastMessage: '', lastTime: Date.now() }]);
    setNewContact('');
    startChat(c);
  }

  const initials = (id: string) => id.slice(0, 2).toUpperCase();
  const colors = ['#7c6af7', '#06b6d4', '#4ade80', '#f59e0b', '#f87171', '#a78bfa'];
  const colorFor = (id: string) => colors[id.charCodeAt(0) % colors.length];

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.back}>
          <Text style={s.backText}>{'←'}</Text>
        </TouchableOpacity>
        <Text style={s.title}>Messages</Text>
        <Text style={s.you}>{identity}</Text>
      </View>

      <View style={s.newRow}>
        <TextInput
          style={s.input}
          value={newContact}
          onChangeText={setNewContact}
          placeholder="Enter user identity to message..."
          placeholderTextColor="#475569"
          autoCapitalize="none"
          returnKeyType="go"
          onSubmitEditing={addContact}
        />
        <TouchableOpacity style={s.goBtn} onPress={addContact}>
          <Text style={s.goBtnText}>Chat</Text>
        </TouchableOpacity>
      </View>

      {contacts.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyTitle}>No conversations yet</Text>
          <Text style={s.emptyHint}>Enter someone's identity above to start a DM</Text>
        </View>
      ) : (
        <FlatList
          data={contacts.sort((a, b) => b.lastTime - a.lastTime)}
          keyExtractor={item => item.identity}
          renderItem={({ item }) => (
            <TouchableOpacity style={s.row} onPress={() => startChat(item.identity)}>
              <View style={[s.avatar, { backgroundColor: colorFor(item.identity) }]}>
                <Text style={s.avatarText}>{initials(item.identity)}</Text>
              </View>
              <View style={s.rowInfo}>
                <Text style={s.rowName}>{item.identity}</Text>
                <Text style={s.rowLast} numberOfLines={1}>
                  {item.lastMessage || 'Tap to start chatting'}
                </Text>
              </View>
              {item.unread > 0 && (
                <View style={s.badge}>
                  <Text style={s.badgeText}>{item.unread}</Text>
                </View>
              )}
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={() => <View style={s.sep} />}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0a0a0f' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderColor: '#1e2235' },
  back: { marginRight: 12 },
  backText: { color: '#7c6af7', fontSize: 22 },
  title: { flex: 1, fontSize: 18, fontWeight: '700', color: '#e2e8f0' },
  you: { fontSize: 11, color: '#475569' },
  newRow: { flexDirection: 'row', padding: 16, gap: 10 },
  input: { flex: 1, backgroundColor: '#1a1d27', borderWidth: 1, borderColor: '#2d3148', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, color: '#e2e8f0', fontSize: 14 },
  goBtn: { backgroundColor: '#7c6af7', borderRadius: 10, paddingHorizontal: 18, justifyContent: 'center' },
  goBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyTitle: { color: '#94a3b8', fontSize: 16, fontWeight: '600', marginBottom: 8 },
  emptyHint: { color: '#475569', fontSize: 13, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 14 },
  avatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  rowInfo: { flex: 1 },
  rowName: { color: '#e2e8f0', fontSize: 15, fontWeight: '600', marginBottom: 3 },
  rowLast: { color: '#475569', fontSize: 12 },
  badge: { backgroundColor: '#7c6af7', borderRadius: 10, minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  sep: { height: 1, backgroundColor: '#1e2235', marginLeft: 76 },
});
