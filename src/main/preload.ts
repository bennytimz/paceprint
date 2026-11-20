// Sandboxed preload. Exposes the SmartSpectra bridge (official SDK preload, bundled in) and a
// small, explicit Paceprint API. Nothing else from Node is reachable from the page.
import { contextBridge, ipcRenderer } from 'electron';
// eslint-disable-next-line @typescript-eslint/no-var-requires
require('@smartspectra/node-sdk/preload');

const api = {
  info: () => ipcRenderer.invoke('app:info'),
  acceptConsent: () => ipcRenderer.invoke('consent:accept'),
  prepareLive: () => ipcRenderer.invoke('live:prepare') as Promise<string>,
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
