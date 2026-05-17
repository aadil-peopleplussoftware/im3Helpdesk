import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AppButtonComponent } from './components/app-button/app-button.component';
import { AppModalComponent } from './components/app-modal/app-modal.component';
import { AppTableComponent } from './components/app-table/app-table.component';
import { ClickOutsideDirective } from './directives/click-outside.directive';
import { DateFormatPipe } from './pipes/date-format.pipe';

@NgModule({
  declarations: [
    AppButtonComponent,
    AppModalComponent,
    AppTableComponent,
    ClickOutsideDirective,
    DateFormatPipe
  ],
  imports: [CommonModule],
  exports: [
    CommonModule,
    AppButtonComponent,
    AppModalComponent,
    AppTableComponent,
    ClickOutsideDirective,
    DateFormatPipe
  ]
})
export class SharedModule {
  constructor() {}
}
