import { Feather } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import type { Light } from '@/api/types';
import { Text } from '@/components/text';
import { fonts, light as lights, radius } from '@/theme/tokens';

const ICON: Record<Light, 'check' | 'alert-triangle' | 'x'> = {
  green: 'check',
  yellow: 'alert-triangle',
  red: 'x',
};

/** El semáforo como pastilla: ícono además del color (no se depende solo de distinguir colores) y texto oscuro encima. */
export function LightBadge({
  light,
  label,
}: {
  light: Light;
  /** Otro texto en vez del nombre del semáforo. */ label?: string;
}) {
  const { bg, fg, label: name } = lights[light];
  const text = label ?? name;
  return (
    <View style={[styles.badge, { backgroundColor: bg }]} accessible accessibilityLabel={text}>
      <Feather name={ICON[light]} size={14} color={fg} />
      <Text style={[styles.text, { color: fg }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  text: { fontFamily: fonts.bodyBold, fontSize: 12 },
});
