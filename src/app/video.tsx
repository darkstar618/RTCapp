import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Dimensions, FlatList,
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator,
  AppState, AppStateStatus,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Room, RoomEvent, Track, ConnectionState, RemoteParticipant,
} from 'livekit-client';
import { VideoView } from '@livekit/react-native';
import { AUTH_URL, RTC_URL } from '../config';
import { useRtcSession } from '../context/rtc-session';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  time: number;
  mine: boolean;
}

interface RemoteTrack {
  track: Track;
  participant: string;
}

type Status = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'error';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const { width } = Dimensions.get('window');

function msgId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
function fmt(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function VideoScreen() {
  const { session } = useRtcSession();
  const channel = session?.channel ?? '';
  const identity = session?.identity ?? '';
  const token = session?.token ?? '';
  const router = useRouter();

  const roomRef = useRef<Room | null>(null);
  const channelIdRef = useRef<string | null>(null);
  const flatRef = useRef<FlatList>(null);
  const isMountedRef = useRef(true);
  const cleanupCalledRef = useRef(false);

  const [status, setStatus] = useState<Status>('idle');
  const [remoteUids, setRemoteUids] = useState<string[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [localTrack, setLocalTrack] = useState<Track | null>(null);
  const [remoteTracks, setRemoteTracks] = useState<RemoteTrack[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatText, setChatText] = useState('');
  const [unread, setUnread] = useState(0);
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
    if (!session?.token) {
      router.replace('/');
    }
  }, [session, router]);

  useEffect(() => {
    isMountedRef.current = true;
    cleanupCalledRef.current = false;
    connect();
    return () => {
      isMountedRef.current = false;
      cleanup();
    };
  }, []);

  // ── Connection ───────────────────────────────────────────────────────────
  const connect = useCallback(async () => {
    if (!isMountedRef.current) return;

    if (roomRef.current) {
      roomRef.current.removeAllListeners();
      await roomRef.current.disconnect();
      roomRef.current = null;
    }

    setStatus('connecting');
    setErrorMsg('');
    setLocalTrack(null);
    setRemoteTracks([]);
    setRemoteUids([]);

    try {
      // Create channel
      const chRes = await fetch(`${RTC_URL}/v1/channels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      if (!chRes.ok) throw new Error(`Failed to create channel (${chRes.status})`);
      const chData = await chRes.json();
      channelIdRef.current = chData.id;

      // Register participant
      await fetch(`${RTC_URL}/v1/channels/${chData.id}/participants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ identity, room: channel }),
      });

      // Get LiveKit token
      const tokenRes = await fetch(`${AUTH_URL}/sdk/livekit-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ room: channel, identity }),
      });
      if (!tokenRes.ok) throw new Error(`Failed to get LiveKit token (${tokenRes.status})`);
      const { url: livekitUrl, token: livekitToken } = await tokenRes.json();
      if (!livekitUrl || !livekitToken) throw new Error('Malformed token response');

      const room = new Room({ reconnectPolicy: { maxRetries: 5 } });
      roomRef.current = room;

      room.on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => {
        if (isMountedRef.current) {
          setRemoteUids(prev => [...prev.filter(u => u !== p.identity), p.identity]);
        }
      });
      room.on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
        if (isMountedRef.current) {
          setRemoteUids(prev => prev.filter(u => u !== p.identity));
          setRemoteTracks(prev => prev.filter(t => t.participant !== p.identity));
        }
      });
      room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
        if (track.kind === Track.Kind.Video && isMountedRef.current) {
          setRemoteTracks(prev => [
            ...prev.filter(t => t.participant !== participant.identity),
            { track, participant: participant.identity },
          ]);
        }
      });
      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        if (isMountedRef.current) {
          setRemoteTracks(prev => prev.filter(t => t.track !== track));
        }
      });
      room.on(RoomEvent.LocalTrackPublished, (pub) => {
        if (pub.track?.kind === Track.Kind.Video && isMountedRef.current) {
          setLocalTrack(pub.track);
        }
      });
      room.on(RoomEvent.LocalTrackUnpublished, (pub) => {
        if (pub.track?.kind === Track.Kind.Video && isMountedRef.current) {
          setLocalTrack(null);
        }
      });
      room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
        if (!isMountedRef.current) return;
        if (state === ConnectionState.Reconnecting) setStatus('reconnecting');
        if (state === ConnectionState.Connected) setStatus('connected');
        if (state === ConnectionState.Disconnected) {
          setStatus('error');
          setErrorMsg('Disconnected from server');
        }
      });
      room.on(RoomEvent.Disconnected, () => {
        if (isMountedRef.current) setStatus('disconnected');
      });

      // ── BUG FIX: drop messages from self ──────────────────────────────
      room.on(
        RoomEvent.DataReceived,
        (payload: Uint8Array, participant?: RemoteParticipant) => {
          if (!participant || participant.identity === identity) return;

          try {
            const decoded = JSON.parse(new TextDecoder().decode(payload));
            if (decoded.type !== 'channel_chat') return;

            const msg: ChatMessage = {
              id: msgId(),
              sender: decoded.sender ?? participant.identity,
              text: typeof decoded.text === 'string' ? decoded.text.slice(0, 2000) : '',
              time: typeof decoded.time === 'number' ? decoded.time : Date.now(),
              mine: false,
            };

            if (!msg.text || !isMountedRef.current) return;

            setMessages(prev => [...prev, msg]);
            setChatOpen(prev => {
              if (!prev) setUnread(u => u + 1);
              return prev;
            });
          } catch {
            // Malformed payload — ignore silently
          }
        },
      );

      await room.connect(livekitUrl, livekitToken);
      await room.localParticipant.setMicrophoneEnabled(true);
      await room.localParticipant.setCameraEnabled(true);

      if (isMountedRef.current) {
        setIsCameraOn(true);
        setStatus('connected');
      }
    } catch (e: any) {
      if (!isMountedRef.current) return;
      console.error('[video] connect error:', e.message);
      setStatus('error');
      setErrorMsg(e.message ?? 'Connection failed');
    }
  }, [identity, channel, token]);

  // ── Cleanup ──────────────────────────────────────────────────────────────
  const cleanup = useCallback(async () => {
    if (cleanupCalledRef.current) return;
    cleanupCalledRef.current = true;

    const room = roomRef.current;
    if (room) {
      room.removeAllListeners();
      await room.disconnect();
      roomRef.current = null;
    }

    if (isMountedRef.current) {
      setLocalTrack(null);
      setRemoteTracks([]);
    }

    const chId = channelIdRef.current;
    if (chId && token) {
      channelIdRef.current = null;
      try {
        await fetch(`${RTC_URL}/v1/channels/${chId}/participants/${identity}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        await fetch(`${RTC_URL}/v1/channels/${chId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // Best-effort cleanup
      }
    }
  }, [identity, token]);

  // ── Controls ─────────────────────────────────────────────────────────────
  const toggleMute = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const enabled = room.localParticipant.isMicrophoneEnabled;
    await room.localParticipant.setMicrophoneEnabled(!enabled);
    if (isMountedRef.current) setIsMuted(enabled);
  }, []);

  const toggleCamera = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    const enabled = room.localParticipant.isCameraEnabled;
    await room.localParticipant.setCameraEnabled(!enabled);
    if (isMountedRef.current) {
      setIsCameraOn(!enabled);
      if (enabled) setLocalTrack(null);
    }
  }, []);

  const handleLeave = useCallback(async () => {
    await cleanup();
    router.back();
  }, [cleanup, router]);

  // ── Chat ─────────────────────────────────────────────────────────────────
  const sendChat = useCallback(async () => {
    const t = chatText.trim();
    if (!t || !roomRef.current || isSending) return;
    if (roomRef.current.state !== ConnectionState.Connected) return;

    setChatText('');
    setIsSending(true);

    const now = Date.now();
    const optimistic: ChatMessage = {
      id: msgId(),
      sender: identity,
      text: t,
      time: now,
      mine: true,
    };
    setMessages(prev => [...prev, optimistic]);
    setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 80);

    try {
      const payload = JSON.stringify({ type: 'channel_chat', sender: identity, text: t, time: now });
      await roomRef.current.localParticipant.publishData(
        new TextEncoder().encode(payload),
        { reliable: true },
      );
    } catch (e: any) {
      console.error('[video] chat send error:', e.message);
      setMessages(prev => prev.filter(m => m.id !== optimistic.id));
      setChatText(t);
    } finally {
      setIsSending(false);
    }
  }, [chatText, identity, isSending]);

  useEffect(() => {
    if (chatOpen && messages.length > 0) {
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [messages, chatOpen]);

  // ── Render helpers ───────────────────────────────────────────────────────
  const tileSize = (width - 24) / 2;
  const statusColor =
    status === 'connected'
      ? '#4ade80'
      : status === 'reconnecting' || status === 'connecting'
      ? '#fbbf24'
      : '#f87171';
  const statusLabel = status === 'reconnecting' ? 'Reconnecting…' : status;

  // ── Chat panel ───────────────────────────────────────────────────────────
  if (chatOpen) {
    return (
      <SafeAreaView style={s.safe}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={s.chatHeader}>
            <TouchableOpacity
              onPress={() => setChatOpen(false)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={s.backText}>{'←'}</Text>
            </TouchableOpacity>
            <Text style={s.chatTitle} numberOfLines={1}>Channel Chat</Text>
            <Text style={s.chatSub} numberOfLines={1}>{channel}</Text>
          </View>

          <FlatList
            ref={flatRef}
            data={messages}
            keyExtractor={item => item.id}
            contentContainerStyle={s.chatList}
            removeClippedSubviews
            maxToRenderPerBatch={20}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <Text style={s.chatEmpty}>No messages yet. Say something!</Text>
            }
            renderItem={({ item }) => (
              <View style={[s.bubble, item.mine ? s.bubbleMine : s.bubbleTheirs]}>
                {!item.mine && <Text style={s.bubbleSender}>{item.sender}</Text>}
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

          <View style={s.inputRow}>
            <TextInput
              style={s.input}
              value={chatText}
              onChangeText={setChatText}
              placeholder="Message to channel…"
              placeholderTextColor="#475569"
              multiline
              maxLength={2000}
              returnKeyType="send"
              onSubmitEditing={sendChat}
            />
            <TouchableOpacity
              style={[s.sendBtn, (!chatText.trim() || isSending) && s.sendBtnDisabled]}
              onPress={sendChat}
              disabled={!chatText.trim() || isSending}
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

  // ── Main video panel ─────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Text style={s.title}>Video Call</Text>
        <Text style={s.sub} numberOfLines={1}>{channel}</Text>
      </View>

      <View style={s.statusRow}>
        <View style={[s.dot, { backgroundColor: statusColor }]} />
        <Text style={s.statusText}>{statusLabel}</Text>
        <Text style={s.participants}> · {remoteUids.length + 1} in call</Text>
        {(status === 'connecting' || status === 'reconnecting') && (
          <ActivityIndicator color={statusColor} size="small" style={{ marginLeft: 4 }} />
        )}
      </View>

      {status === 'error' && errorMsg ? (
        <View style={s.errorBanner}>
          <Text style={s.errorText}>{errorMsg}</Text>
          <TouchableOpacity onPress={connect} style={s.retryBtn}>
            <Text style={s.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Video grid */}
      <View style={s.grid}>
        {/* Local tile */}
        <View style={[s.tile, { width: tileSize, height: tileSize * 1.3 }]}>
          {localTrack && isCameraOn ? (
            <VideoView style={s.video} videoTrack={localTrack as any} mirror />
          ) : (
            <View style={s.placeholder}>
              <Text style={s.tileName} numberOfLines={1}>{identity} (you)</Text>
              <Text style={s.tileState}>{isCameraOn ? 'Starting…' : 'Camera Off'}</Text>
            </View>
          )}
          <View style={s.nameTag}>
            <Text style={s.nameTagText} numberOfLines={1}>You</Text>
          </View>
        </View>

        {/* Remote video tiles */}
        {remoteTracks.map((rt, i) => (
          <View key={`vt-${i}`} style={[s.tile, { width: tileSize, height: tileSize * 1.3 }]}>
            <VideoView style={s.video} videoTrack={rt.track as any} />
            <View style={s.nameTag}>
              <Text style={s.nameTagText} numberOfLines={1}>{rt.participant}</Text>
            </View>
          </View>
        ))}

        {/* Remote audio-only tiles */}
        {remoteUids
          .filter(uid => !remoteTracks.find(rt => rt.participant === uid))
          .map(uid => (
            <View key={`ao-${uid}`} style={[s.tile, { width: tileSize, height: tileSize * 1.3 }]}>
              <View style={s.placeholder}>
                <View style={s.audioAvatar}>
                  <Text style={s.audioAvatarText}>{uid.slice(0, 2).toUpperCase()}</Text>
                </View>
                <Text style={s.tileName} numberOfLines={1}>{uid}</Text>
                <Text style={s.tileState}>Audio only</Text>
              </View>
            </View>
          ))}

        {/* Waiting tile */}
        {remoteUids.length === 0 && (
          <View style={[s.tile, s.emptyTile, { width: tileSize, height: tileSize * 1.3 }]}>
            <Text style={s.tileName}>Waiting…</Text>
            <Text style={s.tileState}>Share your link to invite</Text>
          </View>
        )}
      </View>

      {/* Controls */}
      <View style={s.controls}>
        <TouchableOpacity style={[s.ctrl, isMuted && s.ctrlMuted]} onPress={toggleMute}>
          <Text style={s.ctrlLabel}>{isMuted ? 'Unmute' : 'Mute'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.ctrl, !isCameraOn && s.ctrlMuted]} onPress={toggleCamera}>
          <Text style={s.ctrlLabel}>{isCameraOn ? 'Cam On' : 'Cam Off'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.ctrl, s.ctrlChat]}
          onPress={() => { setChatOpen(true); setUnread(0); }}
        >
          <Text style={s.ctrlLabel}>Chat{unread > 0 ? ` (${unread})` : ''}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.ctrl, s.ctrlEnd]} onPress={handleLeave}>
          <Text style={s.ctrlLabel}>Leave</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0a0a0f' },

  header: { alignItems: 'center', paddingTop: 16, marginBottom: 8 },
  title: { fontSize: 20, fontWeight: '700', color: '#e2e8f0' },
  sub: { fontSize: 12, color: '#06b6d4', marginTop: 2 },

  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 12,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13, color: '#94a3b8' },
  participants: { fontSize: 13, color: '#475569' },

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#450a0a',
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginHorizontal: 8,
    borderRadius: 8,
    marginBottom: 8,
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

  grid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 8,
    gap: 8,
    alignContent: 'flex-start',
  },
  tile: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1a1d27',
    borderWidth: 1,
    borderColor: '#2d3148',
    position: 'relative',
  },
  video: { flex: 1 },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6 },
  emptyTile: { alignItems: 'center', justifyContent: 'center', borderStyle: 'dashed' },
  audioAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#2d3148',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  audioAvatarText: { color: '#94a3b8', fontSize: 16, fontWeight: '700' },
  tileName: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
    maxWidth: '80%',
    textAlign: 'center',
  },
  tileState: { color: '#475569', fontSize: 11 },
  nameTag: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  nameTagText: { color: '#fff', fontSize: 11 },

  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    padding: 10,
    flexWrap: 'wrap',
  },
  ctrl: {
    backgroundColor: '#1a1d27',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    minWidth: 76,
    borderWidth: 1,
    borderColor: '#2d3148',
  },
  ctrlMuted: { backgroundColor: '#1a2a3a', borderColor: '#06b6d4' },
  ctrlChat: { borderColor: '#7c6af7' },
  ctrlEnd: { backgroundColor: '#450a0a', borderColor: '#f87171' },
  ctrlLabel: { color: '#e2e8f0', fontSize: 12, fontWeight: '600' },

  // Chat panel
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: '#1e2235',
    gap: 12,
  },
  backText: { color: '#7c6af7', fontSize: 22 },
  chatTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: '#e2e8f0' },
  chatSub: { fontSize: 11, color: '#475569' },
  chatList: { padding: 16, gap: 6, flexGrow: 1 },
  chatEmpty: { color: '#475569', textAlign: 'center', paddingTop: 40, fontSize: 13 },
  bubble: {
    maxWidth: '78%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 4,
  },
  bubbleMine: { alignSelf: 'flex-end', backgroundColor: '#7c6af7', borderBottomRightRadius: 4 },
  bubbleTheirs: {
    alignSelf: 'flex-start',
    backgroundColor: '#1a1d27',
    borderWidth: 1,
    borderColor: '#2d3148',
    borderBottomLeftRadius: 4,
  },
  bubbleSender: { color: '#06b6d4', fontSize: 11, fontWeight: '600', marginBottom: 3 },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  bubbleTextMine: { color: '#fff' },
  bubbleTextTheirs: { color: '#e2e8f0' },
  bubbleTime: { fontSize: 10, marginTop: 4 },
  bubbleTimeMine: { color: 'rgba(255,255,255,0.6)', textAlign: 'right' },
  bubbleTimeTheirs: { color: '#475569' },
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
