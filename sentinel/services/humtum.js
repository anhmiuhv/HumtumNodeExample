// src/humtum/humtum.js

const auth = require('./auth-service');
const axios = require('axios');
WebSocket = require('ws')
const ActionCable = require('humtum-action-cable-react-jwt');

// HumTum lib should be unopinionated so should be decoupled from rest of
// app. (e.g., stores)
class HumTum {
  config = {
    apiUrl: "/",
    cacheExpiry: 10 * 60 * 1000, // 10 minutes. Set to 0 for no caching
    baseUrl: "http://localhost:3000"
  }

  auth;
  user;
  cable;
  userCache = {}; // { id: { model: model, expiration: Date } }
  appCache = {};

  setAuth = (a) => {
    this.auth = a
  }

  getAuth = () => {
    return this.auth
  }

  logout = (cb) => {
    this.user = undefined;
    this.getAuth().logout(cb)
  }

  checkAuth = (authCB, unauthCB) => {
    if (this.getAuth().isAuthenticated()) {
      authCB();
    } else {
      if (unauthCB) {
        unauthCB()
      }
    }
  }

  getCable = () => {
    let generateCableToken = () => {
      const jwt = JSON.stringify({
        id_token: this.getAuth().getIDToken(),
        access_token: this.getAuth().getAccessToken()
      })
      if (typeof Buffer !== 'undefined')
        return Buffer.from(jwt, 'utf8').toString('base64').replace("=", "");
      else
        return window.btoa(jwt).replace(/=/g, "")
    }
    if (this.cable)
      return this.cable
    this.cable = ActionCable.createConsumer(`ws://localhost:3001/cable`, {
      origin: "http://localhost:3000",
      token: generateCableToken()
    })
    return this.cable
  }

  subscribeToChannel = (channelName, onConnected, onDisconnected, onReceived, params) => {
    const init = {
      channel: channelName
    }

    if (params) {
      Object.keys(params).forEach((key) => {
        init[key] = params[key]
      })
    }

    console.log(init)

    this.getCable().subscriptions.create(
      init, {
        connected: onConnected,
        disconnected: onDisconnected,
        received: onReceived
      })
  }

  setBaseUrl = (baseUrl) => {
    this.config['baseUrl'] = baseUrl
  }

  // Not secure right now...
  createRequestHeaders = (multipart = false) => {
    const headers = {
      'UserAuth': `Bearer ${this.getAuth().getIDToken()}`,
      'AccessAuth': `Bearer ${this.getAuth().getAccessToken()}`,
    }
    return multipart ? Object.assign(headers, {
      'Content-Type': 'multipart/form-data'
    }) : headers
  }

  printErr = (e) => {
    console.error(e)
  }

  getSelf = async (err = this.printErr) => {
    if (this.user) return this.user;
    const url = '/users/self'
    this.user = await this.sendRequest(url, err)
    return this.user;
  }

  createMessage = async (message, err = this.printErr) => {
    const url = `/messages`
    // The message requires these parameters
    const {
      description,
      payload,
      targets
    } = message
    const result = await this.sendRequest(url, err, {
      message: {
        description: description,
        payload: payload,
        targets: targets
      }
    }, "POST")
    return result;
  }

  getMessage = async (query, err = this.printErr) => {
    const url = `/messages`
    return await this.sendRequest(url, err, query)
  }

  receiveMessage = async (id, err = this.printErr) => {
    const url = `/messages/${id}/receive`
    const result = await this.sendRequest(url, err, null, "PUT")
    return result;
  }


  updateSelf = async (name, avatar, err = this.printErr) => {
    if (!this.user) {
      try {
        if (this.getAuth().isAuthenticated()) {
          this.user = await this.getSelf();
        } else {
          this.printErr(new Error("Need to authenticate first."))
        }
      } catch (e) {
        this.printErr(e);
      }
    }

    const url = `/users/${this.user.id}`
    const fd = new FormData()
    fd.append('user[name]', name)
    fd.append('user[avatar]', avatar)
    this.user = await this.sendMultipartRequest(url, err, fd, 'put')
    return this.user;
  }


  getModel = async (id, modelURL, cache, err) => {
    if (cache[id] && new Date().getTime() < cache[id].expiration) {
      return cache[id].model
    }

    const url = `/${modelURL}/${id}`
    const model = await this.sendRequest(url, err)

    cache[id] = {
      model: model,
      expiration: new Date().getTime() + this.config.cacheExpiry
    }

    return model
  }

  createNewModel = async (params, modelURL, cache, err = this.printErr) => {
    const url = `/${modelURL}`
    const model = await this.sendRequest(url, err, params, 'post')

    cache[model.id] = {
      model: model,
      expiration: new Date().getTime() + this.config.cacheExpiry
    }

    return model
  }

  getUser = async (id, err = this.printErr) => {
    return await this.getModel(id, "users", this.userCache, err)
  }

  searchUsers = async (query, err = this.printErr) => {
    const url = `/users/search/${query}`
    return await this.sendRequest(url, err)
  }

  searchApps = async (query, authenticated = true, err = this.printErr) => {
    const url = `/apps/${authenticated ? "authenticated_" : ""}search/${query}`
    return await this.sendRequest(url, err)
  }

  getMyApps = async (err = this.printErr) => {
    const url = `/apps`
    return await this.sendRequest(url, err)
  }

  enrollInApp = async (id, err = this.printErr) => {
    const url = `/apps/${id}/enroll`
    return await this.sendRequest(url, err, {}, 'post')
  }

  unenrollFromApp = async (id, err = this.printErr) => {
    const url = `/apps/${id}/unenroll`
    return await this.sendRequest(url, err, {}, 'delete')
  }

  getAppData = async (appID, dataPath, err) => {
    const url = `/apps/${appID}/${dataPath}`
    return await this.sendRequest(url, err)
  }

  searchAppData = async (appID, query, dataPath, err) => {
    const url = `/apps/${appID}/${dataPath}?q=${query}`
    return await this.sendRequest(url, err)
  }

  putRelRequest = async (appID, friendID, type, data, err = this.printErr) => {
    const url = `/relationships/${appID}/${type}/${friendID}`
    console.log(url)
    console.log({
      relationship_request: {
        ...data
      }
    })
    return await this.sendRequest(url, err, {
      relationship_request: {
        ...data
      }
    }, 'put')
  }
  _relRequestResponse = async (appID, friendID, friendOrFollow, response, err = this.printErr) =>
    await this.putRelRequest(appID, friendID, `respond_to_${friendOrFollow}_request`, {
      response: response
    }, err)

  addFriend = async (appID, friendID, err = this.printErr) => await this.putRelRequest(appID, friendID, "add_friend", {}, err)
  unfriend = async (appID, friendID, err = this.printErr) => await this.putRelRequest(appID, friendID, "unfriend", {}, err)
  approveFriendRequest = async (appID, friendID, err = this.printErr) => await this._relRequestResponse(appID, friendID, "friend", "approve", err)
  rejectFriendRequest = async (appID, friendID, err = this.printErr) => await this._relRequestResponse(appID, friendID, "friend", "reject", err)

  followOther = async (appID, friendID, err = this.printErr) => await this.putRelRequest(appID, friendID, "follow", {}, err)
  unfollow = async (appID, friendID, err = this.printErr) => await this.putRelRequest(appID, friendID, "unfollow", {}, err)
  approveFollowRequest = async (appID, followID, err = this.printErr) => await this._relRequestResponse(appID, followID, "follow", "approve", err)
  rejectFollowRequest = async (appID, followID, err = this.printErr) => await this._relRequestResponse(appID, followID, "follow", "reject", err)

  getFriends = async (appID, err = this.printErr) => await this.getAppData(appID, "friends", err)
  getFriendRequests = async (appID, err = this.printErr) => await this.getAppData(appID, "friend_requests", err)
  getFollowers = async (appID, err = this.printErr) => await this.getAppData(appID, "followers", err)
  getFollowing = async (appID, err = this.printErr) => await this.getAppData(appID, "following", err)
  getFollowerRequests = async (appID, err = this.printErr) => await this.getAppData(appID, "follower_requests", err)
  getFollowingRequests = async (appID, err = this.printErr) => await this.getAppData(appID, "following_requests", err)
  getDevelopers = async (appID, err = this.printErr) => await this.getAppData(appID, "developers", err)
  getUsers = async (appID, err = this.printErr) => await this.getAppData(appID, "users", err)
  searchUsersInApp = async (appID, query, err = this.printErr) => await this.searchAppData(appID, query, "user_search", err)

  getAppUser = async (appID, uid, err = this.printErr) => {
    const url = `/apps/${appID}/user/${uid}`
    return await this.sendRequest(url, err)
  }


  sendRequest = async (url, err, data = {}, method = 'get') => {
    if (this.getAuth().getIDToken() && this.getAuth().getAccessToken()) {
      const headers = this.createRequestHeaders()
      try {
        const response = await axios({
          method: method,
          url: `${this.config['baseUrl']}${url}`,
          data: data,
          headers: headers
        })
        return response.data
      } catch (e) {
        err(e.response)
      }
    } else {
      err(new Error("Please configure your HumTum application credentials first."))
    }
    return null;
  }

  sendMultipartRequest = async (url, err, formData, method = 'post') => {
    if (this.getAuth().getIDToken() && this.getAuth().getAccessToken()) {
      const config = {
        headers: this.createRequestHeaders(true)
      }
      try {
        const response = (method === 'post' ? await axios.post(`${this.config['baseUrl']}${url}`, formData, config) : await axios.put(`${this.config['baseUrl']}${url}`, formData, config))
        return response.data
      } catch (e) {
        err(e.response)
      }
    } else {
      err(new Error("Please configure your HumTum application credentials first."))
    }
    return null;
  }
}

const singleton = new HumTum();
singleton.setAuth(auth)

module.exports = singleton
