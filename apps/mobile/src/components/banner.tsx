import { Feather } from '@expo/vector-icons';
import { Link, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { colors, fonts, light, radius, space } from '@/theme/tokens';

type Action = { label: string; href: Href } | { label: string; onPress: () => void };

/** Un aviso con ícono y, si hace falta, una acción: un enlace a otra pantalla o un callback. */
export function Banner({ children, action }: { children: React.ReactNode; action?: Action }) {
  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Feather name="alert-triangle" size={20} color={light.yellow.bg} style={styles.icon} />
      <View style={styles.body}>
        <Text style={styles.text}>{children}</Text>
        {action !== undefined &&
          ('href' in action ? (
            // El Link de expo-router usa su propio Text: la fuente va explícita
            <Link href={action.href} style={styles.action}>
              {action.label}
            </Link>
          ) : (
            <Pressable onPress={action.onPress} accessibilityRole="button">
              <Text style={styles.action}>{action.label}</Text>
            </Pressable>
          ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    gap: space.md,
    backgroundColor: colors.warningBg,
    borderWidth: 1,
    borderColor: colors.warningBorder,
    borderRadius: radius.md,
    padding: space.md,
  },
  icon: { marginTop: 2 },
  body: { flex: 1, gap: space.xs },
  text: { color: light.yellow.bg },
  action: { color: colors.primary, fontFamily: fonts.bodyBold, textDecorationLine: 'underline' },
});
