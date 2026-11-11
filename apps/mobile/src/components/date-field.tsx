import { Feather } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { createElement, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/text';
import { formatDay, fromIsoDate, isValidDate, toIsoDate } from '@/dates';
import { colors, fonts, radius, space } from '@/theme/tokens';

interface DateFieldProps {
  /** La fecha elegida, YYYY-MM-DD. */
  value: string;
  onChange: (iso: string) => void;
}

/**
 * Un campo de fecha con el selector de cada plataforma, así que no se puede escribir una fecha mal:
 * Android abre su diálogo, iOS despliega el calendario debajo y la web usa el `<input type="date">` del navegador.
 */
export function DateField({ value, onChange }: DateFieldProps) {
  if (Platform.OS === 'web') return <WebDateField value={value} onChange={onChange} />;
  return <NativeDateField value={value} onChange={onChange} />;
}

/** React Native Web deja usar elementos del DOM: el navegador ya trae un buen selector de fecha. */
function WebDateField({ value, onChange }: DateFieldProps) {
  return createElement('input', {
    type: 'date',
    value,
    'aria-label': 'Fecha del gasto',
    onChange: (event: { target: { value: string } }) => {
      // Un campo vaciado llega como "": se ignora y se queda la fecha que había
      if (isValidDate(event.target.value)) onChange(event.target.value);
    },
    style: {
      boxSizing: 'border-box',
      width: '100%',
      minHeight: 48,
      padding: `0 ${space.lg}px`,
      backgroundColor: colors.surfaceAlt,
      color: colors.text,
      border: `1px solid ${colors.border}`,
      borderRadius: radius.sm,
      fontFamily: fonts.body,
      fontSize: 16,
      colorScheme: 'dark',
    },
  });
}

function NativeDateField({ value, onChange }: DateFieldProps) {
  // Solo iOS: el calendario se despliega debajo del campo. En Android el selector es un diálogo del sistema
  const [open, setOpen] = useState(false);
  const date = fromIsoDate(isValidDate(value) ? value : toIsoDate(new Date()));

  const press = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: date,
        mode: 'date',
        onValueChange: (_event, picked) => onChange(toIsoDate(picked)),
      });
    } else {
      setOpen((v) => !v);
    }
  };

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Fecha del gasto: ${formatDay(toIsoDate(date))}`}
        onPress={press}
        style={styles.field}
      >
        <Text>{formatDay(toIsoDate(date))}</Text>
        <Feather name="calendar" size={20} color={colors.textMuted} />
      </Pressable>

      {open && Platform.OS === 'ios' && (
        <DateTimePicker
          value={date}
          mode="date"
          display="inline"
          themeVariant="dark"
          accentColor={colors.primary}
          onValueChange={(_event, picked) => onChange(toIsoDate(picked))}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  field: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: space.lg,
  },
});
