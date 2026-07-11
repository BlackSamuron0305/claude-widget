import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  saveAPIKey: (apiKey: string) => ipcRenderer.invoke('save-api-key', apiKey),
  getUsageData: () => ipcRenderer.invoke('get-usage-data'),
  hasAPIKey: () => ipcRenderer.invoke('has-api-key'),
  onUsageUpdate: (callback: (data: any) => void) => {
    ipcRenderer.on('usage-updated', (event, data) => callback(data));
  }
});
