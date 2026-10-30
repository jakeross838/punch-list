// The app shell. On the iPhone, screens use the native stack: system push and swipe back, and real
// page sheets for New Job, New Item and an item's details. The preview page uses the JavaScript
// stack with the same iOS motion: screens slide in from the right, and sheets rise from the bottom
// while the screen behind shrinks back.

import '@/ui/web-setup';
import { Stack } from 'expo-router';
import JSStack, { TransitionPresets } from 'expo-router/js-stack';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '@/constants/theme';
import { DataProvider } from '@/data/backend';
import { FeedbackProvider } from '@/ui';
import { forSheetIOS } from '@/ui/sheetTransition';

const SCREENS = ['index', 'jobs/[jobId]/index', 'jobs/[jobId]/setup'] as const;
const SHEETS = ['jobs/new', 'jobs/[jobId]/items/new', 'jobs/[jobId]/items/[itemId]'] as const;

function NativeStack() {
  return (
    <Stack screenOptions={{ headerTintColor: colors.tint, contentStyle: { backgroundColor: colors.grouped } }}>
      {SCREENS.map((name) => (
        <Stack.Screen key={name} name={name} />
      ))}
      {SHEETS.map((name) => (
        <Stack.Screen key={name} name={name} options={{ presentation: 'modal' }} />
      ))}
    </Stack>
  );
}

function WebStack() {
  return (
    <JSStack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        gestureEnabled: false,
        // flex: 1 keeps each screen to the height of the page, so lists scroll inside it and the
        // bars stay put (the web stack otherwise lets a screen grow with its content).
        cardStyle: { flex: 1, backgroundColor: colors.grouped },
      }}
    >
      {SCREENS.map((name) => (
        <JSStack.Screen key={name} name={name} />
      ))}
      {SHEETS.map((name) => (
        <JSStack.Screen
          key={name}
          name={name}
          options={{
            presentation: 'modal',
            animation: 'default',
            ...TransitionPresets.ModalPresentationIOS,
            cardStyleInterpolator: forSheetIOS,
            detachPreviousScreen: false,
            gestureEnabled: false,
            cardStyle: { flex: 1, backgroundColor: colors.grouped },
          }}
        />
      ))}
    </JSStack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <DataProvider>
          <FeedbackProvider>
            <StatusBar style="dark" />
            {Platform.OS === 'web' ? <WebStack /> : <NativeStack />}
          </FeedbackProvider>
        </DataProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
