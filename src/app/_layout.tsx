import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { getDatabase } from '@yourplatform/sdk';
import { registerGlobals } from '@livekit/react-native';

registerGlobals();

export default function RootLayout() {
  useEffect(() => { getDatabase(); }, []);
  return (
    <>
      <StatusBar style='light' />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0a0a0f' } }}>
        <Stack.Screen name='index' />
        <Stack.Screen name='voice' />
        <Stack.Screen name='video' />
      </Stack>
    </>
  );
}