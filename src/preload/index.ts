import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import {
  BRIDGE_KEY,
  IpcChannel,
  IpcEvent,
  type MudanzifyBridge,
  type ScanProgress,
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
  onboarding: {
    get: () => ipcRenderer.invoke(IpcChannel.OnboardingGet),
    complete: (role) => ipcRenderer.invoke(IpcChannel.OnboardingComplete, role),
    reset: () => ipcRenderer.invoke(IpcChannel.OnboardingReset),
  },
  transfers: {
    list: () => ipcRenderer.invoke(IpcChannel.TransfersList),
    create: () => ipcRenderer.invoke(IpcChannel.TransfersCreate),
    get: (id) => ipcRenderer.invoke(IpcChannel.TransfersGet, id),
    rename: (id, name) => ipcRenderer.invoke(IpcChannel.TransfersRename, id, name),
    remove: (id) => ipcRenderer.invoke(IpcChannel.TransfersRemove, id),
    addSources: (id, kind) => ipcRenderer.invoke(IpcChannel.TransfersAddSources, id, kind),
    removeSource: (id, sourceId) => ipcRenderer.invoke(IpcChannel.TransfersRemoveSource, id, sourceId),
    pickDestination: (id) => ipcRenderer.invoke(IpcChannel.TransfersPickDestination, id),
    scan: (id) => ipcRenderer.invoke(IpcChannel.TransfersScan, id),
    onScanProgress: (listener) => {
      const handler = (_event: IpcRendererEvent, progress: ScanProgress) => listener(progress);
      ipcRenderer.on(IpcEvent.ScanProgress, handler);
      return () => ipcRenderer.removeListener(IpcEvent.ScanProgress, handler);
    },
  },
};

contextBridge.exposeInMainWorld(BRIDGE_KEY, bridge);
