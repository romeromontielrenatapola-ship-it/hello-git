import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { guestGuard } from './core/guards/guest.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/auth.component').then(m => m.AuthComponent),
    canActivate: [guestGuard]
  },
  {
    path: 'dashboard',
    loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
    canActivate: [authGuard]
  },
  {
    path: 'collection',
    loadComponent: () => import('./features/collection/collection.component').then(m => m.CollectionComponent),
    canActivate: [authGuard]
  },
  {
    path: 'deck-builder',
    loadComponent: () => import('./features/deck-builder/deck-builder.component').then(m => m.DeckBuilderComponent),
    canActivate: [authGuard]
  },
  {
    path: 'battle',
    loadComponent: () => import('./features/battle/battle.component').then(m => m.BattleComponent),
    canActivate: [authGuard]
  },
  {
    path: 'multiplayer-lobby',
    loadComponent: () => import('./features/multiplayer-lobby/multiplayer-lobby.component').then(m => m.MultiplayerLobbyComponent),
    canActivate: [authGuard]
  },
  {
    path: 'help',
    loadComponent: () => import('./features/help/help.component').then(m => m.HelpComponent),
    canActivate: [authGuard]
  },
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full'
  },
  {
    path: '**',
    redirectTo: 'dashboard'
  }
];
