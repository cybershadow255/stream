const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getSources: () => ipcRenderer.invoke('get-sources'),
  setSelectedSource: (sourceId) => ipcRenderer.invoke('set-selected-source', sourceId)
});
