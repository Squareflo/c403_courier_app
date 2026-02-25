import React from 'react';
import {
  TouchableOpacity,
  TouchableOpacityProps,
  ActivityIndicator,
  Text,
} from 'react-native';
import { typography } from '../../constants/typography';
import { scaleFontSize } from '../../utils/responsive';
import { useTheme } from '../../contexts/ThemeContext';

interface ButtonProps extends TouchableOpacityProps {
  title: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'dark';
  size?: 'small' | 'medium' | 'large';
  loading?: boolean;
  textColor?: string;
  backgroundColor?: string;
  borderColor?: string;
  className?: string;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  variant = 'primary',
  size = 'medium',
  loading = false,
  textColor,
  backgroundColor,
  borderColor,
  className = '',
  style,
  disabled,
  ...props
}) => {
  const { colors, isDark } = useTheme();

  const getBackgroundColor = () => {
    if (backgroundColor) return backgroundColor;
    switch (variant) {
      case 'primary':
        return colors.primary;
      case 'secondary':
        return colors.secondary;
      case 'outline':
        return 'transparent';
      case 'dark':
        return isDark ? colors.text : '#000';
      default:
        return colors.primary;
    }
  };

  const getTextColor = () => {
    if (textColor) return textColor;
    switch (variant) {
      case 'outline':
        return colors.text;
      case 'dark':
        return isDark ? '#000' : '#fff';
      default:
        return '#fff';
    }
  };

  const getBorderColor = () => {
    if (borderColor) return borderColor;
    if (variant === 'outline') {
      return colors.text;
    }
    return 'transparent';
  };

  const sizeStyles = {
    small: {
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: 10,
    },
    medium: {
      paddingVertical: 12,
      paddingHorizontal: 20,
      borderRadius: 10,
    },
    large: {
      paddingVertical: 16,
      paddingHorizontal: 24,
      borderRadius: 10,
    },
  };

  const textSizeStyles = {
    small: 13,
    medium: 14,
    large: 16,
  };

  return (
    <TouchableOpacity
      style={[
        {
          backgroundColor: getBackgroundColor(),
          borderColor: getBorderColor(),
          borderWidth: variant === 'outline' ? 2 : 0,
          alignItems: 'center' as const,
          justifyContent: 'center' as const,
          opacity: disabled || loading ? 0.5 : 1,
        },
        sizeStyles[size],
        style,
      ]}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={getTextColor()} />
      ) : (
        <Text
          style={{
            ...typography.cardTitle,
            fontSize: textSizeStyles[size],
            color: getTextColor(),
            textAlign: 'center',
          }}
        >
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
};
