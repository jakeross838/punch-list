// Continue with Apple, on the iPhone: Apple's own button, as Apple asks for it.

import * as AppleAuthentication from 'expo-apple-authentication';
import { StyleSheet, View } from 'react-native';

export function AppleButton({ onPress, disabled, testID }: { onPress: () => void; disabled?: boolean; testID?: string }) {
  return (
    <View style={disabled ? styles.off : null} pointerEvents={disabled ? 'none' : 'auto'} testID={testID}>
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
        buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
        cornerRadius={0}
        style={styles.button}
        onPress={onPress}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  button: { width: '100%', height: 50 },
  off: { opacity: 0.5 },
});
