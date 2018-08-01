import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';

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

  login(){
    alert(this.username + this.password);
  }
}

@NgModule({
  imports: [BrowserModule, FormsModule],
  declarations: [AppComponent],
  bootstrap: [AppComponent]
})
export class AppModule { }