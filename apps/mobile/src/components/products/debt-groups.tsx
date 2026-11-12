import { Pressable, StyleSheet, Switch, View } from 'react-native';

import { Card } from '@/components/card';
import { Input } from '@/components/input';
import { Label } from '@/components/label';
import { MoneyInput } from '@/components/money-input';
import { RateField } from '@/components/products/rate-field';
import { Text } from '@/components/text';
import { debtTotal, type DebtGroupDraft, emptyGroup, MAX_GROUPS, newGroupKey } from '@/products/debt';
import { formatCop } from '@/money';
import { colors, space, type } from '@/theme/tokens';

interface DebtGroupsProps {
  groups: DebtGroupDraft[];
  onChange: (groups: DebtGroupDraft[]) => void;
}

/**
 * La deuda que la tarjeta ya traía, por grupos: cada fila es el capital pendiente de las compras que tienen las
 * mismas cuotas restantes (y la misma tasa), sumadas. Con "+ Agregar grupo" se arman los que hagan falta.
 */
export function DebtGroups({ groups, onChange }: DebtGroupsProps) {
  const update = (key: string, changes: Partial<DebtGroupDraft>) =>
    onChange(groups.map((g) => (g.key === key ? { ...g, ...changes } : g)));

  return (
    <View style={styles.wrap}>
      <Text style={styles.help}>
        Agrupa las compras que tienen las mismas cuotas pendientes. En tu banco, abre cada compra diferida para ver
        cuánto falta y cuántas cuotas quedan.
      </Text>

      {groups.map((group, i) => (
        <Card key={group.key} style={styles.group}>
          <View style={styles.groupHeader}>
            <Text style={type.subtitle}>Grupo {i + 1}</Text>
            {groups.length > 1 && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Quitar el grupo ${i + 1}`}
                hitSlop={8}
                onPress={() => onChange(groups.filter((g) => g.key !== group.key))}
              >
                <Text style={styles.remove}>Quitar</Text>
              </Pressable>
            )}
          </View>

          <Label>Capital pendiente</Label>
          <MoneyInput
            value={group.amountCents}
            onChangeCents={(amountCents) => update(group.key, { amountCents })}
            placeholder="$ 0"
          />

          <Label>Cuotas que faltan (1 a 72)</Label>
          <Input
            value={group.installments}
            onChangeText={(installments) => update(group.key, { installments })}
            placeholder="6"
            keyboardType="number-pad"
            maxLength={2}
          />

          <View style={styles.promoRow}>
            <Text style={styles.promoLabel}>Tiene promoción</Text>
            <Switch
              accessibilityLabel={`El grupo ${i + 1} tiene promoción`}
              value={group.hasPromo}
              onValueChange={(hasPromo) => update(group.key, { hasPromo })}
              trackColor={{ false: colors.border, true: colors.primarySoft }}
              thumbColor={group.hasPromo ? colors.primary : colors.textMuted}
            />
          </View>
          {group.hasPromo && (
            <>
              <Text style={styles.hint}>
                La tasa de la promoción (0 si es sin interés). Sin promoción paga la de la tarjeta.
              </Text>
              <RateField
                percent={group.promoPercent}
                onChangePercent={(promoPercent) => update(group.key, { promoPercent })}
                kind={group.promoKind}
                onChangeKind={(promoKind) => update(group.key, { promoKind })}
              />
            </>
          )}
        </Card>
      ))}

      {groups.length < MAX_GROUPS && (
        <Pressable
          accessibilityRole="button"
          onPress={() => onChange([...groups, emptyGroup(newGroupKey())])}
          style={styles.add}
        >
          <Text style={styles.addText}>+ Agregar grupo</Text>
        </Pressable>
      )}

      <View style={styles.total}>
        <Text style={styles.muted}>Total</Text>
        <Text style={type.subtitle}>{formatCop(debtTotal(groups))}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  help: { ...type.caption, color: colors.textMuted },
  group: { gap: space.xs },
  groupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  remove: { color: colors.danger, fontWeight: '700' },
  promoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.sm },
  promoLabel: type.bodyMedium,
  hint: { ...type.caption, color: colors.textMuted },
  add: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  addText: { color: colors.primary, fontWeight: '700' },
  total: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  muted: { ...type.caption, color: colors.textMuted },
});
