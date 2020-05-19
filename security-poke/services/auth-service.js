const jwtDecode = require('jwt-decode');
const axios = require('axios');
const url = require('url');
const envVariables = require('../env-variables');
const keytar = require('keytar');
const os = require('os');
const crypto = require('crypto');
const qs = require('qs');
const parse = require('url-parse');
const cryptoRandomString = require('crypto-random-string');

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
let state = null;

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

function base64URLEncode(str) {
  return str.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}


function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest();
}

function generateRandomChallengePair() {
  const secret = base64URLEncode(crypto.randomBytes(32));
  const hashed = base64URLEncode(sha256(secret));
  return {
    secret,
    hashed
  };
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
      headers: {
        'content-type': 'application/json'
      },
      data: {
        grant_type: 'refresh_token',
        client_id: clientId,
        refresh_token: refreshToken,
      },
    };
    try {
      const {
        data
      } = await axios(refreshOptions)
      accessToken = data.access_token;
      if (data.refresh_token)
        keytar.setPassword(keytarService, keytarAccount, data.refresh_token);
      idToken = data.id_token
      profile = idToken && jwtDecode(idToken);
      data.expires_in && setTimeout(() => {
        refreshTokens()
      }, data.expires_in * 1000);
      resolve();
    } catch (error) {
      await logout();
      return reject(error);
    }
  });
}

async function exchangeCodeForToken(code, verifier, estate) {
  const body = JSON.stringify({
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    code_verifier: verifier,
    client_id: clientId,
    code
  });

  if (state !== estate)
    throw new Error("Invalid state")

  const result = await axios({
    url: `https://${auth0Domain}/oauth/token`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    data: body
  });

  if (result.status === 200 && result.statusText === 'OK') {
    let data = result.data
    accessToken = data.access_token;
    idToken = data.id_token
    profile = idToken && jwtDecode(idToken);
    const refreshToken = data.refresh_token;
    keytar.setPassword(keytarService, keytarAccount, refreshToken);
    return
  }

  throw Error(result.status);
}

function extractCode(resultUrl) {
  const response = parse(resultUrl, true).query;

  if (response.error) {
    throw new Error(response.error_description || response.error);
  }

  return {
    code: response.code,
    state: response.state
  };
}

// Authorization Code Grant by PKCE
function getPKCEURLandSecret(options = {}) {

  const {
    secret,
    hashed
  } = generateRandomChallengePair();

  state = cryptoRandomString({
    length: 10
  });

  Object.assign(options, {
    client_id: clientId,
    code_challenge: hashed,
    code_challenge_method: 'S256',
    response_type: 'code',
    state: state
  });

  const url = `https://${auth0Domain}/authorize?${qs.stringify(options)}`;
  return {
    url,
    secret
  }
  // const resultUrl = win.loadURL(url);;
  // const code = extractCode(resultUrl);
  // return exchangeCodeForToken(code, secret);
}


// Authorization Code Grant example
function loadTokens(callbackURL) {

  return new Promise(async (resolve, reject) => {
    const urlParts = url.parse(callbackURL, true);
    const query = urlParts.query;

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
      const {
        data
      } = await axios(options)
      accessToken = data.access_token;
      idToken = data.id_token
      profile = idToken && jwtDecode(idToken);
      const refreshToken = data.refresh_token;
      keytar.setPassword(keytarService, keytarAccount, refreshToken);
      data.expires_in && setTimeout(() => {
        refreshTokens()
      }, data.expires_in * 1000);


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
  generateRandomChallengePair,
  getPKCEURLandSecret,
  extractCode,
  exchangeCodeForToken
};
