// Sandboxed preload. Exposes a small, explicit Paceprint API. Nothing else from Node is reachable from
// the page. The live SDK runs in the main process with its own camera; the page only receives its events
// and preview frames (drawn on screen, never stored or sent: Rule 6).
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

/** subscribe to a main-process channel; returns the unsubscribe function */
function listen(channel: string, fn: (payload: any) => void): () => void {
  const h = (_e: IpcRendererEvent, payload: unknown) => fn(payload);
  ipcRenderer.on(channel, h);
  return () => { ipcRenderer.removeListener(channel, h); };
}

const api = {
  info: () => ipcRenderer.invoke('app:info'),
  acceptConsent: () => ipcRenderer.invoke('consent:accept'),
  liveStart: () => ipcRenderer.invoke('live:start'),
  liveStop: () => ipcRenderer.invoke('live:stop'),
  onLiveEvent: (fn: (e: any) => void) => listen('live:event', fn),
  onLiveFrame: (fn: (f: any) => void) => listen('live:frame', fn),
  loadFixture: () => ipcRenderer.invoke('fixture:load') as Promise<string>,
  settings: () => ipcRenderer.invoke('store:settings'),
  saveSettings: (s: unknown) => ipcRenderer.invoke('store:saveSettings', s),
  sessions: () => ipcRenderer.invoke('store:sessions'),
  saveSession: (s: unknown) => ipcRenderer.invoke('store:saveSession', s),
  deleteSession: (id: string) => ipcRenderer.invoke('store:deleteSession', id),
  saveStream: (id: string, text: string) => ipcRenderer.invoke('store:saveStream', id, text),
  deleteAll: () => ipcRenderer.invoke('store:deleteAll'),
  dataSummary: () => ipcRenderer.invoke('store:summary'),
  openDataFolder: () => ipcRenderer.invoke('app:openDataFolder'),
};
contextBridge.exposeInMainWorld('paceprint', api);
export type PaceprintApi = typeof api;
