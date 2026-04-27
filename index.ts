import { registerRootComponent } from 'expo';
import { LogBox } from 'react-native';
import App from './App';

LogBox.ignoreLogs(['expo-notifications']);

registerRootComponent(App);
