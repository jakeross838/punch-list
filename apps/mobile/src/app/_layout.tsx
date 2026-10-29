import { router, Stack, useCanGoBack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, Pressable, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '@/constants/theme';
import { DataProvider } from '@/data/backend';

/**
 * On the web preview the default back control is a link, and the preview page may open links
 * outside itself. This one is a plain button. The phone keeps the native back button.
 */
function WebBackButton() {
  const canGoBack = useCanGoBack();
  if (!canGoBack) return null;
  return (
    <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back" hitSlop={12} style={{ paddingRight: 12 }}>
      <Text style={{ color: colors.blue, fontSize: 17, fontWeight: '600' }}>‹ Back</Text>
    </Pressable>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <DataProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.white },
            headerTintColor: colors.ink,
            headerTitleStyle: { fontWeight: '700' },
            headerBackTitle: 'Back',
            contentStyle: { backgroundColor: colors.page },
            ...(Platform.OS === 'web' ? { headerLeft: () => <WebBackButton /> } : {}),
          }}
        >
          <Stack.Screen name="index" options={{ title: 'Jobs' }} />
          <Stack.Screen name="jobs/new" options={{ title: 'New job' }} />
          <Stack.Screen name="jobs/[jobId]/index" options={{ title: 'Completion List' }} />
          <Stack.Screen name="jobs/[jobId]/setup" options={{ title: 'Job setup' }} />
          <Stack.Screen name="jobs/[jobId]/items/new" options={{ title: 'New item' }} />
          <Stack.Screen name="jobs/[jobId]/items/[itemId]" options={{ title: 'Item' }} />
        </Stack>
      </DataProvider>
    </SafeAreaProvider>
  );
}
