// Shared Google Maps styles for light and dark mode

// Light mode: Subtle Grayscale (https://snazzymaps.com/style/15/subtle-grayscale)
export const LIGHT_MAP_STYLE = [
  { featureType: 'administrative', elementType: 'all', stylers: [{ saturation: -100 }] },
  { featureType: 'administrative.province', elementType: 'all', stylers: [{ visibility: 'off' }] },
  { featureType: 'landscape', elementType: 'all', stylers: [{ saturation: -100 }, { lightness: 65 }, { visibility: 'on' }] },
  { featureType: 'poi', elementType: 'all', stylers: [{ saturation: -100 }, { lightness: 50 }, { visibility: 'simplified' }] },
  { featureType: 'road', elementType: 'all', stylers: [{ saturation: -100 }] },
  { featureType: 'road.highway', elementType: 'all', stylers: [{ visibility: 'simplified' }] },
  { featureType: 'road.arterial', elementType: 'all', stylers: [{ lightness: 30 }] },
  { featureType: 'road.local', elementType: 'all', stylers: [{ lightness: 40 }] },
  { featureType: 'transit', elementType: 'all', stylers: [{ saturation: -100 }, { visibility: 'simplified' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ hue: '#ffff00' }, { lightness: -25 }, { saturation: -97 }] },
  { featureType: 'water', elementType: 'labels', stylers: [{ lightness: -25 }, { saturation: -100 }] },
];

// Dark mode: Dark (https://snazzymaps.com/style/89571/dark)
export const DARK_MAP_STYLE = [
  { featureType: 'all', elementType: 'labels.text.fill', stylers: [{ saturation: 36 }, { color: '#000000' }, { lightness: 40 }] },
  { featureType: 'all', elementType: 'labels.text.stroke', stylers: [{ visibility: 'on' }, { color: '#000000' }, { lightness: 16 }] },
  { featureType: 'all', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative', elementType: 'geometry.fill', stylers: [{ color: '#000000' }, { lightness: 20 }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#000000' }, { lightness: 17 }, { weight: 1.2 }] },
  { featureType: 'administrative', elementType: 'labels.text.fill', stylers: [{ lightness: 62 }] },
  { featureType: 'landscape', elementType: 'geometry', stylers: [{ color: '#000000' }, { lightness: 20 }] },
  { featureType: 'landscape', elementType: 'geometry.fill', stylers: [{ lightness: 0 }] },
  { featureType: 'landscape', elementType: 'labels.text.fill', stylers: [{ lightness: 69 }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#000000' }, { lightness: 21 }] },
  { featureType: 'road', elementType: 'geometry.fill', stylers: [{ lightness: 63 }] },
  { featureType: 'road.highway', elementType: 'geometry.fill', stylers: [{ color: '#2d2d2d' }, { lightness: 17 }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#000000' }, { lightness: 29 }, { weight: 0.2 }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#000000' }, { lightness: 18 }] },
  { featureType: 'road.local', elementType: 'geometry', stylers: [{ color: '#000000' }, { lightness: 16 }] },
  { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#000000' }, { lightness: 19 }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0f252e' }, { lightness: 17 }] },
  { featureType: 'water', elementType: 'geometry.fill', stylers: [{ lightness: -100 }, { gamma: 0.00 }] },
];
