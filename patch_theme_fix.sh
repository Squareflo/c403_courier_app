#!/bin/bash
# Run from the c403_courier_app root directory
# Patches ActiveDeliveryScreen.tsx and OpenOfferScreen.tsx for proper light/dark mode

ADS="./src/screens/ActiveDeliveryScreen.tsx"
OOS="./src/screens/OpenOfferScreen.tsx"

echo "=== Patching ActiveDeliveryScreen.tsx ==="

# 1. Add colors to useTheme destructure
sed -i '' "s/const { isDark } = useTheme();/const { isDark, colors } = useTheme();/" "$ADS"

# 2. Replace hardcoded color variables with theme colors
sed -i '' "s/const bg = '#000000';/const bg = colors.backgroundSecondary;/" "$ADS"
sed -i '' "s/const cardBg = '#2a2a2a';/const cardBg = colors.card;/" "$ADS"
sed -i '' "s/const textColor = '#FFFFFF';/const textColor = colors.text;/" "$ADS"
sed -i '' "s/const textSecColor = '#9CA3AF';/const textSecColor = colors.textTertiary;/" "$ADS"

# 3. Make map style conditional on theme
sed -i '' 's/customMapStyle={DARK_MAP_STYLE}/customMapStyle={isDark ? DARK_MAP_STYLE : []}/g' "$ADS"

# 4. Fullscreen map background: use theme
sed -i '' "s/flex: 1, backgroundColor: '#000' /flex: 1, backgroundColor: colors.background /" "$ADS"

# 5. Header title - use inline color
sed -i '' 's/<Text style={styles.headerTitle}>/<Text style={[styles.headerTitle, { color: textColor }]}>/' "$ADS"

# 6. Header profile initial - use inline color
sed -i '' 's/<Text style={styles.headerProfileInitial}>/<Text style={[styles.headerProfileInitial, { color: textColor }]}>/' "$ADS"

# 7. Remove hardcoded #FFFFFF from headerTitle in StyleSheet
sed -i '' "/headerTitle: {/{n;n;s/    color: '#FFFFFF',/    /;}" "$ADS"

# 8. Remove hardcoded #FFFFFF from headerProfileInitial in StyleSheet
sed -i '' "/headerProfileInitial: {/{n;n;s/    color: '#FFFFFF',/    /;}" "$ADS"

# 9. Fix directions button - remove static color, will use inline
sed -i '' "s/style={styles.directionsButton}/style={[styles.directionsButton, { backgroundColor: isDark ? '#000000' : '#E5E7EB' }]}/" "$ADS"

# 10. Fix directions button text color
sed -i '' "s/<Text style={styles.directionsButtonText}>DIRECTIONS<\/Text>/<Text style={[styles.directionsButtonText, { color: isDark ? '#FFFFFF' : '#000000' }]}>DIRECTIONS<\/Text>/g" "$ADS"

# 11. Remove hardcoded bg from directionsButton StyleSheet
sed -i '' "/directionsButton: {/{n;s/    backgroundColor: '#000000',/    /;}" "$ADS"

# 12. Remove hardcoded color from directionsButtonText StyleSheet
sed -i '' "/directionsButtonText: {/{n;n;s/    color: '#FFFFFF',/    /;}" "$ADS"

# 13. Fix EXIT button for light mode (invert colors)
sed -i '' "s/style={styles.exitButton}/style={[styles.exitButton, { backgroundColor: isDark ? '#FFFFFF' : '#000000' }]}/" "$ADS"
sed -i '' "s/<Text style={styles.exitButtonText}>EXIT<\/Text>/<Text style={[styles.exitButtonText, { color: isDark ? '#000000' : '#FFFFFF' }]}>EXIT<\/Text>/" "$ADS"

# 14. Fix modal background
sed -i '' "s/backgroundColor: '#2a2a2a',/backgroundColor: isDark ? '#2a2a2a' : '#FFFFFF',/" "$ADS"

echo "=== Patching OpenOfferScreen.tsx ==="

# 15. Make map style conditional
sed -i '' 's/customMapStyle={DARK_MAP_STYLE}/customMapStyle={isDark ? DARK_MAP_STYLE : []}/g' "$OOS"

# 16. Header title - use inline color (remove from StyleSheet, add inline)
sed -i '' 's/<Text style={styles.headerTitle}>{headerTitle}<\/Text>/<Text style={[styles.headerTitle, { color: textColor }]}>{headerTitle}<\/Text>/' "$OOS"
sed -i '' "/headerTitle: {/{n;n;s/    color: '#FFFFFF',/    /;}" "$OOS"

echo ""
echo "✅ Both files patched!"
echo ""
echo "Verifying ActiveDeliveryScreen..."
echo -n "  colors.backgroundSecondary: "; grep -c "colors.backgroundSecondary" "$ADS"
echo -n "  colors.card: "; grep -c "colors.card" "$ADS"
echo -n "  colors.text: "; grep -c "colors.text;" "$ADS"
echo -n "  isDark ? DARK_MAP_STYLE: "; grep -c "isDark ? DARK_MAP_STYLE" "$ADS"
echo ""
echo "Verifying OpenOfferScreen..."
echo -n "  isDark ? DARK_MAP_STYLE: "; grep -c "isDark ? DARK_MAP_STYLE" "$OOS"
echo -n "  headerTitle textColor: "; grep -c "styles.headerTitle, { color: textColor }" "$OOS"
