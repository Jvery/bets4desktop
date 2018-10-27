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
    let tradingTimeout = 5000; //in ms
    let botSteamId = "";
    let sentTrades: any[] = [];
    let steamClient = new SteamClient.CMClient();
    let community = new SteamCommunity({});
    let client = new SteamUser({
      steamClient,
      promptSteamGuardCode: false
    });

    let manager = new TradeOfferManager({
      "steam": client, // Polling every 30 seconds is fine since we get notifications from Steam
      "community": community,
      //"domain": "example.com", // Our domain is example.com
      "language": "en", // We want English item descriptions
      "cancelTime": 120000,
      "pendingCancelTime": 30000
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
    });

    //залогинились, но пока не до конца
    client.on('loggedOn', function (details, parental) {
      console.log(`loggedOn ${details} ${parental}`)
      botSteamId = "" + client && client.client && client.client.steamID;
      console.log(`steamId ${botSteamId}`);
      client.setPersona(SteamUser.Steam.EPersonaState.Online);
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
        //TODO: отправляем в апи апикей
        //залогинились
        if (!is_tradingDemon_started) {
          is_tradingDemon_started = true;
          tradingDemon();
        }
      });
      community.setCookies(cookies);
    });

    async function tradingDemon() {
      try {
        if (client && client.client && client.client.loggedOn) {
          let trades = await getTrades(botSteamId);
          console.log(`Got ${trades && trades.length || 0} trades in bets4pro API`);
          if (trades) {
            for (let i = 0; i < trades.length; i++) {
              const trade = trades[i];
              if (trade.status != 0 ||
                trade.seller_data.steamid != botSteamId ||
                sentTrades.findIndex(sent_trade => sent_trade.trade_id == trade.trade_id) == -1) {
                console.log(`no need to create trade ${trade}`);
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
          //TODO: надо репортить статус
          //reportTradeToBets4proAPIbyOffer(offer, 2);
          return;
        } else {
          if (me.escrowDays !== 0 || them.escrowDays !== 0) {
            console.log('escrow here. them:' + them.escrowDays + " me:" + me.escrowDays);
            offer.data('error', `Escrow. Me: ${me.escrowDays} Them: ${them.escrowDays}`);
            //TODO: надо репортить статус
            //reportTradeToBets4proAPIbyOffer(offer, 3);
            return;
          } else {
            offer.send(function (err: any, status: any) {
              if (err || !offer) {
                console.error(`ERROR sending offer ${err.name} \n ${err.message} \n ${err.stack}`);
                offer.data('error', err.message);
                console.log(`Offer #${offer && offer.id} tradeid ${trade && trade.trade_id} will be reported as unsucceful in 3min`);
                //TODO: надо репортить статус
                //setTimeout(reportTradeToBets4proAPIbyOffer.bind(null, currentOffer, 5, "", trade.trade_id), 180000); //репортим через 3 минут если этот трейд не отрепортится сам черз поллдату
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
    function bets4proGetTradesRequest(botSteamId) {
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
  }
}

@NgModule({
  imports: [BrowserModule, FormsModule],
  declarations: [AppComponent],
  bootstrap: [AppComponent]
})
export class AppModule { }