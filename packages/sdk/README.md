# @yourplatform/sdk

Android-only real-time communication SDK built on LiveKit.

> **Platform support:** Android only. iOS is not supported.

---

## Installation

```bash
npm install @yourplatform/sdk @livekit/react-native @livekit/react-native-webrtc
```

Add to `android/build.gradle`:

```gradle
allprojects { repositories { maven { url 'https://jitpack.io' } } }
```

---

## Authentication (production pattern)

**Never call `/sdk/token` with `app_secret` from the mobile app.** Use a backend-for-frontend:

```js
// Your backend (Node, Python, etc.)
app.post('/api/rtc/token', authenticateUser, async (req, res) => {
  const response = await fetch(`${AUTH_SERVER}/sdk/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: process.env.APP_ID,
      app_secret: process.env.APP_SECRET, // server-side only
    }),
  });
  const tokens = await response.json();
  res.json({ access_token: tokens.access_token });
});
```

```tsx
// Mobile app — only receives short-lived token from YOUR backend
const { access_token } = await fetch('https://your-api.com/api/rtc/token', {
  headers: { Authorization: `Bearer ${userSessionToken}` },
}).then(r => r.json());
```

For local emulator testing only, `TokenManager` in `server/auth/sdk-additions/` can exchange credentials when `EXPO_PUBLIC_AUTH_URL` is set — still not for production APKs.

---

## Quick Start

```tsx
import { useRtcClient } from '@yourplatform/sdk';

export default function VoiceCallScreen() {
  const { isJoined, isMuted, remoteUids, error, join, leave, toggleAudio } = useRtcClient({
    authServerUrl: 'https://auth.your-domain.com',
    appId: 'ap_xxxxxx',
    sdkToken: accessTokenFromYourBackend,
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

## Error Handling

```ts
import { RtcPermissionError, RtcTokenError, RtcConnectionError } from '@yourplatform/sdk';

try {
  await client.join('my-channel');
} catch (err) {
  if (err instanceof RtcPermissionError) {
    // Prompt user to grant microphone permission
  } else if (err instanceof RtcTokenError) {
    // Refresh SDK token from your backend and retry
  } else if (err instanceof RtcConnectionError) {
    // Check network / LiveKit status
  }
}
```

---

## Android Permissions

```xml
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
```

Set `android:allowBackup="false"` in production manifests.

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
| Node.js | 20+ |

---

## License

MIT
