
import { ProjectData } from '../types';

const DB_NAME = 'ValeraPreProDB';
const DB_VERSION = 1;
const STORE_NAME = 'project_autosave';
const KEY = 'current_session';

/**
 * Saves the full project data to IndexedDB.
 * Can handle large base64 strings that fail in localStorage.
 */
export const saveProjectToIDB = (project: ProjectData): Promise<void> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error("IDB Open Error");
      reject("Failed to open database");
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      try {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const putRequest = store.put(project, KEY);

        putRequest.onsuccess = () => resolve();
        putRequest.onerror = (e) => {
          console.warn("IDB Save Error", e);
          reject("Failed to save to IDB");
        };
      } catch (e) {
        console.warn("IDB Transaction Error", e);
        reject(e);
      }
    };
  });
};

/**
 * Loads the project data from IndexedDB.
 */
export const loadProjectFromIDB = (): Promise<ProjectData | null> => {
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => resolve(null);
    request.onupgradeneeded = (event) => {
       const db = (event.target as IDBOpenDBRequest).result;
       db.createObjectStore(STORE_NAME);
    };

    request.onsuccess = () => {
      const db = request.result;
      try {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const getRequest = store.get(KEY);

        getRequest.onsuccess = () => {
          resolve(getRequest.result as ProjectData || null);
        };
        getRequest.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    };
  });
};
