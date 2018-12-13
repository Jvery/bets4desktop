import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { __await } from 'tslib';
let SteamClient = require('steam-client');
let SteamUser = require('steam-user');
let SteamCommunity = require('steamcommunity');
let SteamTotp = require('steam-totp');
let TradeOfferManager = require('steam-tradeoffer-manager')
let fs = require('fs');
let request = require('request');
let winston = require('winston');
let Bottleneck = require("bottleneck");
var vex = require('vex-js')
vex.registerPlugin(require('vex-dialog'))
vex.defaultOptions.className = 'vex-theme-os'

@Component({
  selector: 'App',
  template:
    `<div>
    <h2>Welcome to {{name}} beatch!</h2>
    <input [(ngModel)]="username" (keyup.enter)="login()">
    <input [(ngModel)]="password" type="password" (keyup.enter)="login()">
    <button (click)="login()">login</button>
  </div>`
})
export class AppComponent implements OnInit {
  public readonly name = 'bets4pro desktop app';
  public username = '';
  public password = '';
  ngOnInit(): void {
    console.log('component initialized');
  }

  login() {
    let is_tradingDemon_started = false;
    let tradingTimeout = 50000; //in ms
    let botSteamId = "";
    let sentTrades: any[] = [];
    let currentTradesInApi: any;
    let steamClient = new SteamClient.CMClient();
    let community = new SteamCommunity({});
    let client = new SteamUser({
      steamClient,
      promptSteamGuardCode: false
    });

    let manager = new TradeOfferManager({
      "steam": client,
      "community": community,
      "language": "en", // We want English item descriptions
      "cancelTime": 5*60*1000,
      "pendingCancelTime": 10*60*1000,
      "pollInterval": 9000
    });
    let logOnOptions = {
      "accountName": this.username,
      "password": this.password
    };
    client.logOn(logOnOptions);

    //Emitted when an error occurs during logon. Also emitted if we're disconnected and autoRelogin is either disabled, or it's a fatal disconnect.
    // If this event isn't handled, the program will crash.
    // The SteamUser object's steamID property will still be defined when this is emitted. The Error object will have an eresult parameter which is a value from the EResult enum.
    client.on('error', function (err) {
      console.log(`error ${err}`);
      vex.dialog.alert(`${err}`);
    });


    //     eresult - A value from the SteamUser.EResult enum
    //     msg - A string describing the reason for the disconnect, if available (might be undefined)
    // Emitted when we're disconnected from Steam for a non-fatal reason and autoRelogin is enabled. SteamUser will continually retry connection and will either emit loggedOn when logged back on, or error if a fatal logon error is experienced.
    // Also emitted in response to a logOff() call.
    // The SteamUser object's steamID property will still be defined when this is emitted.
    // The eresult value might be 0 (Invalid), which indicates that the disconnection was due to the connection being closed directly, without Steam sending a LoggedOff message.
    client.on('disconnected', function (eresult, msg) {
      console.log(`disconnected ${eresult} ${msg}`);
      vex.dialog.alert(`disconnected ${msg}`);
      //TODO: надо релогнуться
    });
    
    //TODO: возможно стоит релогать 
    manager.on('sessionExpired', err => {
      if (err) {
        console.error(`ERROR manager session expired ${err.name} \n ${err.message} \n ${err.stack}`);
      }
      console.log(`Session manager expired need relog...`);
    })

    community.on('sessionExpired', err => {
      if (err) {
        console.error(`ERROR community session expired ${err.name} \n ${err.message} \n ${err.stack}`);
      }
      console.log(`Session community expired need relog...`);
    })

    //залогинились, но пока не до конца
    client.on('loggedOn', function (details, parental) {
      console.log(`loggedOn ${details} ${parental}`)
      botSteamId = "" + client && client.client && client.client.steamID;
      console.log(`steamId ${botSteamId}`);
    });

    //получили стимгвард, просим ввести код
    client.on('steamGuard', function (domain, callback) {
      console.log(`steamGuard ${domain} ${callback}`);
      vex.dialog.open({
        message: 'Enter Steam Guard code:',
        input: [
          '<input name="code" type="text" placeholder="code" required />'
        ].join(''),
        buttons: [
          $.extend({}, vex.dialog.buttons.YES, { text: 'Login' }),
          $.extend({}, vex.dialog.buttons.NO, { text: 'Back' })
        ],
        callback: function (data: any) {
          if (!data) {
            console.log('Cancelled')
          } else {
            console.log('Code: ', data.code)
            callback(data.code);
          }
        }
      })
    });

    //окончательно залогинились, получили сессию
    client.on('webSession', function (sessionID, cookies) {
      console.log(`webSession ${sessionID} ${cookies}`);
      manager.setCookies(cookies, function (err: any) {
        if (err) {
          console.error(`ERROR setCookies ${err.name} \n ${err.message} \n ${err.stack}`);
          vex.dialog.alert(` ${err.name} ${err.message}`);
          return;
        }
        console.log("Bot API key: " + manager.apiKey);
        if (botSteamId && manager && manager.apiKey) {
          sendApiKey(botSteamId, manager.apiKey);
        } else {
          console.log(`not logged in properly ${botSteamId} ${manager.apiKey}`)
          return;
        }
        //залогинились
        if (!is_tradingDemon_started) {
          is_tradingDemon_started = true;
          tradingDemon();
          appStatusDemon(60*1000);
        }
      });
      community.setCookies(cookies);
    });

    manager.on('sentOfferChanged', function (offer, oldState) {
      console.log(`TradeId ${offer.data('trade_id')} offer #${offer.id} changed: ${TradeOfferManager.ETradeOfferState[oldState]} -> ${TradeOfferManager.ETradeOfferState[offer.state]}`);
      if (offer.state === 2 || offer.state === 9) { //активный трейд - 2 или ждет подтверждения 9
        //это может быть активный трейд с предыдущей сессии
        if (sentTrades.findIndex(trade => trade.trade_id === offer.data('trade_id')) === -1) {
          console.log(`Added ${offer.data('trade_id')} to sentTrades array coz found it in active state`);
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
        console.log(`unknownOfferSent #${offer.id} trade_id ${offer.data('trade_id')} message ${offer.message}`);
        offer.data('error', 'steam is unstable at the momnent, try again later');
        let foundTrade = currentTradesInApi.find(trade => trade.bot_id === botSteamId && offer.message === `Protection Code: ${trade.protection_code}`);
        if (foundTrade) {
          console.log(`Found trade in api for offer #${offer.id}, setting trade_id to ${foundTrade.trade_id}`);
          offer.data('trade_id', foundTrade.trade_id);
        } else {
          console.log(`Can't find offer #${offer.id} in currentTradesInApi`);
        }
      } catch (error) {
        console.error(error);
      }
    });

    manager.on('newOffer', function (offer) {
      try {
        //TODO: проверяем на обманные трейды и отменяем их
        console.log(`got new offer ${JSON.stringify(offer)}`);
      } catch (error) {
        console.error(error);
      }
    });

    async function appStatusDemon(timeout: number) {
      let isCommunityLoggedIn = false;
      try {
        isCommunityLoggedIn = await getIsCommunityLoggedIn(community);
      } catch (error) {
        console.error(error)
      }
      try {
        console.log(`reporting appstatus: steamid ${botSteamId} status ${isCommunityLoggedIn ? 1 : 0}`)
        let result = await bets4proReportAppStatus(botSteamId, isCommunityLoggedIn ? 1 : 0);
        console.log(`appStatusDemon result: ${JSON.stringify(result)}`)
      } catch (error) {
        console.error(error)
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
          console.log(`Got ${trades && trades.length || 0} trades in bets4pro API`);
          if (trades) {
            currentTradesInApi = trades;
            for (let i = 0; i < trades.length; i++) {
              const trade = trades[i];
              console.log(`${sentTrades.findIndex(sent_trade => sent_trade.trade_id == trade.trade_id)}`)
              console.log(`${botSteamId} ${trade.seller_data.steamid}`);
              console.log(`${trade.status}`);
              if (trade.status != 0 ||
                trade.seller_data.steamid != botSteamId ||
                sentTrades.findIndex(sent_trade => sent_trade.trade_id == trade.trade_id) != -1) {
                console.log(`no need to create trade ${JSON.stringify(trade)}`);
                continue;
              }
              if (!client || !client.client || !client.client.loggedOn) {
                console.log(`Can't send trade ${trade.trade_id} steamClient loggedOn ${client && client.client && client.client.loggedOn}`);
                continue;
              }
              createTradeoffer(trade);
            }
          }
        } else {
          console.log(`not logged in`);
        }
      } catch (error) {
        console.error(`tradingDemon ${error}`)
      } finally {
        setTimeout(tradingDemon.bind(null), tradingTimeout);
      }
    }

    function createTradeoffer(trade: any) {
      trade.trade_created_time = Date.now();
      sentTrades.push(trade);
      console.log(`Added ${trade.trade_id} to sentTrades array, creating offer`);
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
          console.error(`ERROR getting escrow ${err.name} \n ${err.message} \n ${err.stack}`);
          offer.data('error', err.message);
          console.log(sentTrades);
          //TODO: чет я тут непонятное наворотил, он же всегда в массиве отправленых будет
          var index = sentTrades.indexOf(trade);
          if (index > -1) {
            sentTrades.splice(index, 1);
          } else {
            reportTradeByOfferAndStatus(offer, 2);
          }
          console.log(sentTrades);
          return;
        } else {
          if (me.escrowDays !== 0 || them.escrowDays !== 0) {
            console.log('escrow here. them:' + them.escrowDays + " me:" + me.escrowDays);
            offer.data('error', `Escrow. Me: ${me.escrowDays} Them: ${them.escrowDays}`);
            reportTradeByOfferAndStatus(offer, 3);
            return;
          } else {
            offer.send(function (err: any, status: any) {
              if (err || !offer) {
                console.error(`ERROR sending offer ${err.name} \n ${err.message} \n ${err.stack}`);
                offer.data('error', err.message);
                console.log(`Offer #${offer && offer.id} tradeid ${trade && trade.trade_id} will be reported as unsucceful in 3min`);
                setTimeout(reportTradeByOfferAndStatus.bind(null, offer, 5), 180000); //репортим через 3 минут если этот трейд не отрепортится сам черз поллдату
                //TODO: возможно нужно проверять этот оффер в поллдате
                return;
              } else {
                if (status == 'pending') {
                  console.log(`now need confirm offer. status: ${status}`)
                  //tryConfirmTradeoffer(currentOffer, 0, 10);
                  return;
                } else {
                  console.log(`Offer #${offer.id} tradeid ${trade.trade_id} sent successfully`);
                  return;
                }
              }
            });
          }
        }
      })
    }

    async function sendApiKey(steamId: any, apiKey: any){
      let result = '';
      try {
        result = await bets4proSaveApiKey(steamId, apiKey);
        console.log(`sendApiKey result ${JSON.stringify(result)}`);
      } catch (error) {
        console.error(error);
      }
      //report until success
      if (result.indexOf("gjgrf_ok") === -1) {
        setTimeout(sendApiKey.bind(null, steamId, apiKey), 10000);
      } else {
        return result;
      }
    }

    async function reportTradeByOfferAndStatus(tradeoffer: any, tradeStatus: any) {
      let result = '';
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
        console.log(`reporting trade_id: ${o_trade_id} ; status: ${tradeStatus} ; tradeoffer_id: ${o_tradeoffer_id} ; tradeoffer_status: ${o_tradeoffer_status} ; error: ${o_error}`);
        if (o_trade_id) {
          result = await bets4proReportTrade(o_trade_id, tradeStatus, o_tradeoffer_id, o_tradeoffer_status, o_error);
          console.log(`reportTradeByOfferAndStatus result ${JSON.stringify(result)}`);
        }
      } catch (error) {
        console.error(error);
      }
      //report until success
      if (result.indexOf("gjgrf_ok") === -1) {
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
        console.error(`getTrades ${error}`);
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


  }
}

@NgModule({
  imports: [BrowserModule, FormsModule],
  declarations: [AppComponent],
  bootstrap: [AppComponent]
})
export class AppModule { }