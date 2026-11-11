import { StyleSheet, TextInput, type TextInputProps } from 'react-native';

import { colors, radius, type } from '@/theme/tokens';

/** Un campo de texto con el estilo del tema. */
export function Input({ style, ...props }: TextInputProps) {
  return <TextInput placeholderTextColor={colors.textMuted} {...props} style={[styles.input, style]} />;
}

const styles = StyleSheet.create({
  input: {
    ...type.body,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: 10,
  },
});
