import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Platform, TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';

interface FormFieldProps {
  label?: string;
  value?: string;
  onChangeText?: (text: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: TextInputProps['keyboardType'];
  autoCapitalize?: TextInputProps['autoCapitalize'];
  editable?: boolean;
  error?: string;
  variant?: 'default' | 'outlineSecondary';
  style?: any;
  containerStyle?: any;
  maxLength?: number;
}

const FormField: React.FC<FormFieldProps> = ({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  keyboardType = 'default',
  autoCapitalize = 'none',
  editable = true,
  error,
  variant = 'default',
  style,
  containerStyle,
  maxLength,
}) => {
  const { colors, isDark } = useTheme();
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [androidPasswordFix, setAndroidPasswordFix] = useState(false);
  const isPasswordField = secureTextEntry;

  const getInputStyle = () => {
    if (error) {
      return {
        borderWidth: 1,
        borderColor: colors.error,
      };
    }
    if (!editable) {
      return {
        backgroundColor: isDark ? colors.surfaceSecondary : '#F0F0F0',
        color: colors.textSecondary,
        borderWidth: 1,
        borderColor: colors.border,
      };
    }
    if (variant === 'outlineSecondary') {
      return {
        borderWidth: 1,
        borderColor: isDark ? colors.borderDark : '#AAAAAA',
        backgroundColor: colors.inputBackground,
      };
    }
    return null;
  };

  const togglePasswordVisibility = () => {
    setIsPasswordVisible(!isPasswordVisible);
    if (Platform.OS === 'android' && isPasswordField) {
      setAndroidPasswordFix(!androidPasswordFix);
    }
  };

  const getSecureTextEntry = () => {
    if (!isPasswordField) return false;
    if (isPasswordVisible) return false;
    return true;
  };

  const getKeyboardType = (): TextInputProps['keyboardType'] => {
    if (isPasswordField && Platform.OS === 'android' && !isPasswordVisible) {
      return keyboardType === 'default' ? 'default' : keyboardType;
    }
    return keyboardType;
  };

  return (
    <View style={[styles.fieldContainer, containerStyle]}>
      {label && <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>}
      <View style={styles.inputContainer}>
        <TextInput
          key={androidPasswordFix ? 'password-fix-1' : 'password-fix-0'}
          style={[
            styles.input,
            {
              backgroundColor: colors.inputBackground,
              color: colors.inputText,
              borderColor: colors.inputBorder,
            },
            getInputStyle(),
            isPasswordField && styles.passwordInput,
            style,
          ]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          secureTextEntry={getSecureTextEntry()}
          keyboardType={getKeyboardType()}
          autoCapitalize={autoCapitalize}
          placeholderTextColor={colors.inputPlaceholder}
          editable={editable}
          maxLength={maxLength}
          textContentType={isPasswordField ? 'none' : 'none'}
          autoComplete={isPasswordField ? 'off' : 'off'}
          autoCorrect={false}
          spellCheck={false}
          passwordRules={isPasswordField ? 'minlength: 8;' : undefined}
          {...(Platform.OS === 'android' && isPasswordField && {
            secureTextEntry: getSecureTextEntry(),
            textAlign: 'left' as const,
          })}
        />

        {isPasswordField && (
          <TouchableOpacity
            style={styles.eyeIconContainer}
            onPress={togglePasswordVisibility}
            activeOpacity={0.7}
          >
            <Ionicons
              name={isPasswordVisible ? 'eye-outline' : 'eye-off-outline'}
              size={22}
              color={colors.iconSecondary}
            />
          </TouchableOpacity>
        )}
      </View>
      {error ? <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  fieldContainer: {
    marginBottom: 20,
    width: '100%',
  },
  label: {
    fontFamily: 'Montserrat_600SemiBold',
    fontSize: 14,
    marginBottom: 8,
    color: '#000',
  },
  inputContainer: {
    position: 'relative',
    width: '100%',
  },
  input: {
    backgroundColor: '#fff',
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 10,
    fontSize: 16,
    fontFamily: 'Montserrat_400Regular',
    color: '#000',
    width: '100%',
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  passwordInput: {
    paddingRight: 50,
  },
  eyeIconContainer: {
    position: 'absolute',
    right: 15,
    top: 14,
    width: 30,
    height: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 12,
    marginTop: 4,
    fontFamily: 'Montserrat_400Regular',
  },
});

export default FormField;
