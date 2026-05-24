import {
  Component, OnInit, ChangeDetectorRef, inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ReactiveFormsModule, FormBuilder, FormGroup, Validators
} from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCardModule } from '@angular/material/card';
import { ToastrService } from 'ngx-toastr';
import { KnowledgeBaseService } from '../../../core/services/knowledge-base';
import { LayoutComponent } from '../../../layouts/main-layout/layout';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-kb-create',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, RouterModule,
    MatButtonModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatSlideToggleModule,
    MatProgressSpinnerModule, MatCardModule,
    LayoutComponent
  ],
  templateUrl: './kb-create.html',
  styleUrls: ['./kb-create.scss']
})
export class KbCreateComponent implements OnInit {
  private kbService = inject(KnowledgeBaseService);
  public  router    = inject(Router);
  private route     = inject(ActivatedRoute);
  private toastr    = inject(ToastrService);
  private fb        = inject(FormBuilder);
  private cdr       = inject(ChangeDetectorRef);

  loading    = false;
  isEdit     = false;
  articleId  = '';

  // Media
  mediaPreview: string | null = null;
  mediaType:    string        = 'none';
  mediaUrl:     string        = '';
  uploadingMedia              = false;

  categories = [
    'General', 'Technical', 'Billing',
    'Account', 'Features', 'Troubleshooting', 'Announcement'
  ];

  form: FormGroup = this.fb.group({
    title:       ['', [Validators.required, Validators.minLength(3)]],
    content:     ['', [Validators.required, Validators.minLength(5)]],
    category:    ['General', Validators.required],
    tags:        [''],
    isPublished: [true]
  });

  ngOnInit() {
    this.articleId = this.route.snapshot.paramMap.get('id') || '';
    if (this.articleId) {
      this.isEdit = true;
      this.loadArticle();
    }
  }

  loadArticle() {
    this.kbService.getById(this.articleId).subscribe({
      next: (data: any) => {
        this.form.patchValue(data);
        if (data.mediaUrl && data.mediaType !== 'none') {
          this.mediaUrl     = data.mediaUrl;
          this.mediaType    = data.mediaType;
          this.mediaPreview = environment.baseUrl + data.mediaUrl;
        }
        this.cdr.detectChanges();
      }
    });
  }

  // ── Media Upload ────────────────────────────
  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    const file = input.files[0];

    // Show local preview immediately
    const reader = new FileReader();
    reader.onload = (e: any) => {
      this.mediaPreview = e.target.result;
      this.mediaType    = file.type.startsWith('video/') ? 'video' : 'image';
      this.cdr.detectChanges();
    };
    reader.readAsDataURL(file);

    // Upload to server
    this.uploadingMedia = true;
    this.kbService.uploadMedia(file).subscribe({
      next: (res: any) => {
        this.mediaUrl       = res.url;
        this.mediaType      = res.mediaType;
        this.uploadingMedia = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.toastr.error('Media upload failed');
        this.uploadingMedia = false;
        this.removeMedia();
      }
    });
  }

  removeMedia() {
    this.mediaPreview = null;
    this.mediaType    = 'none';
    this.mediaUrl     = '';
    this.cdr.detectChanges();
  }

  // ── Submit ──────────────────────────────────
  onSubmit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    if (this.uploadingMedia) {
      this.toastr.warning('Please wait for media to finish uploading');
      return;
    }

    this.loading = true;
    this.cdr.detectChanges();

    const payload = {
      ...this.form.value,
      mediaUrl:  this.mediaUrl,
      mediaType: this.mediaType
    };

    const action = this.isEdit
      ? this.kbService.update(this.articleId, payload)
      : this.kbService.create(payload);

    action.subscribe({
      next: () => {
        this.loading = false;
        this.cdr.detectChanges();
        this.toastr.success(this.isEdit ? 'Post updated!' : 'Post published!');
        this.router.navigate(['/kb']);
      },
      error: (err: any) => {
        this.loading = false;
        this.cdr.detectChanges();
        if (err.status === 403)
          this.toastr.error('You can only edit your own posts');
        else
          this.toastr.error(err.error?.message || 'Failed to save');
      }
    });
  }
}