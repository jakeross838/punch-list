// Continue with Apple, off the iPhone: Apple's page opens in the browser.

import { Button } from '@/ui';

export function AppleButton({ onPress, disabled, testID }: { onPress: () => void; disabled?: boolean; testID?: string }) {
  return <Button label="Continue with Apple" onPress={onPress} disabled={disabled} testID={testID} />;
}
