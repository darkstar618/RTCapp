import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator,
  AppState, AppStateStatus,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Room, RoomEvent, ConnectionState, RemoteParticipant } from 'livekit-client';
import { AUTH_URL } from '../config';
import { useRtcSession } from '../context/rtc-session';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  sender: string;
  text: string;
  time: number;
  mine: boolean;
}

type Status = 'connecting' | 'connected' | 'reconnecting' | 'error';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function dmRoomName(a: string, b: string) {
  return [a, b].sort().join('__dm__');
}

const COLORS = ['#7c6af7', '#06b6d4', '#4ade80', '#f59e0b', '#f87171'];
function colorFor(id: string) {
  return COLORS[id.charCodeAt(0) % COLORS.length];
}
function fmt(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function msgId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const { contact } = useLocalSearchParams<{ contact: string }>();
  const { session } = useRtcSession();
  const identity = session?.identity ?? '';
  const token = session?.token ?? '';
  const router = useRouter();

  const roomRef = useRef<Room | null>(null);
  const flatRef = useRef<FlatList>(null);
  const isMountedRef = useRef(true);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [status, setStatus] = useState<Status>('connecting');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSending, setIsSending] = useState(false);

  // ── App-background handling ──────────────────────────────────────────────
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active' && roomRef.current?.state === ConnectionState.Disconnected) {
        connect();
      }
    });
    return () => sub.remove();
  }, []);

  // ── Lifecycle ────────────────────────────────────────────────────────────
  useEffect(() => {
    isMountedRef.current = true;
    connect();
    return () => {
      isMountedRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      roomRef.current?.disconnect();
      roomRef.current = null;
    };
  }, []);

  // ── Connection ───────────────────────────────────────────────────────────
  const connect = useCallback(async () => {
    if (!isMountedRef.current) return;

    // Clean up any existing room before reconnecting
    if (roomRef.current) {
      roomRef.current.removeAllListeners();
      await roomRef.current.disconnect();
      roomRef.current = null;
    }

    setStatus('connecting');
    setErrorMsg('');

    try {
      const roomName = dmRoomName(identity, contact);
      const tokenRes = await fetch(`${AUTH_URL}/sdk/livekit-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ room: roomName, identity }),
      });

      if (!tokenRes.ok) {
        const body = await tokenRes.text().catch(() => '');
        throw new Error(`Token request failed (${tokenRes.status}): ${body}`);
      }

      const { url: livekitUrl, token: livekitToken } = await tokenRes.json();
      if (!livekitUrl || !livekitToken) throw new Error('Malformed token response');

      const room = new Room({
        // Automatically manage reconnects
        reconnectPolicy: { maxRetries: 5 },
      });
      roomRef.current = room;

      // ── BUG FIX: filter self-messages ──────────────────────────────────
      // DataReceived fires for ALL published data, including loopback when
      // you are the only participant in the room. Always check participant
      // identity before adding to state.
      room.on(
        RoomEvent.DataReceived,
        (payload: Uint8Array, participant?: RemoteParticipant) => {
          // participant is undefined when the message came from ourselves —
          // drop it so we don't echo our own sends.
          if (!participant || participant.identity === identity) return;

          try {
            const decoded = JSON.parse(new TextDecoder().decode(payload));
            if (decoded.type !== 'dm') return;

            const msg: Message = {
              id: msgId(),
              sender: decoded.sender ?? participant.identity,
              text: typeof decoded.text === 'string' ? decoded.text.slice(0, 2000) : '',
              time: typeof decoded.time === 'number' ? decoded.time : Date.now(),
              mine: false,
            };

            if (!msg.text) return;

            if (isMountedRef.current) {
              setMessages(prev => [...prev, msg]);
            }
          } catch {
            // Malformed payload — ignore silently
          }
        },
      );

      room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
        if (!isMountedRef.current) return;
        if (state === ConnectionState.Connected) setStatus('connected');
        if (state === ConnectionState.Reconnecting) setStatus('reconnecting');
        if (state === ConnectionState.Disconnected) {
          setStatus('error');
          setErrorMsg('Disconnected from server');
        }
      });

      room.on(RoomEvent.Disconnected, () => {
        if (isMountedRef.current) {
          setStatus('error');
          setErrorMsg('Connection lost');
        }
      });

      await room.connect(livekitUrl, livekitToken);

      if (isMountedRef.current) setStatus('connected');
    } catch (e: any) {
      if (!isMountedRef.current) return;
      console.error('[chat] connect error:', e.message);
      setStatus('error');
      setErrorMsg(e.message ?? 'Connection failed');

      // Auto-retry once after 4 s
      reconnectTimerRef.current = setTimeout(() => {
        if (isMountedRef.current) connect();
      }, 4000);
    }
  }, [identity, contact, token]);

  // ── Send ─────────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    const t = text.trim();
    if (!t || !roomRef.current || isSending) return;
    if (roomRef.current.state !== ConnectionState.Connected) return;

    setText('');
    setIsSending(true);

    const now = Date.now();
    const optimistic: Message = {
      id: msgId(),
      sender: identity,
      text: t,
      time: now,
      mine: true,
    };

    // Optimistic UI update
    setMessages(prev => [...prev, optimistic]);
    setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 80);

    try {
      const payload = JSON.stringify({ type: 'dm', sender: identity, text: t, time: now });
      const encoded = new TextEncoder().encode(payload);
      await roomRef.current.localParticipant.publishData(encoded, { reliable: true });
    } catch (e: any) {
      console.error('[chat] send error:', e.message);
      // Remove the optimistic message on failure
      setMessages(prev => prev.filter(m => m.id !== optimistic.id));
      setText(t); // restore text
    } finally {
      setIsSending(false);
    }
  }, [text, identity, isSending]);

  // ── Auto-scroll on new messages ──────────────────────────────────────────
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [messages]);

  // ── Render ───────────────────────────────────────────────────────────────
  const statusLabel =
    status === 'connected'
      ? 'Online'
      : status === 'reconnecting'
      ? 'Reconnecting...'
      : status === 'connecting'
      ? 'Connecting...'
      : 'Offline';

  const statusColor =
    status === 'connected'
      ? '#4ade80'
      : status === 'reconnecting'
      ? '#f59e0b'
      : status === 'connecting'
      ? '#fbbf24'
      : '#f87171';

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} style={s.back} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={s.backText}>{'←'}</Text>
          </TouchableOpacity>
          <View style={[s.headerAvatar, { backgroundColor: colorFor(contact) }]}>
            <Text style={s.headerAvatarText}>{contact.slice(0, 2).toUpperCase()}</Text>
          </View>
          <View style={s.headerInfo}>
            <Text style={s.headerName} numberOfLines={1}>{contact}</Text>
            <View style={s.headerStatusRow}>
              <View style={[s.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[s.headerStatus, { color: statusColor }]}>{statusLabel}</Text>
            </View>
          </View>
        </View>

        {/* Error banner */}
        {status === 'error' && errorMsg ? (
          <View style={s.errorBanner}>
            <Text style={s.errorText}>{errorMsg}</Text>
            <TouchableOpacity onPress={connect} style={s.retryBtn}>
              <Text style={s.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Message list */}
        <FlatList
          ref={flatRef}
          data={messages}
          keyExtractor={item => item.id}
          contentContainerStyle={s.list}
          onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: false })}
          onLayout={() => flatRef.current?.scrollToEnd({ animated: false })}
          keyboardShouldPersistTaps="handled"
          removeClippedSubviews
          maxToRenderPerBatch={20}
          windowSize={10}
          ListEmptyComponent={
            status === 'connecting' ? (
              <View style={s.empty}>
                <ActivityIndicator color="#7c6af7" />
                <Text style={s.emptyText}>Connecting…</Text>
              </View>
            ) : (
              <View style={s.empty}>
                <Text style={s.emptyText}>No messages yet. Say hi!</Text>
              </View>
            )
          }
          renderItem={({ item }) => (
            <View style={[s.bubble, item.mine ? s.bubbleMine : s.bubbleTheirs]}>
              <Text
                style={[s.bubbleText, item.mine ? s.bubbleTextMine : s.bubbleTextTheirs]}
                selectable
              >
                {item.text}
              </Text>
              <Text style={[s.bubbleTime, item.mine ? s.bubbleTimeMine : s.bubbleTimeTheirs]}>
                {fmt(item.time)}
              </Text>
            </View>
          )}
        />

        {/* Input row */}
        <View style={s.inputRow}>
          <TextInput
            style={s.input}
            value={text}
            onChangeText={setText}
            placeholder="Message…"
            placeholderTextColor="#475569"
            multiline
            maxLength={2000}
            returnKeyType="send"
            blurOnSubmit={false}
            onSubmitEditing={sendMessage}
            editable={status !== 'error'}
          />
          <TouchableOpacity
            style={[s.sendBtn, (!text.trim() || isSending) && s.sendBtnDisabled]}
            onPress={sendMessage}
            disabled={!text.trim() || isSending}
          >
            {isSending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={s.sendBtnText}>↑</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0a0a0f' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: '#1e2235',
    gap: 12,
  },
  back: { marginRight: 4 },
  backText: { color: '#7c6af7', fontSize: 22 },
  headerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  headerInfo: { flex: 1 },
  headerName: { color: '#e2e8f0', fontSize: 15, fontWeight: '700' },
  headerStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  headerStatus: { fontSize: 11 },

  // Error banner
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#450a0a',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 12,
  },
  errorText: { flex: 1, color: '#f87171', fontSize: 12 },
  retryBtn: {
    backgroundColor: '#7c6af7',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
  },
  retryText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  // List
  list: { padding: 16, paddingBottom: 8, flexGrow: 1, justifyContent: 'flex-end' },
  empty: { flex: 1, alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { color: '#475569', fontSize: 14 },

  // Bubbles
  bubble: {
    maxWidth: '78%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
  },
  bubbleMine: {
    alignSelf: 'flex-end',
    backgroundColor: '#7c6af7',
    borderBottomRightRadius: 4,
  },
  bubbleTheirs: {
    alignSelf: 'flex-start',
    backgroundColor: '#1a1d27',
    borderWidth: 1,
    borderColor: '#2d3148',
    borderBottomLeftRadius: 4,
  },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  bubbleTextMine: { color: '#fff' },
  bubbleTextTheirs: { color: '#e2e8f0' },
  bubbleTime: { fontSize: 10, marginTop: 4 },
  bubbleTimeMine: { color: 'rgba(255,255,255,0.6)', textAlign: 'right' },
  bubbleTimeTheirs: { color: '#475569' },

  // Input
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    gap: 10,
    borderTopWidth: 1,
    borderColor: '#1e2235',
    backgroundColor: '#0a0a0f',
  },
  input: {
    flex: 1,
    backgroundColor: '#1a1d27',
    borderWidth: 1,
    borderColor: '#2d3148',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#e2e8f0',
    fontSize: 14,
    maxHeight: 100,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#7c6af7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
});
