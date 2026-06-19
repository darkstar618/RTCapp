# @yourplatform/sdk

Android-only real-time communication SDK built on LiveKit.

> **Platform support:** Android only. iOS is not supported.

---

## Installation

```bash
npm install @yourplatform/sdk @livekit/react-native @livekit/react-native-webrtc
```

Add to ndroid/build.gradle:

```gradle
allprojects { repositories { maven { url 'https://jitpack.io' } } }
```

---

## Quick Start

### 1. Get an SDK token from your backend

```js
const res = await fetch('https://your-api.com/sdk/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ app_id: APP_ID, app_secret: APP_SECRET })
});
const { access_token } = await res.json();
```

### 2. Use the React hook

```tsx
import { useRtcClient } from '@yourplatform/sdk';

export default function VoiceCallScreen() {
  const { isJoined, isMuted, remoteUids, error, join, leave, toggleAudio } = useRtcClient({
    authServerUrl: 'https://your-api.com',
    appId: 'ap_xxxxxx',
    sdkToken: 'token-from-your-backend',
    mode: 'audio',
  });

  return (
    <View>
      {error && <Text>Error: {error.message}</Text>}
      <Text>Remote users: {remoteUids.join(', ')}</Text>
      <Button title={isJoined ? 'Leave' : 'Join'} onPress={() => isJoined ? leave() : join('my-channel')} />
      <Button title={isMuted ? 'Unmute' : 'Mute'} onPress={toggleAudio} disabled={!isJoined} />
    </View>
  );
}
```

---

## API Reference

### RtcClient.create(config)

| Option | Type | Required | Description |
|---|---|---|---|
| authServerUrl | string | Yes | Base URL of your platform API |
| appId | string | Yes | Your app_id from dashboard |
| sdkToken | string | Yes | Short-lived JWT from your backend |
| mode | 'audio' or 'video' | No | Defaults to audio |

### Events

```ts
client.on('join', (session) => {})
client.on('leave', (channelId) => {})
client.on('remoteUserJoined', (uid) => {})
client.on('remoteUserLeft', (uid) => {})
client.on('activeSpeakersChanged', (uids) => {})
client.on('connectionStateChanged', (state) => {})
client.on('error', (err) => {})
```

---

## Error Handling

```ts
import { RtcPermissionError, RtcTokenError, RtcConnectionError } from '@yourplatform/sdk';

try {
  await client.join('my-channel');
} catch (err) {
  if (err instanceof RtcPermissionError) {
    // Show permission settings prompt
  } else if (err instanceof RtcTokenError) {
    // Refresh SDK token and retry
  } else if (err instanceof RtcConnectionError) {
    // Check internet connection
  }
}
```

---

## Android Permissions

Add to AndroidManifest.xml:

```xml
<uses-permission android:name='android.permission.RECORD_AUDIO' />
<uses-permission android:name='android.permission.CAMERA' />
<uses-permission android:name='android.permission.INTERNET' />
<uses-permission android:name='android.permission.MODIFY_AUDIO_SETTINGS' />
```

---

## ProGuard Rules

```pro
-keep class io.livekit.** { *; }
-keep class org.webrtc.** { *; }
-dontwarn io.livekit.**
-dontwarn org.webrtc.**
```

---

## Requirements

| | Version |
|---|---|
| React Native | 0.73+ |
| Expo SDK | 56+ |
| Android API | 24+ |
| Node.js | 18+ |

---

## License

MIT
