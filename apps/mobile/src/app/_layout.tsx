// The app shell. Every screen draws its own frame (ui/Page.tsx): the slate bar and the bottom bar,
// so the iPhone shows no system header. On the iPhone, screens use the native stack: system push
// and swipe back, real page sheets for New Job, New Item and Item Form, and the camera over
// everything. The preview page uses the JavaScript stack with the same motion. Signed out, the only
// screen is Sign In; signing in opens Jobs. The splash stays up until Nightwork's fonts are in.

import '@/ui/web-setup';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { JetBrainsMono_400Regular } from '@expo-google-fonts/jetbrains-mono/400Regular';
import { JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono/500Medium';
import { JetBrainsMono_600SemiBold } from '@expo-google-fonts/jetbrains-mono/600SemiBold';
import { JetBrainsMono_700Bold } from '@expo-google-fonts/jetbrains-mono/700Bold';
import { SpaceGrotesk_400Regular } from '@expo-google-fonts/space-grotesk/400Regular';
import { SpaceGrotesk_500Medium } from '@expo-google-fonts/space-grotesk/500Medium';
import { SpaceGrotesk_600SemiBold } from '@expo-google-fonts/space-grotesk/600SemiBold';
import { SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk/700Bold';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import JSStack, { TransitionPresets } from 'expo-router/js-stack';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '@/constants/theme';
import { useData } from '@/data/api';
import { DataProvider } from '@/data/backend';
import { FeedbackProvider } from '@/ui';
import { forSheetIOS } from '@/ui/sheetTransition';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

const FONTS = {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
  JetBrainsMono_600SemiBold,
  JetBrainsMono_700Bold,
};

const SCREENS = [
  'index',
  'my',
  'today',
  'updates',
  'recent',
  'settings/people/index',
  'settings/people/[personId]',
  'settings/companies/index',
  'settings/companies/[companyId]',
  'settings/account',
  'settings/templates/index',
  'settings/templates/[templateId]',
  'jobs/[jobId]/index',
  'jobs/[jobId]/setup',
  'jobs/[jobId]/send',
  'jobs/[jobId]/list/[by]/[key]',
  'jobs/[jobId]/items/[itemId]/index',
  'jobs/[jobId]/activity',
  'jobs/[jobId]/duplicates',
  'jobs/[jobId]/plans',
  'jobs/[jobId]/owner-update',
  'jobs/[jobId]/day-note',
] as const;
const SHEETS = ['jobs/new', 'jobs/[jobId]/items/new', 'jobs/[jobId]/read-plans', 'jobs/[jobId]/say', 'settings/item-form'] as const;
const CAMERA = 'jobs/[jobId]/capture';

function NativeStack({ signedIn }: { signedIn: boolean }) {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Protected guard={signedIn} redirectTo="/sign-in">
        {SCREENS.map((name) => (
          <Stack.Screen key={name} name={name} />
        ))}
        {SHEETS.map((name) => (
          <Stack.Screen key={name} name={name} options={{ presentation: 'modal' }} />
        ))}
        <Stack.Screen name={CAMERA} options={{ presentation: 'fullScreenModal', contentStyle: { backgroundColor: colors.black } }} />
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
        cardStyle: { flex: 1, backgroundColor: colors.background },
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
              cardStyle: { flex: 1, backgroundColor: colors.background },
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
  const [loaded, failed] = useFonts(FONTS);
  const ready = loaded || !!failed;
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);
  if (!ready) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bar }}>
      <SafeAreaProvider>
        <DataProvider>
          <FeedbackProvider>
            <StatusBar style="light" />
            <Navigator />
          </FeedbackProvider>
        </DataProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
