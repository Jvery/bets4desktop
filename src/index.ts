import { app, BrowserWindow, ipcMain } from 'electron';
import { enableLiveReload } from 'electron-compile';
import { JsonPipe } from '@angular/common';
var path = require('path');
const notifier = require('node-notifier');
if (require('electron-squirrel-startup')) app.quit()
// if first time install on windows, do not run application, rather
// let squirrel installer do its work
const setupEvents = require('./setup-events.ts');
if (setupEvents.handleSquirrelEvent()) {
  process.exit()
}
const fkill = require('fkill');
const log = require('electron-log');
// Write to this file, must be set before first logging
log.transports.file.level = 'debug';
log.transports.rendererConsole.level = 'debug';
log.transports.file.maxSize = 10 * 1024 * 1024;
require('update-electron-app')({
  repo: 'Jvery/bets4desktop',
  logger: log
})
// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow: Electron.BrowserWindow | null;

const isDevMode = process.execPath.match(/[\\/]electron/);

if (isDevMode) enableLiveReload();

const createWindow = async () => {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    minWidth: 650,
    minHeight: 550
  });

  // and load the index.html of the app.
  mainWindow.loadURL(`file://${__dirname}/index.html`);
  mainWindow.webContents.on('did-finish-load', () => {
    if (mainWindow) {
      mainWindow.setTitle(`${app.getName()} v${app.getVersion()}`);
    }
  });
  // Open the DevTools.
  if (isDevMode) {
    mainWindow.webContents.openDevTools();
  }
  log.info(app.getVersion());
  // Emitted when the window is closed.
  mainWindow.on('closed', () => {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    log.info(`removing listeners, closing main window ${mainWindow}`);
    if (mainWindow) {
      mainWindow.removeAllListeners('close');
    }
    mainWindow = null;
  });
};
// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

// Quit when all windows are closed.
app.on('window-all-closed', async () => {
  stopApp();
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    createWindow();
  }
});



const stopApp = async () => {
  try {
    log.info(`stopping app ${botSteamId}`);
    if (botSteamId) {
      let result = await bets4proReportAppStatus(botSteamId, 2);
      log.info(`appstatus closing report 2 ${result}`);
    }
    isClosingApp = true;
    manager.shutdown();
    log.info(`manager shutdown`);
  } catch (error) {
    log.error(`closing ${error}`);
  }
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
  //windows
  fkill(`bets4desktop`, true, true, true);
}

//0 not logged in, 1 selling, -1 not selling
let appState = 0;
async function updateAppState(state: number) {
  log.info(`updateAppState  ${appState} -> ${state}`)
  appState = state;
  if (mainWindow) {
    mainWindow.webContents.send('appState-update', state);
  }
  if (appState == -1) {
    let result = await bets4proReportAppStatus(botSteamId, 2);
    log.info(`appstatus updateAppState report 2 ${result}`);
  } else {
    appStatusDemon(0);
  }
}
// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.

let isClosingApp = false;
let SteamClient = require('steam-client');
let SteamUser = require('steam-user');
let SteamCommunity = require('steamcommunity');
let SteamTotp = require('steam-totp');
let TradeOfferManager = require('steam-tradeoffer-manager');
let request = require('request');



ipcMain.on('login-steam', (event: any, args: any) => {
  log.info(`received login-steam msg wtih args: ${JSON.stringify(args)}`);
  login(args.username, args.password);
});
ipcMain.on('relog-steam', (event: any, args: any) => {
  log.info(`received relog-steam msg wtih args: ${JSON.stringify(args)}`);
  relog();
});
ipcMain.on('setAppState', (event: any, args: any) => {
  log.info(`received setAppState msg wtih args: ${JSON.stringify(args)}`);
  updateAppState(args);
});
ipcMain.on('enableNotificationsChanged', (event: any, args: any) => {
  log.info(`received enableNotificationsChanged msg wtih args: ${JSON.stringify(args)}`);
  enableNotifications = args;
});
function login(username: string, password: string) {
  let logOnOptions = {
    "accountName": username,
    "password": password
  };
  try {
    client.logOn(logOnOptions);
  } catch (err) {
    if (mainWindow) {
      mainWindow.webContents.send('isLogginIn', false);
      mainWindow.webContents.send('vex-alert', `${err.name}: ${err.message}`);
    }
  }
}

function relog() {
  log.info(`doing weblogon`);
  client.webLogOn();
}

let enableNotifications = true;
let isRelogNeededByCommunity = false;
let is_tradingDemon_started = false;
let tradingDemonTimeout = 5000; //in ms
let appstatusDemonTimeout = 1 * 60 * 1000; //in ms
let minTimeBetweenRelogsInMs = 1000 * 60 * 2; //in ms
let relogginDemonTimeoutInMs = 1000 * 60; //in ms
let minNumberOfUncessfullRelogsToStopSelling = 3;
let botSteamId = "";
let sentTrades: any[] = [];
let currentTradesInApi: any;
let steamClient = new SteamClient.CMClient();
let community = new SteamCommunity();
let client = new SteamUser(steamClient, { promptSteamGuardCode: false });

let manager = new TradeOfferManager({
  "steam": client,
  "community": community,
  "language": "en", // We want English item descriptions
  "cancelTime": 5 * 60 * 1000,
  "pendingCancelTime": 10 * 60 * 1000,
  "pollInterval": 9000
});


//Emitted when an error occurs during logon. Also emitted if we're disconnected and autoRelogin is either disabled, or it's a fatal disconnect.
// If this event isn't handled, the program will crash.
// The SteamUser object's steamID property will still be defined when this is emitted. The Error object will have an eresult parameter which is a value from the EResult enum.
client.on('error', function (err: any) {
  log.error(`error onerror ${err}`);
  if (mainWindow) {
    mainWindow.webContents.send('isLogginIn', false);
    mainWindow.webContents.send('vex-alert', `${err.name}: ${err.message}`);
  }
});


//     eresult - A value from the SteamUser.EResult enum
//     msg - A string describing the reason for the disconnect, if available (might be undefined)
// Emitted when we're disconnected from Steam for a non-fatal reason and autoRelogin is enabled. SteamUser will continually retry connection and will either emit loggedOn when logged back on, or error if a fatal logon error is experienced.
// Also emitted in response to a logOff() call.
// The SteamUser object's steamID property will still be defined when this is emitted.
// The eresult value might be 0 (Invalid), which indicates that the disconnection was due to the connection being closed directly, without Steam sending a LoggedOff message.
client.on('disconnected', function (eresult: any, msg: any) {
  log.info(`client disconnected ${SteamUser.EResult[eresult]} ${msg}`);
  // if (mainWindow) {
  //   mainWindow.webContents.send('vex-alert', `disconnected ${SteamUser.EResult[eresult]} ${msg}`);
  // }
  relogginDemon(0);
});

manager.on('sessionExpired', (err: any) => {
  if (err) {
    log.error(`ERROR manager session expired ${err.name} \n ${err.message} \n ${err.stack}`);
  }
  log.info(`Session manager expired need relog...`);
  relogginDemon(0);
})

community.on('sessionExpired', (err: any) => {
  if (err) {
    log.error(`ERROR community session expired ${err.name} \n ${err.message} \n ${err.stack}`);
  }
  log.info(`Session community expired need relog...`);
  relogginDemon(0);
})

client.on('loggedOn', function (details: any, parental: any) {
  log.info(`loggedOn ${details} ${parental}`)
  botSteamId = "" + client && client.client && client.client.steamID;
  log.info(`steamId ${botSteamId}`);
});

//need code
client.on('steamGuard', function (domain: any, callback: any) {
  log.info(`need steamGuard code`);
  if (mainWindow) {
    mainWindow.webContents.send('need-steamguardcode', '');
  }
  ipcMain.once('need-steamguardcode', (event: any, code: any) => {
    log.info(`received code: ${code}`);
    callback(code);
  });
});

//finally logged on, received webSession
client.on('webSession', function (sessionID: any, cookies: any) {
  try {
    log.info(`webSession ${sessionID} ${cookies}`);
    manager.setCookies(cookies, async function (err: any) {
      try {
        if (err) {
          log.info(err);
          log.error(`ERROR setCookies ${err.name} \n ${err.message} \n ${err.stack}`);
          if (mainWindow) {
            mainWindow.webContents.send('isLogginIn', false);
            if (err.message==`Access Denied`){
              err.message+=`. Please make sure that you deposited at least $5 on your Steam account and don't have ban.`
            }
            mainWindow.webContents.send('vex-alert', `${err.name}: ${err.message}`);
          }
          return;
        }
        log.info("Bot API key: " + manager.apiKey);
        if (botSteamId && manager && manager.apiKey) {
          sendApiKey(botSteamId, manager.apiKey);
        } else {
          log.info(`webSession not logged in properly ${botSteamId} ${manager.apiKey}`)
          return;
        }
        if (!is_tradingDemon_started) {
          is_tradingDemon_started = true;
          let trades = await getTrades(botSteamId);
          currentTradesInApi = trades;
          if (mainWindow) {
            updateAppState(1);
            mainWindow.webContents.send('isLogginIn', false);
          }
          tradingDemon();
          appStatusDemon(appstatusDemonTimeout);
          relogginDemon(relogginDemonTimeoutInMs);
        }
      } catch (error) {
        log.error(`manager.setCookies ${error}`);
      }
    });
    community.setCookies(cookies);//no need to set cookies here    
  } catch (error) {
    log.error(`client on webSession ${error}`);
  }
});


manager.on('sentOfferChanged', function (offer: any, oldState: any) {
  try {
    log.info(`TradeId ${offer.data('trade_id')} offer #${offer.id} changed: ${TradeOfferManager.ETradeOfferState[oldState]} -> ${TradeOfferManager.ETradeOfferState[offer.state]}`);
    if (offer.state === 2 || offer.state === 9) { //active - 2 или need confirm 9
      //in case it's from previous session
      if (sentTrades.findIndex(trade => trade.trade_id === offer.data('trade_id')) === -1) {
        log.info(`Added ${offer.data('trade_id')} to sentTrades array coz found it in active state`);
        sentTrades.push({
          trade_id: offer.data('trade_id'),
          trade_created_time: Date.now()
        });
      }
      return;
    } else if (offer.state === 3) { //successful trade
      reportTradeByOfferAndStatus(offer, 1);
    } else { //all other are canceled trades
      if (mainWindow && offer.state === 6) {
        log.info(`offer ${offer.data('trade_id')} was canceled disabling trading`);
        updateAppState(-1);
        mainWindow.webContents.send('vex-alert', `Trading was disalbed because you have missed trade. Click ► button in Trades tab to enable`);
        notifier.notify({
          title: 'Attention',
          message: `Trading was disalbed because you have missed trade`,
          icon: path.join(__dirname, '/img/logo300x300.png'),
          sound: true
        });
      }
      reportTradeByOfferAndStatus(offer, 2);
    }
  } catch (error) {
    log.error(`sentOfferChanged ${error}`);
  }
});

manager.on('unknownOfferSent', function (offer: any) {
  try {
    if (offer.message.indexOf(`Protection Code:`) == -1) {
      return;
    }
    log.info(`unknownOfferSent #${offer.id} trade_id ${offer.data('trade_id')} message ${offer.message}`);
    //log.info(`${JSON.stringify(offer)}`);
    offer.data('error', 'unknownOffer');
    // if (!currentTradesInApi) {
    //   log.info(`unknownOfferSent no trades in currentTradesInApi`);
    //   return;
    // }
    let foundTrade = currentTradesInApi && currentTradesInApi.find((trade: any) => trade.bot_id === botSteamId && offer.message === `Protection Code: ${trade.protection_code}`);
    if (foundTrade) {
      log.info(`Found trade in api for offer #${offer.id}, setting trade_id to ${foundTrade.trade_id}`);
      offer.data('trade_id', foundTrade.trade_id);
    } else {
      log.info(`Can't find offer with message ${offer.message} in currentTradesInApi reporting by prot code`);
      reportTradeByOfferAndStatus(offer, -1);
    }
  } catch (error) {
    log.error(error);
  }
});

manager.on('newOffer', function (offer: any) {
  try {
    log.info(`got new offer ${offer.message}`);
    if (sentTrades.findIndex(sent_trade => `Protection Code: ${sent_trade.protection_code}` === offer.message) != -1) {
      //fake trade, canceling
      log.info(`fake offer ${offer.id} ${offer.message} canceling`);
      offer.cancel((err: any) => {
        log.info(`offer cancel ${offer.id} ${offer.message} error: ${err}`)
      });
      if (mainWindow) {
        mainWindow.webContents.send('vex-alert', `Your API key was compromised, please change it and never let untrusted 3rd party get it again!`);
      }
    }
  } catch (error) {
    log.info(`newOffer ${offer.id}  ${offer.message} error: ${error}`)
  }
});

let lastRelogTimeInMs = (new Date()).getTime();
let NumberOfUnccessfulRelogs = 0;
async function relogginDemon(timeout: number) {
  if (isClosingApp) {
    log.info(`relogginDemon stopped coz closing`);
    return;
  }
  try {
    if (appState == -1) {
      throw `can't relog with appState ${appState}`;
    }
    log.info(`relogginDemon started`);
    let currentTimeInMs = (new Date()).getTime();
    if (!(client && client.client && client.client.loggedOn) || isRelogNeededByCommunity) {
      log.info(`relogginDemon need relog!`);
      if (currentTimeInMs - lastRelogTimeInMs > minTimeBetweenRelogsInMs) {
        NumberOfUnccessfulRelogs++;
        //sending request to receive error and relog
        community.getWebApiKey('', (err: any, key: any) => {
          try {
            log.info(`getWebApiKey from trading demon result ${err} , ${key}`);
            log.info(`relogginDemon calling weblogon`);
            isRelogNeededByCommunity = false;
            //node-steam-user Being connected is the same thing as being logged on (not the same as being logged onto the web, but if your client session drops then so does your web session). If you're not connected, the steamID property will be null.
            if (client.steamID) {
              client.webLogOn();
            } else {
              log.error(`relogginDemon can't relog client.steamID ${client.steamID}`);
              if (mainWindow) {
                updateAppState(0);
                mainWindow.webContents.send('vex-alert', `Need manual relog to continue selling`);
              }
            }
          } catch (error) {
            log.error(`relogginDemon ${error}`);
          }
        });
      } else {
        log.info(`relogginDemon cant relog coz time ${currentTimeInMs}-${lastRelogTimeInMs}>${minTimeBetweenRelogsInMs}`);
      }
    } else {
      NumberOfUnccessfulRelogs = 0;
      if (mainWindow) {
        updateAppState(1);
      }
    }
  } catch (error) {
    log.error(`relogginDemon ${error}`);
  } finally {
    if (NumberOfUnccessfulRelogs >= minNumberOfUncessfullRelogsToStopSelling) {
      if (mainWindow) {
        updateAppState(-1);
        mainWindow.webContents.send('vex-alert', `Can't relog. Please restart app`); 
      }
    }
    if (timeout) {
      setTimeout(relogginDemon.bind(null), timeout);
    }
  }
}

async function appStatusDemon(timeout: number) {
  if (isClosingApp) {
    log.info(`appStatusDemon stopped coz closing`);
    return;
  }
  let isCommunityLoggedIn = false;
  let isClientLoggedIn = client && client.client && client.client.loggedOn;
  try {
    isCommunityLoggedIn = await getIsCommunityLoggedIn(community);
    if (!isCommunityLoggedIn) {
      isRelogNeededByCommunity = true;
      relogginDemon(0);
    } else {
      isRelogNeededByCommunity = false;
    }
  } catch (error) {
    log.error(`appStatusDemon error ${error}`)
  }
  try {
    log.info(`reporting appstatus: steamid ${botSteamId} isClientLoggedIn ${isClientLoggedIn} isCommunityLoggedIn ${isCommunityLoggedIn} appState ${appState} status ${isCommunityLoggedIn && isClientLoggedIn && appState == 1 ? 1 : 0}`)
    let result = await bets4proReportAppStatus(botSteamId, isCommunityLoggedIn && isClientLoggedIn && appState == 1 ? 1 : 0);
    log.info(`appStatusDemon result: ${JSON.stringify(result)}`)
  } catch (error) {
    log.error(error)
  }
  if (timeout) {
    log.info(`appStatusDemon timeout ${timeout}`);
    setTimeout(() => {
      appStatusDemon(timeout);
    }, timeout);
  }
}

async function tradingDemon() {
  if (isClosingApp) {
    log.info(`tradingDemon stopped coz closing`);
    return;
  }
  try {
    let trades = await getTrades(botSteamId);
    if (mainWindow) {
      mainWindow.webContents.send('trades-update', trades);
    }
    if (client && client.client && client.client.loggedOn && appState == 1) {
      if (trades && trades.length) {
        log.info(`Got ${trades && trades.length || 0} trades in bets4pro API`);
      }
      if (trades) {
        currentTradesInApi = trades;
        for (let i = 0; i < trades.length; i++) {
          const trade = trades[i];
          // log.info( `${sentTrades.findIndex(sent_trade => sent_trade.trade_id == trade.trade_id)}`)
          // log.info( `${botSteamId} ${trade.seller_data.steamid}`);
          // log.info( `${trade.status}`);
          if (trade.status != 0 ||
            trade.seller_data.steamid != botSteamId ||
            sentTrades.findIndex(sent_trade => sent_trade.trade_id == trade.trade_id) != -1) {
            log.info(`no need to create trade ${trade.id}`);
            continue;
          }
          if (client && client.client && client.client.loggedOn) {
            let isCommunityLoggedIn = await getIsCommunityLoggedIn(community);
            if (!isCommunityLoggedIn) {
              log.info(`Can't send trades isCommunityLoggedIn: ${isCommunityLoggedIn}`);
              isRelogNeededByCommunity = true;
              relogginDemon(0);
              return;
            } else {
              isRelogNeededByCommunity = false;
            }
          } else {
            log.info(`Can't send trade ${trade.trade_id} steamClient loggedOn ${client && client.client && client.client.loggedOn}`);
            relogginDemon(0);
            continue;
          }
          createTradeoffer(trade);
        }
      }
    } else {
      log.info(`trading demon login status ${client && client.client && client.client.loggedOn} appstate ${appState}`);
    }
  } catch (error) {
    log.error(`tradingDemon ${error}`)
  } finally {
    setTimeout(tradingDemon.bind(null), tradingDemonTimeout);
  }
}

function createTradeoffer(trade: any) {
  trade.trade_created_time = Date.now();
  sentTrades.push(trade);
  log.info(`Added ${trade.trade_id} to sentTrades array, creating offer`);
  let offer = manager.createOffer(new TradeOfferManager.SteamID(trade.buyer_data.steamid), trade.buyer_data.trade_url);
  offer.data('trade_id', trade.trade_id);
  offer.setMessage('Protection Code: ' + trade.protection_code);
  for (let i = 0; i < trade.items_data.length; i++) {
    const item = trade.items_data[i];
    offer.addMyItem({
      assetid: item.assetid,
      appid: item.appid,
      contextid: item.contextid
    });
  }
  offer.getUserDetails(function (err: any, me: any, them: any) {
    if (err) {
      log.error(`ERROR getting escrow ${err.name} \n ${err.message} \n ${err.stack}`);
      offer.data('error', err.message);
      //log.info(sentTrades);
      reportTradeByOfferAndStatus(offer, 2);
      return;
    } else {
      if (me.escrowDays !== 0 || them.escrowDays !== 0) {
        log.info('escrow here. them:' + them.escrowDays + " me:" + me.escrowDays);
        offer.data('error', `Escrow. Me: ${me.escrowDays} Them: ${them.escrowDays}`);
        reportTradeByOfferAndStatus(offer, 3);
        return;
      } else {
        offer.send(function (err: any, status: any) {
          if (err || !offer) {
            log.info(err);
            log.error(`ERROR sending offer ${err.name} \n ${err.message} \n ${err.stack}`);
            offer.data('error', err.message);
            log.info(`Offer #${offer && offer.id} tradeid ${trade && trade.trade_id} will be reported as unsucceful in 3min`);
            setTimeout(reportTradeByOfferAndStatus.bind(null, offer, 5), 180000); //reporting it with error in 3 mins
            return;
          } else {
            reportTradeByOfferAndStatus(offer, 0);
            if (enableNotifications) {
              notifier.notify({
                title: 'New Trade',
                message: `Please accept this trade in Steam mobile app.\nBuyer name: ${trade.buyer_data.name}\nProtection Code: ${trade.protection_code}`,
                icon: path.join(__dirname, '/img/logo300x300.png'),
                sound: true
              });
            }
            if (status == 'pending') {
              log.info(`now need confirm offer. status: ${status} Offer #${offer.id}`);
              return;
            } else {
              log.info(`Offer #${offer.id} tradeid ${trade.trade_id} sent successfully`);
              return;
            }
          }
        });
      }
    }
  })
}

async function sendApiKey(steamId: any, apiKey: any) {
  let result = '';
  try {
    result = await bets4proSaveApiKey(steamId, apiKey);
    log.info(`sendApiKey result ${JSON.stringify(result)}`);
  } catch (error) {
    log.error(`sendApiKey ${error}`);
  }
  //report until success
  if (result.indexOf("ok_ok_ok") === -1) {
    setTimeout(sendApiKey.bind(null, steamId, apiKey), 10000);
  } else {
    return result;
  }
}

// 1 	Invalid
// 2 	This trade offer has been sent, neither party has acted on it yet.
// 3 	The trade offer was accepted by the recipient and items were exchanged.
// 4 	The recipient made a counter offer
// 5 	The trade offer was not accepted before the expiration date
// 6 	The sender cancelled the offer
// 7 	The recipient declined the offer
// 8 	Some of the items in the offer are no longer available (indicated by the missing flag in the output)
// 9 	The offer hasn't been sent yet and is awaiting email/mobile confirmation. The offer is only visible to the sender.
// 10 	Either party canceled the offer via email/mobile. The offer is visible to both parties, even if the sender canceled it before it was sent.
// 11 	The trade has been placed on hold. The items involved in the trade have all been removed from both parties' inventories and will be automatically delivered in the future. 
async function reportTradeByOfferAndStatus(tradeoffer: any, tradeStatus: any) {
  let result = '';
  try {
    let o_tradeoffer_id = 0;
    let o_trade_id = 0;
    let o_tradeoffer_status = 0;
    let o_error = "";
    let o_protectionCode = "";
    if (tradeoffer) {
      let tradeStatusByOffer = 0;
      switch (tradeoffer.state) {
        case 2:
          tradeStatusByOffer = 0;
          break;
        case 3:
          tradeStatusByOffer = 1;
          break;
        case 9:
          tradeStatusByOffer = 0;
          break;
        default:
          tradeStatusByOffer = 2;
      }
      if (tradeStatus != tradeStatusByOffer && tradeStatus != 3) {
        log.info(`reportTradeByOfferAndStatus wrong tradeStatus ${tradeStatus} -> ${tradeStatusByOffer}`);
        tradeStatus = tradeStatusByOffer;
      }
      if (tradeoffer.data('trade_id')) {
        o_trade_id = tradeoffer.data('trade_id');
      }
      o_tradeoffer_id = tradeoffer.id;
      o_tradeoffer_status = tradeoffer.state;
      o_error = tradeoffer.data('error');
      o_protectionCode = tradeoffer.message.replace('Protection Code: ', '');
    }
    if (o_trade_id || o_protectionCode) {
      log.info(`reportTradeByOfferAndStatus trade_id: ${o_trade_id} ; status: ${tradeStatus} ; tradeoffer_id: ${o_tradeoffer_id} ; tradeoffer_status: ${o_tradeoffer_status} ; error: ${o_error} ; code: ${o_protectionCode}`);
      result = await bets4proReportTrade(o_trade_id, tradeStatus, o_tradeoffer_id, o_tradeoffer_status, o_error, o_protectionCode);
      log.info(`reportTradeByOfferAndStatus result ${JSON.stringify(result)}`);
    }
    else {
      log.info(`can't report without trade_id and protection code`);
      return;
    }
  } catch (error) {
    log.error(`reportTradeByOfferAndStatus ${error}`);
  }
  //report until success
  if (result.indexOf("ok_ok_ok") === -1) {
    setTimeout(reportTradeByOfferAndStatus.bind(null, tradeoffer, tradeStatus), 10000);
  } else {
    return result;
  }
}

async function getTrades(botSteamId: any) {
  try {
    if (!botSteamId) {
      throw `no botSteamId ${botSteamId}`;
    }
    let responseFromApi = JSON.parse(await bets4proGetTradesRequest(botSteamId));
    if (responseFromApi) {
      let trades = responseFromApi.response;
      return trades;
    }
  } catch (error) {
    log.error(`getTrades ${error}`);
  }
}
function bets4proGetTradesRequest(botSteamId: any): Promise<string> {
  return new Promise(function (resolve, reject) {
    request.post({
      url: "http://api.bets4.pro/api_user_trades.php ",
      form: {
        steamid: botSteamId
      }
    },
      function (error: any, response: any, body: any) {
        if (error) {
          reject(error);
        } else {
          resolve(body);
        }
      });
  });
}

function bets4proSaveApiKey(botSteamId: any, apiKey: any): Promise<string> {
  return new Promise(function (resolve, reject) {
    request.post({
      url: "http://api.bets4.pro/user_trades_apikey_post.php ",
      form: {
        steamid: botSteamId,
        api_key_seller: apiKey
      }
    },
      function (error: any, response: any, body: any) {
        if (error) {
          reject(error);
        } else {
          resolve(body);
        }
      });
  });
}


function bets4proReportTrade(tradeId: any, tradeStatus: any, tradeofferId: any, tradeofferState: any, errorMessage: any, protectionCode: any): Promise<string> {
  return new Promise(function (resolve, reject) {
    let data = {
      trade_id: tradeId,
      status: tradeStatus,
      tradeoffer_id: tradeofferId,
      tradeoffer_state: tradeofferState,
      error: errorMessage,
      protection_code: protectionCode
    }
    request.post({
      url: "http://api.bets4.pro/user_trades_post.php",
      form: data
    },
      function (error: any, response: any, body: any) {
        if (error) {
          reject(error);
        } else {
          resolve(body);
        }
      });
  });
}

// 1 - on
// 0 - delayed off
// 2 - instant off
function bets4proReportAppStatus(steamid: any, app_status: number) {
  return new Promise(function (resolve, reject) {
    request.post({
      url: "http://api.bets4.pro/api_app_status.php",
      form: {
        steamid: steamid,
        app_status: app_status
      }
    },
      function (error: any, response: any, body: any) {
        if (error) {
          reject(error);
        } else {
          resolve(body);
        }
      });
  });
}

function getIsCommunityLoggedIn(community: any): Promise<boolean> {
  return new Promise(function (resolve, reject) {
    community.loggedIn(function (err: any, loggedIn: any, familyView: any) {
      if (err) {
        reject(err);
      } else {
        resolve(loggedIn);
      }
    });
  });
}