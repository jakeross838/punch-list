// The search field: a white square box with a slate border, the magnifying glass and a clear button.

import { StyleSheet, TextInput, View } from 'react-native';
import { colors, fieldFont } from '@/constants/theme';
import { Icon } from './Icon';
import { TEXT_LARGEST } from './Text';
import { Touchable } from './Touchable';

export function SearchField({
  value,
  onChangeText,
  placeholder = 'Search',
  autoFocus,
  onSubmit,
  testID,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  /** The search key on the keyboard. */
  onSubmit?: () => void;
  testID?: string;
}) {
  return (
    <View style={styles.field}>
      <Icon name="magnifyingglass" size={17} color={colors.secondary} />
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
        enablesReturnKeyAutomatically
        maxFontSizeMultiplier={TEXT_LARGEST}
        onSubmitEditing={onSubmit}
        accessibilityLabel={placeholder}
        testID={testID}
        style={styles.input}
      />
      {value !== '' ? (
        <Touchable feedback="opacity" onPress={() => onChangeText('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search" testID="search-clear">
          <Icon name="xmark" size={15} color={colors.secondary} weight="medium" />
        </Touchable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    height: 42,
    backgroundColor: colors.cell,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
  },
  input: { ...fieldFont('callout'), flex: 1, height: 40, paddingVertical: 0, color: colors.label, outlineWidth: 0 },
});
