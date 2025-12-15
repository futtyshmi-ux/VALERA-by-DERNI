
declare global {
  interface Window {
    Telegram?: any;
  }
}

/**
 * Mocks the Telegram WebApp SDK for standard browser usage.
 * This ensures the app doesn't crash when accessed outside Telegram.
 */
class TelegramMock {
  initData: string = "";
  initDataUnsafe: any = {};
  version: string = "7.0"; // Updated to 7.0 to support modern features in mock
  platform: string = "web";
  colorScheme: 'light' | 'dark' = 'dark';
  themeParams: any = {};
  isExpanded: boolean = true;
  viewportHeight: number = window.innerHeight;
  viewportStableHeight: number = window.innerHeight;
  headerColor: string = "#0f172a";
  backgroundColor: string = "#0f172a";
  
  MainButton = {
    text: "MAIN BUTTON",
    color: "#06b6d4",
    textColor: "#ffffff",
    isVisible: false,
    isActive: true,
    isProgressVisible: false,
    setText: (text: string) => { this.MainButton.text = text; console.log(`[TG Mock] MainButton Text: ${text}`); },
    onClick: (cb: () => void) => { console.log("[TG Mock] MainButton Click Listener Added"); },
    offClick: (cb: () => void) => { console.log("[TG Mock] MainButton Click Listener Removed"); },
    show: () => { this.MainButton.isVisible = true; console.log("[TG Mock] MainButton Show"); },
    hide: () => { this.MainButton.isVisible = false; console.log("[TG Mock] MainButton Hide"); },
    enable: () => { this.MainButton.isActive = true; },
    disable: () => { this.MainButton.isActive = false; },
    showProgress: () => { this.MainButton.isProgressVisible = true; },
    hideProgress: () => { this.MainButton.isProgressVisible = false; },
    setParams: (params: any) => { console.log("[TG Mock] MainButton params updated", params); }
  };

  BackButton = {
    isVisible: false,
    onClick: (cb: () => void) => { console.log("[TG Mock] BackButton Click Listener Added"); },
    offClick: (cb: () => void) => { console.log("[TG Mock] BackButton Click Listener Removed"); },
    show: () => { this.BackButton.isVisible = true; console.log("[TG Mock] BackButton Show"); },
    hide: () => { this.BackButton.isVisible = false; console.log("[TG Mock] BackButton Hide"); }
  };

  HapticFeedback = {
    impactOccurred: (style: string) => console.log(`[TG Mock] Haptic Impact: ${style}`),
    notificationOccurred: (type: string) => console.log(`[TG Mock] Haptic Notification: ${type}`),
    selectionChanged: () => console.log(`[TG Mock] Haptic Selection Changed`)
  };

  CloudStorage = {
    setItem: (key: string, value: string, callback?: (err: any, stored: boolean) => void) => {
        localStorage.setItem(key, value);
        if(callback) callback(null, true);
    },
    getItem: (key: string, callback: (err: any, value: string | null) => void) => {
        const val = localStorage.getItem(key);
        if(callback) callback(null, val);
    }
  };

  ready() { console.log("[TG Mock] WebApp Ready"); }
  expand() { console.log("[TG Mock] WebApp Expanded"); }
  close() { console.log("[TG Mock] WebApp Closed"); }
  sendData(data: string) { console.log(`[TG Mock] Send Data: ${data}`); }
  onEvent(eventType: string, callback: () => void) {}
  offEvent(eventType: string, callback: () => void) {}
  enableClosingConfirmation() { console.log("[TG Mock] Closing Confirmation Enabled"); }
  disableClosingConfirmation() { console.log("[TG Mock] Closing Confirmation Disabled"); }
}

export const telegramService = {
  get WebApp() {
    if (typeof window !== 'undefined' && window.Telegram && window.Telegram.WebApp) {
      return window.Telegram.WebApp;
    }
    // Return Mock if SDK is missing
    if (!window.Telegram) window.Telegram = {};
    if (!window.Telegram.WebApp) window.Telegram.WebApp = new TelegramMock();
    return window.Telegram.WebApp;
  },

  isTelegramPlatform(): boolean {
    return !!(window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData);
  },

  isVersionAtLeast(minVersion: string): boolean {
    const v = this.WebApp.version;
    if (!v) return false;
    const [major, minor] = v.split('.').map(Number);
    const [minMajor, minMinor] = minVersion.split('.').map(Number);
    
    if (major > minMajor) return true;
    if (major === minMajor && minor >= minMinor) return true;
    return false;
  },

  init() {
    this.WebApp.ready();
    try {
        this.WebApp.expand();
    } catch(e) {
        console.warn("Error expanding WebApp:", e);
    }
    
    if (this.isVersionAtLeast('6.2') && this.WebApp.enableClosingConfirmation) {
        this.WebApp.enableClosingConfirmation();
    }
  },

  haptic: {
    impact: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => {
        if (telegramService.isVersionAtLeast('6.1')) {
            telegramService.WebApp.HapticFeedback.impactOccurred(style);
        }
    },
    success: () => {
        if (telegramService.isVersionAtLeast('6.1')) {
            telegramService.WebApp.HapticFeedback.notificationOccurred('success');
        }
    },
    error: () => {
        if (telegramService.isVersionAtLeast('6.1')) {
            telegramService.WebApp.HapticFeedback.notificationOccurred('error');
        }
    },
  }
};
