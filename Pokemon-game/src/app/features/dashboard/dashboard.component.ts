import { Component, OnInit, OnDestroy, inject, signal, computed, PLATFORM_ID, effect } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ProfileService } from '../../core/services/profile.service';
import { AudioService } from '../../core/services/audio.service';
import { ShopService } from '../../core/services/shop.service';
import { ThemeService } from '../../core/services/theme.service';
import { PackOpenerComponent } from '../shop/pack-opener/pack-opener.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, PackOpenerComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent implements OnInit, OnDestroy {
  public readonly auth = inject(AuthService);
  public readonly profileService = inject(ProfileService);
  public readonly audio = inject(AudioService);
  public readonly shop = inject(ShopService);
  public readonly theme = inject(ThemeService);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);

  // Difficulty selection
  public readonly selectedDifficulty = signal<'rookie' | 'rival' | 'master'>('rival');

  // Tutorial states
  public readonly showTutorial = signal<boolean>(false);
  public readonly tutorialStep = signal<number>(1);

  // Pack Opener states
  public readonly showPackOpener = signal<boolean>(false);
  public readonly recentRewards = signal<any[]>([]);

  // Navigation tab state
  public readonly activeTab = signal<'battle' | 'online' | 'missions' | 'shop' | 'profile' | 'help'>('battle');

  // Computed properties for XP Bar
  public readonly xpPercentage = computed(() => {
    const p = this.auth.profile();
    if (!p) return 0;
    const needed = this.profileService.getXpNeededForLevel(p.level);
    return Math.min(100, Math.floor((p.xp / needed) * 100));
  });

  public readonly xpNeeded = computed(() => {
    const p = this.auth.profile();
    if (!p) return 0;
    return this.profileService.getXpNeededForLevel(p.level);
  });

  // Efecto reactivo: carga misiones e historial cuando el usuario esté listo
  private readonly dataLoaderEffect = effect(() => {
    const user = this.auth.user();
    if (user) {
      this.profileService.fetchMissions();
      this.profileService.fetchMatchHistory();
      this.loadRecentRewards();
    }
  });

  public toggleFullscreen(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const doc = document as any;
    if (!doc.fullscreenElement && !doc.webkitFullscreenElement && !doc.mozFullScreenElement && !doc.msFullscreenElement) {
      const el = document.documentElement as any;
      if (el.requestFullscreen) {
        el.requestFullscreen();
      } else if (el.webkitRequestFullscreen) {
        el.webkitRequestFullscreen();
      } else if (el.mozRequestFullScreen) {
        el.mozRequestFullScreen();
      } else if (el.msRequestFullscreen) {
        el.msRequestFullscreen();
      }
    } else {
      if (doc.exitFullscreen) {
        doc.exitFullscreen();
      } else if (doc.webkitExitFullscreen) {
        doc.webkitExitFullscreen();
      } else if (doc.mozCancelFullScreen) {
        doc.mozCancelFullScreen();
      } else if (doc.msExitFullscreen) {
        doc.msExitFullscreen();
      }
    }
  }

  public isFullscreen(): boolean {
    if (!isPlatformBrowser(this.platformId)) return false;
    const doc = document as any;
    return !!(doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement);
  }

  public onVolumeChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    if (target) {
      const val = parseFloat(target.value);
      this.audio.setVolume(val);
    }
  }

  ngOnInit(): void {
    this.audio.playClick();
    this.audio.startBgm();
  }

  ngOnDestroy(): void {
    // Effect se limpia automáticamente
  }

  private async loadRecentRewards() {
    const rewards = await this.shop.fetchRecentRewards();
    this.recentRewards.set(rewards);
  }

  public selectTab(tab: 'battle' | 'online' | 'missions' | 'shop' | 'profile' | 'help'): void {
    this.audio.playClick();
    this.activeTab.set(tab);
  }

  public openPackOpener(): void {
    this.audio.playClick();
    this.showPackOpener.set(true);
  }

  public closePackOpener(): void {
    this.showPackOpener.set(false);
    this.loadRecentRewards();
  }

  public openTutorial(): void {
    this.audio.playClick();
    this.showTutorial.set(true);
    this.tutorialStep.set(1);
  }

  public closeTutorial(): void {
    this.audio.playClick();
    this.showTutorial.set(false);
  }

  public nextStep(): void {
    this.audio.playClick();
    if (this.tutorialStep() < 4) {
      this.tutorialStep.update(s => s + 1);
    } else {
      this.showTutorial.set(false);
    }
  }

  public prevStep(): void {
    this.audio.playClick();
    if (this.tutorialStep() > 1) {
      this.tutorialStep.update(s => s - 1);
    }
  }

  public selectDifficulty(diff: 'rookie' | 'rival' | 'master'): void {
    this.audio.playClick();
    this.selectedDifficulty.set(diff);
  }

  public async claimReward(missionId: string, event: Event): Promise<void> {
    event.stopPropagation(); // Avoid double triggers
    this.audio.playClick();
    await this.profileService.claimMission(missionId);
  }

  public async regenerateMissions(): Promise<void> {
    this.audio.playClick();
    await this.profileService.generateDailyMissions();
  }

  public startBattle(): void {
    this.audio.playEnergyAttach(); // Power up chime
    this.router.navigate(['/battle'], {
      queryParams: { difficulty: this.selectedDifficulty() }
    });
  }

  public navigateTo(path: string): void {
    this.audio.playClick();
    this.router.navigate([path]);
  }

  public logout(): void {
    this.audio.playClick();
    this.auth.signOut();
  }
}
