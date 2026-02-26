import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('starships', {});

