import { LinearGradient } from "expo-linear-gradient";
import { useMemo, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  Switch,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Text } from "@/components/ui";
import { ms, s } from "@/lib/screen";
import { useTheme } from "@/lib/theme-context";
import { font, mono, radius } from "@/theme";

type ButtonVariant = "primary" | "outline" | "danger" | "text";

/**
 * Pill button. `primary` is the web's liquid button (soft blue underline),
 * `outline` the ghost button, `danger` the destructive one.
 */
export function Button({
  label,
  onPress,
  variant = "outline",
  busy = false,
  disabled = false,
  icon,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  busy?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const off = disabled || busy;
  const danger = colors.tones.bad;
  const text = variant === "danger" ? danger.color : colors.ink;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy }}
      style={({ pressed }) => [
        {
          minHeight: variant === "text" ? 36 : 46,
          paddingHorizontal: variant === "text" ? s(8) : s(22),
          flexDirection: "row",
          gap: s(9),
          borderRadius: radius.pill,
          borderWidth: variant === "text" ? 0 : 1,
          borderColor:
            variant === "danger"
              ? danger.line
              : variant === "primary"
                ? colors.chromeLine
                : colors.chromeLine,
          backgroundColor:
            variant === "primary"
              ? colors.navSolid
              : variant === "danger"
                ? danger.fill
                : variant === "outline"
                  ? colors.card
                  : "transparent",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          opacity: off ? 0.5 : 1,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
        style,
      ]}
    >
      {busy ? <ActivityIndicator size="small" color={text} /> : icon}
      <Text
        style={{
          fontFamily: font.medium,
          fontSize: ms(14),
          color: variant === "text" ? colors.ink3 : text,
        }}
      >
        {label}
      </Text>
      {variant === "primary" ? (
        <LinearGradient
          colors={["transparent", colors.brand, "transparent"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{
            position: "absolute",
            left: "12%",
            right: "12%",
            bottom: 0,
            height: 2,
          }}
        />
      ) : null}
    </Pressable>
  );
}

/** Labelled text input in the web's inset style, with an inline error. */
export function TextField({
  label,
  value,
  onChangeText,
  error,
  hint,
  placeholder,
  keyboardType,
  monospace = false,
  autoCapitalize = "sentences",
  secureTextEntry,
  editable = true,
  onSubmitEditing,
  multiline = false,
}: {
  label?: string;
  value: string;
  onChangeText: (text: string) => void;
  error?: string | null;
  hint?: string;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  monospace?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  secureTextEntry?: boolean;
  editable?: boolean;
  onSubmitEditing?: () => void;
  multiline?: boolean;
}) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: s(6) }}>
      {label ? (
        <Text style={{ color: colors.ink3, fontSize: ms(13) }}>{label}</Text>
      ) : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.ink5}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        secureTextEntry={secureTextEntry}
        editable={editable}
        multiline={multiline}
        onSubmitEditing={onSubmitEditing}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        accessibilityLabel={label}
        style={{
          color: colors.ink,
          backgroundColor: colors.inset,
          borderColor: error
            ? colors.tones.bad.color
            : focused
              ? colors.brand
              : colors.border,
          borderWidth: 1,
          borderRadius: 14,
          paddingHorizontal: s(14),
          paddingVertical: s(multiline ? 12 : 11),
          minHeight: multiline ? s(84) : undefined,
          textAlignVertical: multiline ? "top" : "center",
          fontFamily: monospace ? mono : font.regular,
          fontSize: ms(15),
          opacity: editable ? 1 : 0.5,
        }}
      />
      {error ? (
        <Text style={{ color: colors.tones.bad.color, fontSize: ms(12.5) }}>
          {error}
        </Text>
      ) : hint ? (
        <Text style={{ color: colors.ink4, fontSize: ms(12.5) }}>{hint}</Text>
      ) : null}
    </View>
  );
}

/** Row of pill chips. Single choice (`value`) or multiple (`values`). */
export function ChipRow<T extends string>({
  options,
  value,
  values,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value?: T | null;
  values?: T[];
  onChange: (value: T) => void;
  label?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: s(8) }}>
      {label ? (
        <Text style={{ color: colors.ink3, fontSize: ms(13) }}>{label}</Text>
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: s(8) }}>
        {options.map((option) => {
          const active = values
            ? values.includes(option.value)
            : value === option.value;
          return (
            <Pressable
              key={option.value}
              onPress={() => onChange(option.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={{
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: active ? colors.brand : colors.border,
                backgroundColor: active
                  ? colors.tones.info.fill
                  : "transparent",
                paddingHorizontal: s(13),
                paddingVertical: s(7),
              }}
            >
              <Text
                style={{
                  color: active ? colors.ink : colors.ink2,
                  fontSize: ms(13),
                }}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Field that opens a searchable sheet of options. */
export function SelectField({
  label,
  value,
  options,
  onChange,
  error,
  searchable = false,
}: {
  label?: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  error?: string | null;
  searchable?: boolean;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle
      ? options.filter((option) => option.toLowerCase().includes(needle))
      : options;
  }, [options, query]);

  return (
    <View style={{ gap: s(6) }}>
      {label ? (
        <Text style={{ color: colors.ink3, fontSize: ms(13) }}>{label}</Text>
      ) : null}
      <Pressable
        onPress={() => {
          setQuery("");
          setOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          backgroundColor: colors.inset,
          borderColor: error ? colors.tones.bad.color : colors.border,
          borderWidth: 1,
          borderRadius: 14,
          paddingHorizontal: s(14),
          paddingVertical: s(12),
        }}
      >
        <Text style={{ fontSize: ms(15) }}>{value}</Text>
        <Text style={{ color: colors.ink4 }}>▾</Text>
      </Pressable>
      {error ? (
        <Text style={{ color: colors.tones.bad.color, fontSize: ms(12.5) }}>
          {error}
        </Text>
      ) : null}

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          onPress={() => setOpen(false)}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)" }}
        />
        <View
          style={{
            maxHeight: "70%",
            backgroundColor: colors.navSolid,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            borderWidth: 1,
            borderColor: colors.chromeLine,
            paddingBottom: insets.bottom + s(8),
          }}
        >
          <View style={{ padding: s(16), gap: s(10) }}>
            <Text style={{ fontFamily: font.medium, fontSize: ms(16) }}>
              {label ?? "Choose"}
            </Text>
            {searchable ? (
              <TextField
                value={query}
                onChangeText={setQuery}
                placeholder="Search"
                autoCapitalize="none"
              />
            ) : null}
          </View>
          <FlatList
            data={shown}
            keyExtractor={(item) => item}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  onChange(item);
                  setOpen(false);
                }}
                style={({ pressed }) => ({
                  paddingHorizontal: s(20),
                  paddingVertical: s(13),
                  backgroundColor: pressed ? colors.chrome : "transparent",
                })}
              >
                <Text
                  style={{
                    color: item === value ? colors.brand : colors.ink,
                    fontFamily: item === value ? font.medium : font.regular,
                    fontSize: ms(15),
                  }}
                >
                  {item}
                </Text>
              </Pressable>
            )}
          />
        </View>
      </Modal>
    </View>
  );
}

/** Labelled on/off switch. */
export function Toggle({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: s(10),
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        accessibilityLabel={label}
        trackColor={{ false: colors.meterTrack, true: colors.brand }}
        thumbColor={colors.scheme === "dark" ? colors.ink : "#ffffff"}
        // react-native-web paints its own thumb when on; keep it in the palette.
        {...({
          activeThumbColor: colors.scheme === "dark" ? colors.ink : "#ffffff",
        } as object)}
      />
      <Text style={{ fontSize: ms(14) }}>{label}</Text>
    </View>
  );
}

/** Inline notice with a toned border, for warnings and context banners. */
export function Notice({
  tone = "warn",
  children,
}: {
  tone?: "warn" | "bad" | "info" | "ok";
  children: ReactNode;
}) {
  const { colors } = useTheme();
  const t = colors.tones[tone];
  return (
    <View
      style={{
        padding: s(14),
        borderRadius: 14,
        borderWidth: 1,
        borderColor: t.line,
        backgroundColor: t.fill,
      }}
    >
      <Text style={{ fontSize: ms(13.5), lineHeight: ms(20) }}>{children}</Text>
    </View>
  );
}
