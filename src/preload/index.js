import { contextBridge, ipcRenderer } from 'electron'

const on = (channel) => (cb) => {
  const listener = (_e, payload) => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

contextBridge.exposeInMainWorld('desktop', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  cacheGet: (key) => ipcRenderer.invoke('cache:get', key),
  cacheSet: (key, value) => ipcRenderer.invoke('cache:set', key, value),
  fetch: (url, init) => ipcRenderer.invoke('net:fetch', url, init),
  pickFolder: (title) => ipcRenderer.invoke('dialog:pick-folder', title),
  onPosition: on('game:position'),
  onRaid: on('game:raid'),
  onSession: on('game:session'),
  getTaskProgress: () => ipcRenderer.invoke('tasks:get'),
  setTaskStatus: (mode, taskId, status) => ipcRenderer.invoke('tasks:set', mode, taskId, status),
  onTaskProgress: on('tasks:progress'),
  onWatchStatus: on('game:watch-status')
})
