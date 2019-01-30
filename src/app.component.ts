import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { Component, OnInit, ApplicationRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { __await } from 'tslib';
const { ipcRenderer } = require('electron');
const log = require('electron-log');
var vex = require('vex-js')
vex.registerPlugin(require('vex-dialog'));
vex.defaultOptions.className = 'vex-theme-os';

@Component({
  selector: 'App',
  templateUrl: './app.component.html'
})
export class AppComponent implements OnInit {
  constructor(private ref: ApplicationRef) {
  }
  //0 not logged in, 1 selling, -1 not selling
  public appState = 0;
  public isLogginIn = false;
  public username = '';
  public password = '';
  public trades = [];
  ngOnInit(): void {
    log.info('component initialized');
    this.username = 'M6kvuxlxHUwswzl';
    this.password = '9prSt98baMU7JAg';
    this.init_messages();
  }
  init_messages() {
    ipcRenderer.on('need-steamguardcode', (event: any, arg: any) => {
      log.info(`got msg need-steamguardcode`);
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
            log.info('Cancelled')
          } else {
            log.info('Code: ', data.code);
            ipcRenderer.send('need-steamguardcode', data.code);
          }
        }
      })
    })
    ipcRenderer.on('isLogginIn', (event: any, msg: any) => {
      log.info(`isLogginIn ${msg}`)
      if (msg) {
        this.isLogginIn = true;
      } else {
        this.isLogginIn = false;
      }
      this.ref.tick();
    });
    ipcRenderer.on('vex-alert', (event: any, msg: any) => {
      vex.dialog.alert(`${msg}`);
    });
    ipcRenderer.on('trades-update', (event: any, trades: any) => {
      if (!trades) {
        trades = [];
      }
      if (this.trades!=trades){
        this.trades = trades;
        //TODO: proper appstate via ipc
        this.appState = 1;
        this.ref.tick();
      }
    });
  }


  login() {
    this.isLogginIn = true;
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