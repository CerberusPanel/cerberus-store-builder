const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('cerberusDesktop', {
  isDesktop: true,
  platform: process.platform,
  getInfo: () => ipcRenderer.invoke('cerberus:get-info'),
  loadLatest: () => ipcRenderer.invoke('cerberus:load-latest'),
  saveRelease: payload => ipcRenderer.invoke('cerberus:save-release', payload),
  importImage: url => ipcRenderer.invoke('cerberus:import-image', url),
  openOutputFolder: () => ipcRenderer.invoke('cerberus:open-output-folder'),
  setTitlebarTheme: theme => ipcRenderer.send('cerberus:set-titlebar-theme', theme),
  onMenuAction: callback => {
    const listener = (_event, action) => callback(action)
    ipcRenderer.on('cerberus:menu-action', listener)
    return () => ipcRenderer.removeListener('cerberus:menu-action', listener)
  },
})
