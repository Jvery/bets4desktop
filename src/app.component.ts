import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
let SteamClient = require('steam-client');
let SteamUser = require('steam-user');
let SteamCommunity = require('steamcommunity');
let SteamTotp = require('steam-totp');
let TradeOfferManager = require('steam-tradeoffer-manager')
let fs = require('fs');
let request = require('request');
let winston = require('winston');
let Bottleneck = require("bottleneck");

@Component({
  selector: 'App',
  template:
    `<div>
    <h2>Welcome to {{name}} beatch!</h2>
    <input [(ngModel)]="username">
    <input [(ngModel)]="password" type="password">
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
    alert(this.username + this.password);
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

    client.on('loggedOn', function () {
      client.setPersona(SteamUser.Steam.EPersonaState.Online);
    });

    client.on('steamGuard', function (domain, callback) {
      let code = prompt("Enter Steam Guard code");
      callback(code);
    });
  }
}

@NgModule({
  imports: [BrowserModule, FormsModule],
  declarations: [AppComponent],
  bootstrap: [AppComponent]
})
export class AppModule { }