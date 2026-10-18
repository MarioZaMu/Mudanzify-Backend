import { contextBridge, ipcRenderer } from 'electron';
import { BRIDGE_KEY, IpcChannel, type MudanzifyBridge } from '../shared/contract';

// Only these explicit functions reach the renderer; never expose ipcRenderer itself.
const bridge: MudanzifyBridge = {
  app: {
    getInfo: () => ipcRenderer.invoke(IpcChannel.AppGetInfo),
  },
};

contextBridge.exposeInMainWorld(BRIDGE_KEY, bridge);
