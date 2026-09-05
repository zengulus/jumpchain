import { useSyncExternalStore } from 'react';
export const AI_MODE_KEY='jumpchain.ai.enabled';
const event='jumpchain-mode-change';
export function aiEnabled() {try{return localStorage.getItem(AI_MODE_KEY)==='true';}catch{return false;}}
export function setAiEnabled(enabled: boolean) {localStorage.setItem(AI_MODE_KEY,String(enabled));window.dispatchEvent(new Event(event));}
export function useAiEnabled() {return useSyncExternalStore(callback => {window.addEventListener(event,callback);window.addEventListener('storage',callback);return () => {window.removeEventListener(event,callback);window.removeEventListener('storage',callback);};},aiEnabled,() => false);}
