import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { getDatabase } from '@yourplatform/sdk';
import { registerGlobals } from '@livekit/react-native';
import { RtcSessionProvider } from '../context/rtc-session';

registerGlobals();

export default function RootLayout() {
  useEffect(() => { getDatabase(); }, []);
  return (
    <RtcSessionProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0a0a0f' } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="voice" />
        <Stack.Screen name="video" />
        <Stack.Screen name="chat" />
        <Stack.Screen name="messages" />
      </Stack>
    </RtcSessionProvider>
  );
}
