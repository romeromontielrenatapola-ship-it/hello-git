import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { ToastService } from './toast.service';
import { AudioService } from './audio.service';
import { DailyMission } from '../models/mission.model';
import { Profile } from '../models/profile.model';

@Injectable({
  providedIn: 'root'
})
export class ProfileService {
  private readonly supabase = inject(SupabaseService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly audio = inject(AudioService);

  public readonly missions = signal<DailyMission[]>([]);
  public readonly matches = signal<any[]>([]);
  public readonly loadingMissions = signal<boolean>(false);
  public readonly loadingMatches = signal<boolean>(false);

  // Calculate XP needed for next level: e.g. level * 100
  public getXpNeededForLevel(level: number): number {
    return level * 100;
  }

  public async fetchMissions(): Promise<void> {
    const user = this.auth.user();
    if (!user) return;

    this.loadingMissions.set(true);
    try {
      const { data, error } = await this.supabase.client
        .from('daily_missions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Si el usuario no tiene misiones, generarlas automáticamente
      if (!data || data.length === 0) {
        await this.generateDailyMissions(user.id);
        return; // generateDailyMissions llamará fetchMissions de nuevo al final
      }

      this.missions.set(data as DailyMission[]);
    } catch (err: any) {
      console.error('Error al cargar misiones:', err.message);
    } finally {
      this.loadingMissions.set(false);
    }
  }

  public async generateDailyMissions(userId?: string): Promise<void> {
    const user = this.auth.user();
    const uid = userId || user?.id;
    if (!uid) return;

    try {
      // Eliminar misiones antiguas no reclamadas si existen
      await this.supabase.client
        .from('daily_missions')
        .delete()
        .eq('user_id', uid)
        .eq('is_claimed', false);

      // Crear las 3 misiones diarias estándar
      const { error } = await this.supabase.client
        .from('daily_missions')
        .insert([
          {
            user_id: uid,
            title: 'Primera Victoria',
            description: 'Gana un duelo contra el CPU en cualquier dificultad.',
            type: 'win_battle',
            reward_xp: 100,
            reward_coins: 50,
            target_value: 1,
            current_value: 0
          },
          {
            user_id: uid,
            title: 'Sobrecarga de Energía',
            description: 'Juega 5 cartas de energía en tus Pokémon.',
            type: 'play_cards',
            reward_xp: 50,
            reward_coins: 25,
            target_value: 5,
            current_value: 0
          },
          {
            user_id: uid,
            title: 'Daño Crítico',
            description: 'Inflige un total de 150 puntos de daño al CPU.',
            type: 'deal_damage',
            reward_xp: 75,
            reward_coins: 35,
            target_value: 150,
            current_value: 0
          }
        ]);

      if (error) throw error;

      this.toast.show('🎯 ¡Misiones diarias generadas! Completa tus objetivos de hoy.', 'info', 4000);

      // Recargar misiones
      await this.fetchMissions();
    } catch (err: any) {
      console.error('Error al generar misiones diarias:', err.message);
      this.loadingMissions.set(false);
    }
  }

  public async claimMission(missionId: string): Promise<void> {
    const profile = this.auth.profile();
    if (!profile) return;

    const mission = this.missions().find(m => m.id === missionId);
    if (!mission || !mission.is_completed || mission.is_claimed) return;

    try {
      // 1. Mark mission as claimed
      const { error: missionError } = await this.supabase.client
        .from('daily_missions')
        .update({ is_claimed: true })
        .eq('id', missionId);

      if (missionError) throw missionError;

      // 2. Add rewards and check Level Up
      await this.addRewards(mission.reward_xp, mission.reward_coins);

      // 3. Refresh missions UI
      this.missions.update(prev => 
        prev.map(m => m.id === missionId ? { ...m, is_claimed: true } : m)
      );

      this.toast.success(`¡Misión cobrada! +${mission.reward_xp} XP, +${mission.reward_coins} Monedas`);
      this.audio.playHeal(); // Success chime
    } catch (err: any) {
      this.toast.error('Error al reclamar la misión.');
      console.error(err);
    }
  }

  public async fetchMatchHistory(): Promise<void> {
    const user = this.auth.user();
    if (!user) return;

    this.loadingMatches.set(true);
    try {
      const { data, error } = await this.supabase.client
        .from('matches')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      this.matches.set(data || []);
    } catch (err: any) {
      console.error('Error al cargar historial de duelos:', err.message);
    } finally {
      this.loadingMatches.set(false);
    }
  }

  public async recordMatch(opponentName: string, result: 'victory' | 'defeat'): Promise<void> {
    const user = this.auth.user();
    if (!user) return;

    // XP and Coins formulas
    const xpGained = result === 'victory' ? 100 : 25;
    const coinsGained = result === 'victory' ? 100 : 40;

    try {
      // 1. Log match in Supabase
      const { error: matchError } = await this.supabase.client
        .from('matches')
        .insert({
          user_id: user.id,
          opponent_name: opponentName,
          result,
          xp_gained: xpGained,
          coins_gained: coinsGained
        });

      if (matchError) throw matchError;

      // 2. Apply Rewards and check level up
      await this.addRewards(xpGained, coinsGained);

      // 3. Update missions progress
      await this.updateMissionsProgress(result, xpGained);

      // 4. Reload
      await this.fetchMatchHistory();
    } catch (err: any) {
      console.error('Error al registrar duelo:', err.message);
    }
  }

  private async addRewards(xpGained: number, coinsGained: number): Promise<void> {
    const profile = this.auth.profile();
    if (!profile) return;

    let currentXp = profile.xp + xpGained;
    let currentLevel = profile.level;
    let coins = profile.coins + coinsGained;
    let leveledUp = false;

    // Level up calculation loop
    let xpNeeded = this.getXpNeededForLevel(currentLevel);
    while (currentXp >= xpNeeded) {
      currentXp -= xpNeeded;
      currentLevel++;
      xpNeeded = this.getXpNeededForLevel(currentLevel);
      leveledUp = true;
    }

    try {
      // Update Database
      const { error } = await this.supabase.client
        .from('profiles')
        .update({
          xp: currentXp,
          level: currentLevel,
          coins: coins
        })
        .eq('id', profile.id);

      if (error) throw error;

      // Update Local Signal
      this.auth.profile.set({
        ...profile,
        xp: currentXp,
        level: currentLevel,
        coins: coins
      });

      if (leveledUp) {
        this.audio.playLevelUp();
        this.toast.show(`🌟 ¡NIVEL AUMENTADO! Ahora eres Nivel ${currentLevel} 🌟`, 'success', 5000);
      }
    } catch (err: any) {
      console.error('Error al actualizar estadísticas del perfil:', err.message);
    }
  }

  private async updateMissionsProgress(result: 'victory' | 'defeat', damageDealt = 100): Promise<void> {
    const user = this.auth.user();
    if (!user) return;

    await this.fetchMissions();
    const activeMissions = this.missions().filter(m => !m.is_claimed);

    for (const mission of activeMissions) {
      let progressAdded = 0;

      if (mission.type === 'win_battle' && result === 'victory') {
        progressAdded = 1;
      } else if (mission.type === 'deal_damage') {
        progressAdded = damageDealt;
      } else if (mission.type === 'play_cards') {
        // Assume player played cards in the duel, let's say average 8 cards.
        progressAdded = Math.floor(Math.random() * 5) + 5; 
      }

      if (progressAdded > 0) {
        const newValue = Math.min(mission.target_value, mission.current_value + progressAdded);
        const isCompleted = newValue >= mission.target_value;

        try {
          const { error } = await this.supabase.client
            .from('daily_missions')
            .update({
              current_value: newValue,
              is_completed: isCompleted
            })
            .eq('id', mission.id);

          if (error) throw error;

          if (isCompleted && !mission.is_completed) {
            this.toast.info(`🔔 ¡Misión completada: "${mission.title}"! Cobrala en tu Dashboard.`, 5000);
          }
        } catch (err: any) {
          console.error('Error al actualizar progreso de misión:', err.message);
        }
      }
    }

    // Refresh missions list
    await this.fetchMissions();
  }
}
