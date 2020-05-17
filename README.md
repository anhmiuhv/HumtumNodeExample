# Creating Electron client using Humtum

## Introduction
Our application is constructed from the concepts and the codes in the article [How to Secure Electron Apps with OpenID Connect and OAuth 2.0](https://auth0.com/blog/securing-electron-applications-with-openid-connect-and-oauth-2/).
The original code is [here](https://github.com/auth0-blog/electron-openid-oauth).

The authentication flow in these examples is upgraded from Authorization Code Flow in the original example to Authorization Code Flow with PKCE

The two exmples in here are

1. Security Poke, which allows users to poke each other to communicate security actions.
2. Sentinel, which allows users to subscribe to an expert for security guideline. This application is a companion app for the Chrome extension at [Sentinel Chrome Extension](https://github.com/anhmiuhv/HumtumChromeExtensionExample/tree/master/sentinel)