const {BrowserWindow} = require('electron');
const authService = require('../services/auth-service');
const {createAppWindow} = require('../main/app-process');
const humtum = require('../services/humtum')
const envVariables = require('../env-variables');


let win = null;

function createAuthWindow() {
  destroyAuthWin();

  // Create the browser window.
  win = new BrowserWindow({
    width: 1000,
    height: 600,
  });

  win.loadURL(authService.getAuthenticationURL());

  const {session: {webRequest}} = win.webContents;

  const filter = {
    urls: [
      'http://com.securitypoke.linhhoang/*'
    ]
  };

  webRequest.onBeforeRequest(filter, async ({url}) => {
    await authService.loadTokens(url);
    await humtum.enrollInApp(envVariables.appId, (e) => {
      createAppWindow();
      destroyAuthWin();
    }).then(data => {
      if (data == null) return
      humtum.getAuth().setScopes(["read:appdata", "write:appdata"])
      win.loadURL(authService.getAuthenticationURL());

    })
  });

  win.on('authenticated', () => {

    destroyAuthWin();
  });

  win.on('closed', () => {
    win = null;
  });
}

function destroyAuthWin() {
  if (!win) return;
  win.close();
  win = null;
}

function createLogoutWindow() {
  return new Promise(resolve => {
    const logoutWindow = new BrowserWindow({
      show: false,
    });

    logoutWindow.loadURL(authService.getLogOutUrl());

    logoutWindow.on('ready-to-show', async () => {
      logoutWindow.close();
      await authService.logout();
      resolve();
    });
  });
}

module.exports = {
  createAuthWindow,
  createLogoutWindow,
};
