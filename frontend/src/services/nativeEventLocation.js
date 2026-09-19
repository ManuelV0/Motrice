import { registerPlugin } from '@capacitor/core';

const NATIVE_PLUGIN_KEY = '__motriceEventLocationTrackingPlugin';
const NativeEventLocation = globalThis[NATIVE_PLUGIN_KEY]
  || registerPlugin('EventLocationTracking');

globalThis[NATIVE_PLUGIN_KEY] = NativeEventLocation;

export { NativeEventLocation };
