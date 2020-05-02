const jwtDecode = require('jwt-decode');
const axios = require('axios');
const url = require('url');
const envVariables = require('../env-variables');
const keytar = require('keytar');
const os = require('os');

const {
  apiIdentifier,
  auth0Domain,
  clientId,
  redirectUri
} = envVariables;

const keytarService = 'electron-openid-oauth';
const keytarAccount = os.userInfo().username;

let accessToken = null;
let idToken = null;
let profile = null;
let refreshToken = null;
let scopes = []

function getAccessToken() {
  return accessToken;
}

function getIDToken() {
  return idToken;
}

function getProfile() {
  return profile;
}

function isAuthenticated() {
  return profile != null;
}
function check(x) {
  return Array.isArray(x) && x.every(function (i) {
    return typeof i === "string"
  });
}

function setScopes(scope) {
  if (check(scope))
  scopes = scope
}

function getAuthenticationURL() {
  return 'https://' + auth0Domain + '/authorize?' +
    'audience=' + apiIdentifier + '&' +
    `scope=openid email profile offline_access ${scopes.join(' ')}&` +
    'response_type=code&' +
    'client_id=' + clientId + '&' +
    'redirect_uri=' + redirectUri;
}

function refreshTokens() {
  return new Promise(async (resolve, reject) => {
    const refreshToken = await keytar.getPassword(keytarService, keytarAccount);

    if (!refreshToken) return reject();

    const refreshOptions = {
      method: 'POST',
      url: `https://${auth0Domain}/oauth/token`,
      headers: {'content-type': 'application/json'},
      data: {
        grant_type: 'refresh_token',
        client_id: clientId,
        refresh_token: refreshToken,
      },
    };
    try {
      const { data } = await axios(refreshOptions)
      accessToken = data.access_token;
      idToken = data.id_token
      profile = idToken && jwtDecode(idToken);
      resolve();
    } catch (error) {
      await logout();
      return reject(error);
    }
});}


function loadTokens(callbackURL) {
  return new Promise(async (resolve, reject) => {
    const urlParts = url.parse(callbackURL, true);
    const query = urlParts.query;
    console.log(query)

    const exchangeOptions = {
      'grant_type': 'authorization_code',
      'client_id': clientId,
      'code': query.code,
      'redirect_uri': redirectUri,
    };

    const options = {
      method: 'POST',
      url: `https://${auth0Domain}/oauth/token`,
      headers: {
        'content-type': 'application/json'
      },
      data: JSON.stringify(exchangeOptions),
    };

    try {
      const { data } = await axios(options)
      accessToken = data.access_token;
      idToken = data.id_token
      profile = idToken && jwtDecode(idToken);
      refreshToken = data.refresh_token;
      keytar.setPassword(keytarService, keytarAccount, refreshToken);


      resolve();
    } catch (error) {
      await logout();
      return reject(error);
    }

    
  });
}

async function logout(cb) {
  await keytar.deletePassword(keytarService, keytarAccount);
  accessToken = null;
  profile = null;
  refreshToken = null;
  cb && cb();
}

function getLogOutUrl() {
  return `https://${auth0Domain}/v2/logout`;
}

module.exports = {
  getAccessToken,
  getAuthenticationURL,
  getLogOutUrl,
  getProfile,
  loadTokens,
  logout,
  refreshTokens,
  isAuthenticated,
  getIDToken,
  setScopes
};
