import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-setup-org-error',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './setup-org-error.html',
  styleUrls: ['./setup-org-error.scss']
})
export class SetupOrgErrorComponent {}