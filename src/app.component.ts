import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { Component, OnInit, ApplicationRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { __await } from 'tslib';
const { ipcRenderer } = require('electron');
var vex = require('vex-js')
vex.registerPlugin(require('vex-dialog'));
vex.defaultOptions.className = 'vex-theme-os';

@Component({
  selector: 'App',
  template:
    `<div>
    <h2>Welcome to {{name}} beatch!</h2>
    <input [(ngModel)]="username" (keyup.enter)="login()">
    <input [(ngModel)]="password" type="password" (keyup.enter)="login()">
    <p>
      <button (click)="login()">login</button>
      <button (click)="relog()">relog</button>
      <button (click)="test()">test</button>
    </p>
    <p>trades: {{trades.length}}</p>
    <p>{{trades | json}}</p>
    <!-- <div *ngFor="let trade of trades">{{trade}}</div>-->
  </div>`
})
export class AppComponent implements OnInit {
  constructor(private ref: ApplicationRef) { 
  }
  public readonly name = 'bets4pro desktop app';
  public username = '';
  public password = '';
  public trades =  [`test_trade_1`,`test_trade_2`, `test_trade_3`, `test_trade_4`];
  ngOnInit(): void {
    console.log('component initialized');
    this.username = 'M6kvuxlxHUwswzl';
    this.password = '9prSt98baMU7JAg';
    this.init_messages();
  }
init_messages (){
  ipcRenderer.on('need-steamguardcode', (event, arg) => {
    console.log(`got msg need-steamguardcode`);
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
          console.log('Code: ', data.code);
          ipcRenderer.send('need-steamguardcode', data.code);
        }
      }
    })
  })

  ipcRenderer.on('console-log', (event, msg) => {
    console.log(msg);
  });
  ipcRenderer.on('console-error', (event, msg) => {
    console.error(msg);
  });
  ipcRenderer.on('vex-alert', (event, msg) => {
    vex.dialog.alert(`${msg}`);
  });
  ipcRenderer.on('trades-update', (event, trades) => {
    if (!trades){
      trades = [];
    }
    this.trades = trades;
    this.ref.tick();
  });
}
  

  login() {
    ipcRenderer.send('login-steam', { username: this.username, password: this.password })
  }
  relog() {
    ipcRenderer.send('relog-steam', {});
  }
  test() {
    ipcRenderer.send('test-steam', {});
  }
}

@NgModule({
  imports: [BrowserModule, FormsModule],
  declarations: [AppComponent],
  bootstrap: [AppComponent]
})
export class AppModule { }