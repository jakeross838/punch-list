// The app shell. On the iPhone, screens use the native stack: system push and swipe back, real
// page sheets for New Job, New Item, Send Lists and Item Form, and the camera over everything. The
// preview page uses the JavaScript stack with the same iOS motion: screens slide in from the right,
// sheets rise from the bottom while the screen behind shrinks back, and the camera rises full screen.
// Signed out, the only screen is Sign In; signing in opens Jobs.

import '@/ui/web-setup';
import { Stack } from 'expo-router';
import JSStack, { TransitionPresets } from 'expo-router/js-stack';
import { StatusBar } from 'expo-status-bar';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '@/constants/theme';
import { useData } from '@/data/api';
import { DataProvider } from '@/data/backend';
import { FeedbackProvider } from '@/ui';
import { forSheetIOS } from '@/ui/sheetTransition';

const SCREENS = [
  'index',
  'my',
  'settings/people/index',
  'settings/people/[personId]',
  'settings/companies/index',
  'settings/companies/[companyId]',
  'settings/account',
  'settings/templates/index',
  'settings/templates/[templateId]',
  'jobs/[jobId]/index',
  'jobs/[jobId]/setup',
  'jobs/[jobId]/list/[by]/[key]',
  'jobs/[jobId]/items/[itemId]/index',
  'jobs/[jobId]/schedule',
  'jobs/[jobId]/plan/[companyId]',
  'jobs/[jobId]/activity',
  'jobs/[jobId]/company/[companyId]',
] as const;
const SHEETS = ['jobs/new', 'jobs/[jobId]/items/new', 'jobs/[jobId]/send', 'settings/item-form'] as const;
const CAMERA = 'jobs/[jobId]/capture';

function NativeStack({ signedIn }: { signedIn: boolean }) {
  return (
    <Stack screenOptions={{ headerTintColor: colors.tint, contentStyle: { backgroundColor: colors.grouped } }}>
      <Stack.Protected guard={signedIn} redirectTo="/sign-in">
        {SCREENS.map((name) => (
          <Stack.Screen key={name} name={name} />
        ))}
        {SHEETS.map((name) => (
          <Stack.Screen key={name} name={name} options={{ presentation: 'modal' }} />
        ))}
        <Stack.Screen name={CAMERA} options={{ presentation: 'fullScreenModal', headerShown: false, contentStyle: { backgroundColor: colors.black } }} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn} redirectTo="/">
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
    </Stack>
  );
}

function WebStack({ signedIn }: { signedIn: boolean }) {
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
      <JSStack.Protected guard={signedIn} redirectTo="/sign-in">
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
        <JSStack.Screen
          name={CAMERA}
          options={{
            presentation: 'modal',
            ...TransitionPresets.ModalSlideFromBottomIOS,
            detachPreviousScreen: false,
            gestureEnabled: false,
            cardStyle: { flex: 1, backgroundColor: colors.black },
          }}
        />
      </JSStack.Protected>
      <JSStack.Protected guard={!signedIn} redirectTo="/">
        <JSStack.Screen name="sign-in" />
      </JSStack.Protected>
    </JSStack>
  );
}

/** The stack for whoever is signed in, or Sign In. */
function Navigator() {
  const signedIn = useData().useMe() !== null;
  return Platform.OS === 'web' ? <WebStack signedIn={signedIn} /> : <NativeStack signedIn={signedIn} />;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <DataProvider>
          <FeedbackProvider>
            <StatusBar style="dark" />
            <Navigator />
          </FeedbackProvider>
        </DataProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
