import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import {
  BRIDGE_KEY,
  IpcChannel,
  IpcEvent,
  type MudanzifyBridge,
  type ThemeState,
} from '../shared/contract';

// Only these explicit functions reach the renderer; never expose ipcRenderer itself.
const bridge: MudanzifyBridge = {
  app: {
    getInfo: () => ipcRenderer.invoke(IpcChannel.AppGetInfo),
  },
  theme: {
    get: () => ipcRenderer.invoke(IpcChannel.ThemeGet),
    set: (preference) => ipcRenderer.invoke(IpcChannel.ThemeSet, preference),
    onChange: (listener) => {
      const handler = (_event: IpcRendererEvent, state: ThemeState) => listener(state);
      ipcRenderer.on(IpcEvent.ThemeChanged, handler);
      return () => ipcRenderer.removeListener(IpcEvent.ThemeChanged, handler);
    },
  },
};

contextBridge.exposeInMainWorld(BRIDGE_KEY, bridge);
