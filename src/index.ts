import { app, BrowserWindow, ipcMain } from 'electron';
import { enableLiveReload } from 'electron-compile';

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow: Electron.BrowserWindow | null;

const isDevMode = true;// process.execPath.match(/[\\/]electron/);

if (isDevMode) enableLiveReload();

const createWindow = async () => {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
  });

  // and load the index.html of the app.
  mainWindow.loadURL(`file://${__dirname}/index.html`);

  // Open the DevTools.
  if (isDevMode) {
    mainWindow.webContents.openDevTools();
  }

  // Emitted when the window is closed.
  mainWindow.on('closed', () => {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null;
  });
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.

// ipcMain.on('asynchronous-message', (event, arg) => {
//   mainWindow.webContents.send('console-log', arg) // prints "ping"
//   event.sender.send('asynchronous-reply', 'pong')
// })

// ipcMain.on('synchronous-message', (event, arg) => {
//   mainWindow.webContents.send('console-log', arg) // prints "ping"
//   event.returnValue = 'pong'
// })


let SteamClient = require('steam-client');
let SteamUser = require('steam-user');
let SteamCommunity = require('steamcommunity');
let SteamTotp = require('steam-totp');
let TradeOfferManager = require('steam-tradeoffer-manager');
let fs = require('fs');
let request = require('request');
let winston = require('winston');
let Bottleneck = require("bottleneck");



ipcMain.on('login-steam', (event, args) => {
  console.log(`received login-steam msg wtih args: ${JSON.stringify(args)}`);
  login(args.username, args.password);
});
ipcMain.on('relog-steam', (event, args) => {
  console.log(`received relog-steam msg wtih args: ${JSON.stringify(args)}`);
  relog();
});

function login(username: string, password: string) {
  let logOnOptions = {
    "accountName": username,
    "password": password
  };
  try {
    client.logOn(logOnOptions);    
  } catch (err) {
    mainWindow.webContents.send('vex-alert', `${err.name} ${err.message}`);
  }
}

function relog() {
  mainWindow.webContents.send('console-log', `doing weblogon`);
  client.webLogOn();
}


let is_tradingDemon_started = false;
let tradingDemonTimeout = 5000; //in ms
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
  "cancelTime": 1 * 60 * 1000, //TODO: 5*60*1000
  "pendingCancelTime": 1 * 60 * 1000, //TODO: 10*60*1000
  "pollInterval": 9000
});


//Emitted when an error occurs during logon. Also emitted if we're disconnected and autoRelogin is either disabled, or it's a fatal disconnect.
// If this event isn't handled, the program will crash.
// The SteamUser object's steamID property will still be defined when this is emitted. The Error object will have an eresult parameter which is a value from the EResult enum.
client.on('error', function (err) {
  mainWindow.webContents.send('console-log', `error ${err}`);
  mainWindow.webContents.send('vex-alert', `${err.name} ${err.message}`);
});


//     eresult - A value from the SteamUser.EResult enum
//     msg - A string describing the reason for the disconnect, if available (might be undefined)
// Emitted when we're disconnected from Steam for a non-fatal reason and autoRelogin is enabled. SteamUser will continually retry connection and will either emit loggedOn when logged back on, or error if a fatal logon error is experienced.
// Also emitted in response to a logOff() call.
// The SteamUser object's steamID property will still be defined when this is emitted.
// The eresult value might be 0 (Invalid), which indicates that the disconnection was due to the connection being closed directly, without Steam sending a LoggedOff message.
client.on('disconnected', function (eresult, msg) {
  mainWindow.webContents.send('console-log', `disconnected ${SteamUser.EResult[eresult]} ${msg}`);
  mainWindow.webContents.send('vex-alert', `disconnected ${SteamUser.EResult[eresult]} ${msg}`);
  //TODO: надо релогнуться
});

//TODO: возможно стоит релогать 
manager.on('sessionExpired', err => {
  if (err) {
    console.log(err);
    mainWindow.webContents.send('console-error', `ERROR manager session expired ${err.name} \n ${err.message} \n ${err.stack}`);
  }
  mainWindow.webContents.send('console-log', `Session manager expired need relog...`);
})

community.on('sessionExpired', err => {
  if (err) {
    console.log(err);
    mainWindow.webContents.send('console-error', `ERROR community session expired ${err.name} \n ${err.message} \n ${err.stack}`);
  }
  mainWindow.webContents.send('console-log', `Session community expired need relog...`);
})

//залогинились, но пока не до конца
client.on('loggedOn', function (details, parental) {
  mainWindow.webContents.send('console-log', `loggedOn ${details} ${parental}`)
  botSteamId = "" + client && client.client && client.client.steamID;
  mainWindow.webContents.send('console-log', `steamId ${botSteamId}`);
});

//получили стимгвард, просим ввести код
client.on('steamGuard', function (domain, callback) {
  mainWindow.webContents.send('console-log', `need steamGuard code`);

  mainWindow.webContents.send('need-steamguardcode', '');

  ipcMain.once('need-steamguardcode', (event, code) => {
    if (code == " ") {//TODO: remove autocode
      code = SteamTotp.generateAuthCode("rVQKM57LSiBfwWQPnh+lHvSNoeY=");
    }
    mainWindow.webContents.send('console-log', `received code: ${code}`);
    callback(code);
  });
});

//окончательно залогинились, получили сессию
client.on('webSession', function (sessionID, cookies) {
  mainWindow.webContents.send('console-log', `webSession ${sessionID} ${cookies}`);
  manager.setCookies(cookies, function (err: any) {
    if (err) {
      console.log(err);
      mainWindow.webContents.send('console-error', `ERROR setCookies ${err.name} \n ${err.message} \n ${err.stack}`);
      mainWindow.webContents.send('vex-alert', `${err.name} ${err.message}`);
      return;
    }
    mainWindow.webContents.send('console-log', "Bot API key: " + manager.apiKey);
    if (botSteamId && manager && manager.apiKey) {
      sendApiKey(botSteamId, manager.apiKey);
    } else {
      mainWindow.webContents.send('console-log', `webSession not logged in properly ${botSteamId} ${manager.apiKey}`)
      return;
    }
    //залогинились
    if (!is_tradingDemon_started) {
      is_tradingDemon_started = true;
      tradingDemon();
      appStatusDemon(60 * 1000);
      relogginDemon();
    }
  });
  community.setCookies(cookies);
});

manager.on('sentOfferChanged', function (offer, oldState) {
  mainWindow.webContents.send('console-log', `TradeId ${offer.data('trade_id')} offer #${offer.id} changed: ${TradeOfferManager.ETradeOfferState[oldState]} -> ${TradeOfferManager.ETradeOfferState[offer.state]}`);
  if (offer.state === 2 || offer.state === 9) { //активный трейд - 2 или ждет подтверждения 9
    //это может быть активный трейд с предыдущей сессии
    if (sentTrades.findIndex(trade => trade.trade_id === offer.data('trade_id')) === -1) {
      mainWindow.webContents.send('console-log', `Added ${offer.data('trade_id')} to sentTrades array coz found it in active state`);
      sentTrades.push({
        trade_id: offer.data('trade_id'),
        trade_created_time: Date.now()
      });
    }
    return;
  } else if (offer.state === 3) { //успешный трейд
    reportTradeByOfferAndStatus(offer, 1);
    //TODO:егор должен проверять успешность у себя чтоб не подделывали запросы
  } else { //TODO: проверка всех статусов отмены
    reportTradeByOfferAndStatus(offer, 2);
  }
});

manager.on('unknownOfferSent', function (offer) {
  try {
    mainWindow.webContents.send('console-log', `unknownOfferSent #${offer.id} trade_id ${offer.data('trade_id')} message ${offer.message}`);
    offer.data('error', 'unknownOffer');
    if (!currentTradesInApi) {
      mainWindow.webContents.send('console-log', `unknownOfferSent no trades in currentTradesInApi`);
      return;
    }
    let foundTrade = currentTradesInApi.find(trade => trade.bot_id === botSteamId && offer.message === `Protection Code: ${trade.protection_code}`);
    if (foundTrade) {
      mainWindow.webContents.send('console-log', `Found trade in api for offer #${offer.id}, setting trade_id to ${foundTrade.trade_id}`);
      offer.data('trade_id', foundTrade.trade_id);
    } else {
      mainWindow.webContents.send('console-log', `Can't find offer #${offer.id} in currentTradesInApi`);
    }
  } catch (error) {
    console.log(error);
    mainWindow.webContents.send('console-error', error);
  }
});

manager.on('newOffer', function (offer) {
  try {
    //TODO: проверяем на обманные трейды и отменяем их
    mainWindow.webContents.send('console-log', `got new offer ${JSON.stringify(offer)}`);
  } catch (error) {
    console.log(error);
    mainWindow.webContents.send('console-error', error);
  }
});

let lastRelogTimeInMs = (new Date()).getTime();
let minTimeBetweenRelogsInMs = 1000*60*2;
let relogginDemonTimeoutInMs = 1000*60;
async function relogginDemon(){
  try {
    mainWindow.webContents.send('console-log', `relogginDemon started`);
    let currentTimeInMs = (new Date()).getTime();
    if (!(client && client.client && client.client.loggedOn)){
      mainWindow.webContents.send('console-log', `relogginDemon need relog!`);
      if (currentTimeInMs-lastRelogTimeInMs>minTimeBetweenRelogsInMs){
        mainWindow.webContents.send('console-log', `relogginDemon calling weblogon`);
        client.webLogOn();
      } else {
        mainWindow.webContents.send('console-log', `relogginDemon cant relog coz time ${currentTimeInMs}-${lastRelogTimeInMs}>${minTimeBetweenRelogsInMs}`);
      }
    }
  } catch (error) {
    mainWindow.webContents.send('console-error', `relogginDemon ${error}`);
  } finally {
    setTimeout(relogginDemon.bind(null), relogginDemonTimeoutInMs);
  }
}

async function appStatusDemon(timeout: number) {
  let isCommunityLoggedIn = false;
  try {
    isCommunityLoggedIn = await getIsCommunityLoggedIn(community);
  } catch (error) {
    console.log(error);
    mainWindow.webContents.send('console-error', error)
  }
  try {
    mainWindow.webContents.send('console-log', `reporting appstatus: steamid ${botSteamId} status ${isCommunityLoggedIn ? 1 : 0}`)
    let result = await bets4proReportAppStatus(botSteamId, isCommunityLoggedIn ? 1 : 0);
    mainWindow.webContents.send('console-log', `appStatusDemon result: ${JSON.stringify(result)}`)
  } catch (error) {
    console.log(error);
    mainWindow.webContents.send('console-error', error)
  }
  if (!timeout) {
    timeout = 1 * 60 * 1000;
  }
  setTimeout(() => {
    appStatusDemon(timeout);
  }, timeout);
}

async function tradingDemon() {
  try {
    if (client && client.client && client.client.loggedOn) {
      let trades = await getTrades(botSteamId);
      mainWindow.webContents.send('trades-update', trades);
      mainWindow.webContents.send('console-log', `Got ${trades && trades.length || 0} trades in bets4pro API`);
      if (trades) {
        currentTradesInApi = trades;
        for (let i = 0; i < trades.length; i++) {
          const trade = trades[i];
          // mainWindow.webContents.send('console-log', `${sentTrades.findIndex(sent_trade => sent_trade.trade_id == trade.trade_id)}`)
          // mainWindow.webContents.send('console-log', `${botSteamId} ${trade.seller_data.steamid}`);
          // mainWindow.webContents.send('console-log', `${trade.status}`);
          if (trade.status != 0 ||
            trade.seller_data.steamid != botSteamId ||
            sentTrades.findIndex(sent_trade => sent_trade.trade_id == trade.trade_id) != -1) {
            mainWindow.webContents.send('console-log', `no need to create trade ${JSON.stringify(trade)}`);
            continue;
          }
          if (client && client.client && client.client.loggedOn) {
            let isCommunityLoggedIn = await getIsCommunityLoggedIn(community);
            if (!isCommunityLoggedIn) {
              mainWindow.webContents.send('console-log', `Can't send trades isCommunityLoggedIn: ${isCommunityLoggedIn}`);
              client.client.loggedOn = false;
              setTimeout(tradingDemon.bind(null), 15000);
              return;
            }
          } else {
            mainWindow.webContents.send('console-log', `Can't send trade ${trade.trade_id} steamClient loggedOn ${client && client.client && client.client.loggedOn}`);            
            continue;
          }
          createTradeoffer(trade);
        }
      }
    } else {
      mainWindow.webContents.send('console-log', `trading demon not logged in`);
    }
  } catch (error) {
    console.log(error);
    mainWindow.webContents.send('console-error', `tradingDemon ${error}`)
  } finally {
    setTimeout(tradingDemon.bind(null), tradingDemonTimeout);
  }
}

function createTradeoffer(trade: any) {
  trade.trade_created_time = Date.now();
  sentTrades.push(trade);
  mainWindow.webContents.send('console-log', `Added ${trade.trade_id} to sentTrades array, creating offer`);
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
      console.log(err);
      mainWindow.webContents.send('console-error', `ERROR getting escrow ${err.name} \n ${err.message} \n ${err.stack}`);
      offer.data('error', err.message);
      mainWindow.webContents.send('console-log', sentTrades);
      //TODO: чет я тут непонятное наворотил, он же всегда в массиве отправленых будет
      var index = sentTrades.indexOf(trade);
      if (index > -1) {
        sentTrades.splice(index, 1);
      } else {
        reportTradeByOfferAndStatus(offer, 2);
      }
      mainWindow.webContents.send('console-log', sentTrades);
      return;
    } else {
      if (me.escrowDays !== 0 || them.escrowDays !== 0) {
        mainWindow.webContents.send('console-log', 'escrow here. them:' + them.escrowDays + " me:" + me.escrowDays);
        offer.data('error', `Escrow. Me: ${me.escrowDays} Them: ${them.escrowDays}`);
        reportTradeByOfferAndStatus(offer, 3);
        return;
      } else {
        offer.send(function (err: any, status: any) {
          if (err || !offer) {
            console.log(err);
            mainWindow.webContents.send('console-error', `ERROR sending offer ${err.name} \n ${err.message} \n ${err.stack}`);
            offer.data('error', err.message);
            mainWindow.webContents.send('console-log', `Offer #${offer && offer.id} tradeid ${trade && trade.trade_id} will be reported as unsucceful in 3min`);
            setTimeout(reportTradeByOfferAndStatus.bind(null, offer, 5), 180000); //репортим через 3 минут если этот трейд не отрепортится сам черз поллдату
            //TODO: возможно нужно проверять этот оффер в поллдате
            return;
          } else {
            reportTradeByOfferAndStatus(offer, 0);
            if (status == 'pending') {
              mainWindow.webContents.send('console-log', `now need confirm offer. status: ${status} Offer #${offer.id}`)
              return;
            } else {
              mainWindow.webContents.send('console-log', `Offer #${offer.id} tradeid ${trade.trade_id} sent successfully`);
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
    mainWindow.webContents.send('console-log', `sendApiKey result ${JSON.stringify(result)}`);
  } catch (error) {
    console.log(error);
    mainWindow.webContents.send('console-error', error);
  }
  //report until success
  if (result.indexOf("ok_ok_ok") === -1) {
    setTimeout(sendApiKey.bind(null, steamId, apiKey), 10000);
  } else {
    return result;
  }
}

async function reportTradeByOfferAndStatus(tradeoffer: any, tradeStatus: any) {
  let result = {};
  try {
    let o_tradeoffer_id = 0;
    let o_trade_id = 0;
    let o_tradeoffer_status = 0;
    let o_error = "";
    if (tradeoffer) {
      o_trade_id = tradeoffer.data('trade_id');
      o_tradeoffer_id = tradeoffer.id;
      o_tradeoffer_status = tradeoffer.state;
      o_error = tradeoffer.data('error');
    }
    if (o_trade_id) {
      mainWindow.webContents.send('console-log', `reportTradeByOfferAndStatus trade_id: ${o_trade_id} ; status: ${tradeStatus} ; tradeoffer_id: ${o_tradeoffer_id} ; tradeoffer_status: ${o_tradeoffer_status} ; error: ${o_error}`);
      result = await bets4proReportTrade(o_trade_id, tradeStatus, o_tradeoffer_id, o_tradeoffer_status, o_error);
      mainWindow.webContents.send('console-log', `reportTradeByOfferAndStatus result ${JSON.stringify(result)}`);
    } else {
      mainWindow.webContents.send('console-log', `can't report without trade_id `); //${JSON.stringify(tradeoffer)}
      return;
    }
  } catch (error) {
    console.log(error);
    mainWindow.webContents.send('console-error', error);
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
    let responseFromApi = JSON.parse(await bets4proGetTradesRequest(botSteamId));
    if (responseFromApi) {
      let trades = responseFromApi.response;
      return trades;
    }
  } catch (error) {
    console.log(error);
    mainWindow.webContents.send('console-error', `getTrades ${error}`);
  }
}
function bets4proGetTradesRequest(botSteamId: any) {
  return new Promise(function (resolve, reject) {
    request.post({
      url: "http://api.bets4.pro/api_user_trades.php ",
      form: {
        steamid: botSteamId
      }
    },
      function (error, response, body) {
        if (error) {
          reject(error);
        } else {
          resolve(body);
        }
      });
  });
}

function bets4proSaveApiKey(botSteamId: any, apiKey: any) {
  return new Promise(function (resolve, reject) {
    request.post({
      url: "http://api.bets4.pro/user_trades_apikey_post.php ",
      form: {
        steamid: botSteamId,
        api_key_seller: apiKey
      }
    },
      function (error, response, body) {
        if (error) {
          reject(error);
        } else {
          resolve(body);
        }
      });
  });
}


function bets4proReportTrade(tradeId: any, tradeStatus: any, tradeofferId: any, tradeofferState: any, errorMessage: any) {
  return new Promise(function (resolve, reject) {
    request.post({
      url: "http://api.bets4.pro/user_trades_post.php",
      form: {
        trade_id: tradeId,
        status: tradeStatus,
        tradeoffer_id: tradeofferId,
        tradeoffer_state: tradeofferState,
        error: errorMessage
      }
    },
      function (error, response, body) {
        if (error) {
          reject(error);
        } else {
          resolve(body);
        }
      });
  });
}

function bets4proReportAppStatus(steamid: any, app_status: number) {
  return new Promise(function (resolve, reject) {
    request.post({
      url: "http://api.bets4.pro/api_app_status.php",
      form: {
        steamid: steamid,
        app_status: app_status
      }
    },
      function (error, response, body) {
        if (error) {
          reject(error);
        } else {
          resolve(body);
        }
      });
  });
}

function getIsCommunityLoggedIn(community) {
  return new Promise(function (resolve, reject) {
    community.loggedIn(function (err, loggedIn, familyView) {
      if (err) {
        reject(err);
      } else {
        resolve(loggedIn);
      }
    });
  });
}