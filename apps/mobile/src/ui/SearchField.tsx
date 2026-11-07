// The iPhone's search field: a rounded light gray bar with the magnifying glass, and the round
// clear button once there is something in it.

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
      <Icon name="magnifyingglass" size={16} color={colors.placeholder} weight="medium" />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
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
          <Icon name="xmark.circle.fill" size={17} color={colors.circle} />
        </Touchable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.chip,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  input: { ...fieldFont('body'), flex: 1, height: 36, paddingVertical: 0, color: colors.label, outlineWidth: 0 },
});
