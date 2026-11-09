import { createObservable } from '../utils/observable.js';

// Estados possíveis da aplicação (seção 2.1 da especificação).
export const APP_STATES = Object.freeze({
  LOCAL: 'local',
  FIREBASE_CONFIGURED: 'firebase_configured',
  AUTHENTICATED: 'authenticated',
  OFFLINE: 'offline',
  SYNCING: 'syncing',
  SYNC_ERROR: 'sync_error',
});

// Etapa 2: a aplicação roda sempre em modo local (sem Firebase). As Etapas 7/8
// passam a alternar entre os demais estados conforme a configuração do usuário.
const appState = createObservable(APP_STATES.LOCAL);

const connectivity = createObservable(
  typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'online'
);

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => connectivity.set('online'));
  window.addEventListener('offline', () => connectivity.set('offline'));
}

export function getAppState() {
  return appState.get();
}

export function setAppState(next) {
  appState.set(next);
}

export function onAppStateChange(listener) {
  return appState.subscribe(listener);
}

export function getConnectivity() {
  return connectivity.get();
}

export function onConnectivityChange(listener) {
  return connectivity.subscribe(listener);
}
