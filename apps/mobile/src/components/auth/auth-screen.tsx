import { Link, type Href } from 'expo-router';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/text';
import { colors, fonts, space, type } from '@/theme/tokens';

interface AuthScreenProps {
  title: string;
  children: React.ReactNode;
  /** El enlace a la otra pantalla: "¿No tienes cuenta?" + "Regístrate". */
  switchText: string;
  switchLabel: string;
  switchHref: Href;
}

/** El marco de login y registro: la marca arriba, el formulario al centro y el enlace a la otra pantalla. */
export function AuthScreen({ title, children, switchText, switchLabel, switchHref }: AuthScreenProps) {
  const { top, bottom } = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: top + space.xxxl, paddingBottom: bottom + space.xxl }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.brand}>
            GreenLight
          </Text>
          <Text accessibilityRole="header" style={type.title}>
            {title}
          </Text>
          <View style={styles.form}>{children}</View>
          <View style={styles.switchRow}>
            <Text style={styles.switchText}>{switchText}</Text>
            {/* El Link de expo-router usa su propio Text: la fuente va explícita */}
            <Link href={switchHref} style={styles.switchLink} accessibilityRole="link">
              {switchLabel}
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: space.lg, alignItems: 'center' },
  card: { width: '100%', maxWidth: 420, gap: space.md },
  brand: { ...type.display, fontSize: 32, color: colors.primary, marginBottom: space.sm },
  form: { gap: space.sm, marginTop: space.sm },
  switchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, marginTop: space.lg },
  switchText: { color: colors.textMuted },
  switchLink: { color: colors.primary, fontFamily: fonts.bodyBold, textDecorationLine: 'underline' },
});
