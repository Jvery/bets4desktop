import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { Component, OnInit, AfterViewInit, ApplicationRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { __await } from 'tslib';
const remote = require('electron').remote;
const app = remote.app;
const { ipcRenderer } = require('electron');
const log = require('electron-log');
var vex = require('vex-js')
vex.registerPlugin(require('vex-dialog'));
vex.defaultOptions.className = 'vex-theme-os';
var settingsLoader = require('./settings.ts');

@Component({
  selector: 'App',
  templateUrl: './app.component.html'
})
export class AppComponent implements OnInit, AfterViewInit {
  constructor(private ref: ApplicationRef) {
  }
  //0 not logged in, 1 selling, -1 not selling
  public appState = 0;
  public isLogginIn = false;
  public username = '';
  public password = '';
  public trades = [];
  public saveLogin = true;
  public savePassword = false;
  public enableNotifications = true;
  public enableSounds = true;
  ngOnInit(): void {
    this.init_messages();
    log.info('component initialized');
  }
  ngAfterViewInit() {
    this.loadSettings();
  }
  init_messages() {
    let self = this;
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
            log.info('Cancelled');
            self.isLogginIn = false;
            self.ref.tick();
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
        if (this.appState == 1) {
          $('a#pills-trades-tab').click();
        }
      }
      this.ref.tick();
    });
    ipcRenderer.on('vex-alert', (event: any, msg: any) => {
      vex.dialog.alert(`${msg}`);
    });
    ipcRenderer.on('appState-update', (event: any, state: number) => {
      if (this.appState != state) {
        this.appState = state;
        this.ref.tick();
      }
    });
    ipcRenderer.on('trades-update', (event: any, trades: any) => {
      if (!trades) {
        trades = [];
      }
      if (this.trades != trades) {
        this.trades = trades;
        this.ref.tick();
      }
    });
  }
  async loadSettings() {
    try {
      settingsLoader.setPath(`${app.getPath('userData')}/settingsbets.txt`);
      let settings = { login: '', password: '', saveLogin: true, savePassword: false, enableNotifications: true, enableSounds: true };
      let loadedSettings = JSON.parse(await settingsLoader.readAsync());
      if (loadedSettings) {
        if (loadedSettings.login) {
          settings.login = loadedSettings.login;
        }
        if (loadedSettings.password) {
          settings.password = Buffer.from(loadedSettings.password, 'base64').toString('ascii');
        }
        settings.savePassword = loadedSettings.savePassword ? true : false;
        settings.saveLogin = loadedSettings.saveLogin ? true : false;
        settings.enableNotifications = loadedSettings.enableNotifications ? true : false;
        settings.enableSounds = loadedSettings.enableSounds ? true : false;
      }
      this.saveLogin = settings.saveLogin;
      this.savePassword = settings.savePassword;
      this.username = settings.login;
      this.password = settings.password;
      this.enableNotifications = settings.enableNotifications;
      this.enableSounds = settings.enableSounds;
      this.enableNotificationsChanged();
      this.enableSoundsChanged();
    } catch (error) {
      log.error(`loadSettings ${error}`);
    }
  }
  async saveSettings() {
    let settings = { login: '', password: '', saveLogin: true, savePassword: false, enableNotifications: true, enableSounds: true };
    settings.saveLogin = this.saveLogin;
    settings.savePassword = this.savePassword;
    settings.enableNotifications = this.enableNotifications;
    settings.enableSounds = this.enableSounds;
    if (this.saveLogin) {
      settings.login = this.username;
    }
    if (this.savePassword) {
      settings.password = Buffer.from(this.password).toString('base64');
    }
    settingsLoader.writeAsync(JSON.stringify(settings));
  }
  enableNotificationsChanged() {
    ipcRenderer.send('enableNotificationsChanged', this.enableNotifications);
  }
  enableSoundsChanged() {
    ipcRenderer.send('enableSoundsChanged', this.enableSounds);
  }
  setAppState(state: number) {
    ipcRenderer.send('setAppState', state);
  }
  login() {
    if (this.username && this.password) {
      this.isLogginIn = true;
      ipcRenderer.send('login-steam', { username: this.username, password: this.password });
    }
  }
  relog() {
    ipcRenderer.send('relog-steam', {});
  }
}

@NgModule({
  imports: [BrowserModule, FormsModule],
  declarations: [AppComponent],
  bootstrap: [AppComponent]
})
export class AppModule { }