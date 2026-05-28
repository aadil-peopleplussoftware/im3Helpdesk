import {
  Directive, Input, TemplateRef, ViewContainerRef, inject, effect, EffectRef
} from '@angular/core';
import { RoleRightsService } from '../services/role-rights.service';

type Action = 'view' | 'add' | 'edit' | 'delete' | 'export';

@Directive({
  selector: '[hasPermission]',
  standalone: true
})
export class HasPermissionDirective {
  private tpl = inject(TemplateRef<unknown>);
  private vcr = inject(ViewContainerRef);
  private rr  = inject(RoleRightsService);

  private module = '';
  private action: Action = 'view';
  private rendered = false;

  private _eff: EffectRef = effect(() => {
    this.rr.myPermissions();
    this.rr.isSuperAdminFlag();
    this.rr.loaded();
    this.evaluate();
  });

  @Input() set hasPermission(value: string | [string, Action]) {
    if (Array.isArray(value)) {
      this.module = value[0];
      this.action = (value[1] || 'view') as Action;
    } else if (typeof value === 'string') {
      const [m, a] = value.split(':');
      this.module = m;
      this.action = (a as Action) || 'view';
    }
    this.evaluate();
  }

  private evaluate(): void {
    if (!this.module) return;
    const allowed = this.rr.can(this.module, this.action);
    if (allowed && !this.rendered) {
      this.vcr.createEmbeddedView(this.tpl);
      this.rendered = true;
    } else if (!allowed && this.rendered) {
      this.vcr.clear();
      this.rendered = false;
    }
  }
}
