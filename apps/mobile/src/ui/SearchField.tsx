// The iOS search field: a gray capsule with the magnifying glass and a clear button.

import { StyleSheet, TextInput, View } from 'react-native';
import { colors, type as typeScale } from '@/constants/theme';
import { Icon } from './Icon';
import { Touchable } from './Touchable';

export function SearchField({
  value,
  onChangeText,
  placeholder = 'Search',
  autoFocus,
  testID,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  testID?: string;
}) {
  return (
    <View style={styles.field}>
      <Icon name="magnifyingglass" size={16} color={colors.secondary} weight="semibold" />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.secondary}
        selectionColor={colors.tint}
        autoCorrect={false}
        autoCapitalize="none"
        autoFocus={autoFocus}
        returnKeyType="search"
        enterKeyHint="search"
        accessibilityLabel={placeholder}
        testID={testID}
        style={styles.input}
      />
      {value !== '' ? (
        <Touchable feedback="opacity" onPress={() => onChangeText('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search">
          <Icon name="xmark.circle.fill" size={17} color={colors.chevron} />
        </Touchable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
  },
  input: { ...typeScale.body, flex: 1, height: 38, paddingVertical: 0, color: colors.label, outlineWidth: 0 },
});
