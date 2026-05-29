import { Component, OnInit, inject, signal, computed, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { ProfileService } from '../../core/services/profile.service';
import { DeckService } from '../../core/services/deck.service';
import { CardService } from '../../core/services/card.service';
import { AudioService } from '../../core/services/audio.service';
import { ToastService } from '../../core/services/toast.service';
import { SupabaseService } from '../../core/services/supabase.service';
import { SqliteLocalService } from '../../core/services/sqlite-local.service';
import { Card, CardType } from '../../core/models/card.model';
import { DeckCard } from '../../core/models/deck.model';
import { BattleCard, BattleLogEntry, TurnOwner, TurnPhase, BattleStatus } from '../../core/models/battle.model';

@Component({
  selector: 'app-battle',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './battle.component.html',
  styleUrl: './battle.component.css'
})
export class BattleComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  public readonly auth = inject(AuthService);
  public readonly profileService = inject(ProfileService);
  private readonly deckService = inject(DeckService);
  private readonly cardService = inject(CardService);
  public readonly audio = inject(AudioService);
  private readonly toast = inject(ToastService);
  private readonly supabase = inject(SupabaseService);
  private readonly sqlite = inject(SqliteLocalService);

  // Difficulty settings (VS CPU mode only)
  public difficulty: 'rookie' | 'rival' | 'master' = 'rival';

  // Multiplayer Rooms Signals
  public readonly roomId = signal<string | null>(null);
  public readonly isMultiplayer = computed(() => this.roomId() !== null);
  public readonly myUserId = computed(() => this.auth.profile()?.id ?? '');
  
  public readonly roomStatus = signal<string>('waiting');
  public readonly hostProfile = signal<any>(null);
  public readonly guestProfile = signal<any>(null);
  public readonly turnOwnerId = signal<string>(''); // Holds UUID of whose turn it is online

  // Game Board Signals
  public readonly playerLP = signal<number>(4000);
  public readonly opponentLP = signal<number>(4000);

  public readonly playerHand = signal<BattleCard[]>([]);
  public readonly playerActive = signal<BattleCard | null>(null);
  public readonly playerBench = signal<(BattleCard | null)[]>([null, null, null]);
  public readonly playerDeck = signal<BattleCard[]>([]);
  public readonly playerDiscard = signal<BattleCard[]>([]);
  public readonly playerEnergyAttachedThisTurn = signal<boolean>(false);

  public readonly opponentHand = signal<BattleCard[]>([]);
  public readonly opponentActive = signal<BattleCard | null>(null);
  public readonly opponentBench = signal<(BattleCard | null)[]>([null, null, null]);
  public readonly opponentDeck = signal<BattleCard[]>([]);
  public readonly opponentDiscard = signal<BattleCard[]>([]);
  public readonly opponentEnergyAttachedThisTurn = signal<boolean>(false);

  public readonly turn = signal<TurnOwner>('player');
  public readonly phase = signal<TurnPhase>('draw');
  public readonly status = signal<BattleStatus>('active');
  public readonly turnNumber = signal<number>(1);
  public readonly logs = signal<BattleLogEntry[]>([]);

  // Selected card in player hand for action popup
  public selectedHandCardIndex = signal<number | null>(null);

  // Custom Surrender Modal state
  public readonly showSurrenderModal = signal<boolean>(false);

  // Custom Rules Manual Modal state
  public readonly showRulesModal = signal<boolean>(false);

  // Temporary attack boost for active Pokémon in this turn (e.g. Espada del Caos trainer)
  public playerAttackBoost = signal<number>(0);
  public opponentAttackBoost = signal<number>(0);
  public readonly playerActiveDamaged = signal<boolean>(false);
  public readonly opponentActiveDamaged = signal<boolean>(false);

  // Timers and sondeos
  private cpuTimeoutId: any = null;
  private multiplayerPollInterval: any = null;
  private lastStateUpdatedAt = '';

  // Check if player's active pokemon has enough energy to attack
  public readonly canPlayerActiveAttack = computed(() => {
    const active = this.playerActive();
    if (!active || active.hasAttackedThisTurn) return false;
    const cost = active.card.cost ?? 0;
    return active.attachedEnergy.length >= cost;
  });

  // Dynamic turn owner check (Host vs Guest online)
  public readonly isMyTurn = computed(() => {
    if (!this.isMultiplayer()) {
      return this.turn() === 'player';
    }
    return this.turnOwnerId() === this.myUserId();
  });

  // Display name of players
  public readonly playerDisplayName = computed(() => {
    return this.auth.profile()?.username || 'Entrenador local';
  });

  public readonly opponentDisplayName = computed(() => {
    if (!this.isMultiplayer()) return '👾 CPU SIMULADOR';
    const amIHost = this.myUserId() === this.hostProfile()?.id;
    return amIHost 
      ? (this.guestProfile()?.username || 'Esperando rival...') 
      : (this.hostProfile()?.username || 'Anfitrión');
  });

  private createBattleCard(card: Card): BattleCard {
    return {
      battleId: Math.random().toString(36).substring(2, 9),
      card,
      currentHp: card.hp ?? 0,
      attachedEnergy: [],
      hasAttackedThisTurn: false
    };
  }

  public getEnergySlotsArray(bc: BattleCard | null): { type: string; filled: boolean }[] {
    if (!bc) return [];
    const cost = bc.card.cost ?? 0;
    const attached = bc.attachedEnergy || [];
    const slots: { type: string; filled: boolean }[] = [];
    
    // Llenar con las energías asociadas reales
    for (let i = 0; i < attached.length; i++) {
      slots.push({ type: attached[i].element || 'colorless', filled: true });
    }
    
    // Llenar los espacios vacíos pendientes según coste de ataque
    const remaining = Math.max(0, cost - attached.length);
    for (let i = 0; i < remaining; i++) {
      slots.push({ type: 'empty', filled: false });
    }
    
    return slots;
  }

  private shuffle(array: BattleCard[]): BattleCard[] {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  private drawFromDeck(deckSignal: any): BattleCard | null {
    const deck = deckSignal() as BattleCard[];
    if (deck.length === 0) return null;
    const card = deck[0];
    deckSignal.set(deck.slice(1));
    return card;
  }

  private addLog(message: string, type: 'info' | 'attack' | 'heal' | 'energy' | 'trainer' | 'system' | 'victory' | 'defeat'): void {
    const log: BattleLogEntry = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date(),
      message,
      type
    };
    this.logs.update(prev => [log, ...prev]);
  }

  ngOnInit(): void {
    this.route.queryParams.subscribe(async params => {
      const room = params['roomId'];
      if (room) {
        this.roomId.set(room);
        await this.initMultiplayerGame(room);
      } else {
        this.difficulty = (params['difficulty'] || 'rival') as 'rookie' | 'rival' | 'master';
        await this.initGame();
      }
    });
  }

  ngOnDestroy(): void {
    if (this.cpuTimeoutId) clearTimeout(this.cpuTimeoutId);
    if (this.multiplayerPollInterval) clearInterval(this.multiplayerPollInterval);
  }

  // VS CPU INITIALIZATION
  private async initGame(): Promise<void> {
    this.audio.playEnergyAttach();
    this.addLog('Sincronizando arena cibernética...', 'system');

    this.playerLP.set(4000);
    if (this.difficulty === 'rookie') {
      this.opponentLP.set(3000);
      this.addLog('Dificultad: Rookie (CPU LP: 3000)', 'info');
    } else if (this.difficulty === 'master') {
      this.opponentLP.set(5000);
      this.addLog('Dificultad: Grand Master (CPU LP: 5000)', 'info');
    } else {
      this.opponentLP.set(4000);
      this.addLog('Dificultad: Rival (CPU LP: 4000)', 'info');
    }

    await this.deckService.fetchDecks();
    let deckCards = this.deckService.activeDeckCards();

    // Respaldo de mazo si no hay mazo activo o tiene menos de 10 cartas
    const totalCardsCount = deckCards.reduce((sum, dc) => sum + dc.quantity, 0);
    if (totalCardsCount < 10) {
      deckCards = await this.getFallbackDeck();
    }

    const pDeck = this.buildBattleDeck(deckCards);
    const oDeck = this.buildBattleDeck(deckCards);

    this.playerDeck.set(this.shuffle(pDeck));
    this.opponentDeck.set(this.shuffle(oDeck));

    const pHand: BattleCard[] = [];
    const oHand: BattleCard[] = [];
    for (let i = 0; i < 5; i++) {
      const pCard = this.drawFromDeck(this.playerDeck);
      if (pCard) pHand.push(pCard);
      const oCard = this.drawFromDeck(this.opponentDeck);
      if (oCard) oHand.push(oCard);
    }

    this.playerHand.set(pHand);
    this.opponentHand.set(oHand);

    this.addLog('Barajas barajadas. Robando 5 cartas iniciales.', 'system');

    // SQLite local history hook: Log battle start
    try {
      const matchId = Math.random().toString(36).substring(2, 9);
      await this.sqlite.query(
        `INSERT INTO local_history (id, log_type, description, timestamp) VALUES (?, ?, ?, ?);`,
        [matchId, 'battle_start', `Duelo contra CPU iniciado en dificultad ${this.difficulty.toUpperCase()}.`, new Date().toISOString()]
      );
    } catch (sqle) {
      console.error('Error guardando historia local:', sqle);
    }

    this.status.set('active');
    this.turn.set('player');
    this.phase.set('draw');
    this.turnNumber.set(1);

    this.executeDrawPhase();
  }

  // ONLINE PVP MULTIPLAYER INITIALIZATION
  private async initMultiplayerGame(roomUuid: string): Promise<void> {
    this.addLog('Enlazando canal satelital en la nube...', 'system');
    
    // Poll room row every 2.5 seconds to synchronize players online
    this.multiplayerPollInterval = setInterval(() => this.syncOnlineRoom(), 2500);
    await this.syncOnlineRoom();
  }

  private async syncOnlineRoom(): Promise<void> {
    const roomId = this.roomId();
    if (!roomId) return;

    try {
      const { data: room, error } = await this.supabase.client
        .from('multiplayer_rooms')
        .select('*, host:profiles!player_host(*), guest:profiles!player_guest(*)')
        .eq('id', roomId)
        .single();

      if (error) throw error;

      this.roomStatus.set(room.status);
      this.hostProfile.set(room.host);
      this.guestProfile.set(room.guest);
      this.turnOwnerId.set(room.current_turn || '');

      // Check if other player left
      if (this.status() === 'active' && room.status === 'finished' && room.winner_id) {
        if (room.winner_id === this.myUserId()) {
          this.status.set('victory');
          this.audio.playVictory();
          this.toast.success('¡Victoria en línea! El rival se ha desconectado o has ganado.');
        } else {
          this.status.set('defeat');
          this.audio.playDefeat();
          this.toast.error('Derrota en línea.');
        }
        clearInterval(this.multiplayerPollInterval);
        return;
      }

      // Check for board updates
      if (room.game_state && room.updated_at !== this.lastStateUpdatedAt) {
        this.lastStateUpdatedAt = room.updated_at;
        this.deserializeGameState(room.game_state);
      }

      // If room is active but game_state is null AND we are Host: we initialize it!
      if (room.status === 'active' && !room.game_state && this.myUserId() === room.player_host) {
        this.addLog('Oponente enlazado. Inicializando barajas en la nube...', 'system');
        await this.initializeOnlineGameState(room);
      }
    } catch (err: any) {
      console.error('Error al sincronizar sala online:', err.message);
    }
  }

  private async initializeOnlineGameState(room: any): Promise<void> {
    await this.deckService.fetchDecks();
    let deckCards = this.deckService.activeDeckCards();
    const totalCardsCount = deckCards.reduce((sum, dc) => sum + dc.quantity, 0);
    if (totalCardsCount < 10) {
      deckCards = await this.getFallbackDeck();
    }

    const pDeck = this.buildBattleDeck(deckCards);
    const oDeck = this.buildBattleDeck(deckCards);

    // Host deck (Player 1)
    const hostDeck = this.shuffle(pDeck);
    // Guest deck (Player 2)
    const guestDeck = this.shuffle(oDeck);

    const hostHand: BattleCard[] = [];
    const guestHand: BattleCard[] = [];

    // Draw initial hands
    for (let i = 0; i < 5; i++) {
      if (hostDeck.length > 0) hostHand.push(hostDeck.shift()!);
      if (guestDeck.length > 0) guestHand.push(guestDeck.shift()!);
    }

    // Host draws one extra card for their first turn
    if (hostDeck.length > 0) hostHand.push(hostDeck.shift()!);

    // Build initial game state JSON
    const stateJson = {
      player1_id: room.player_host,
      player2_id: room.player_guest,
      player1_state: {
        lp: 4000,
        hand: hostHand,
        active: null,
        bench: [null, null, null],
        deck: hostDeck,
        discard: [],
        energyAttached: false
      },
      player2_state: {
        lp: 4000,
        hand: guestHand,
        active: null,
        bench: [null, null, null],
        deck: guestDeck,
        discard: [],
        energyAttached: false
      },
      logs: [{
        id: 'init',
        timestamp: new Date(),
        message: '¡Duelo en línea iniciado! Turno del anfitrión.',
        type: 'system'
      }]
    };

    try {
      const { error } = await this.supabase.client
        .from('multiplayer_rooms')
        .update({
          game_state: stateJson,
          current_turn: room.player_host,
          updated_at: new Date().toISOString()
        })
        .eq('id', room.id);

      if (error) throw error;
      this.deserializeGameState(stateJson);
    } catch (err: any) {
      console.error('Error al inicializar estado online:', err.message);
    }
  }

  // SERIALIZE AND SAVE PLAY STATE ONLINE
  private async pushOnlineGameState(newLogs: string[] = []): Promise<void> {
    const roomId = this.roomId();
    if (!roomId) return;

    // Add any new log entries to signals
    newLogs.forEach(msg => this.addLog(msg, 'info'));

    const amIHost = this.myUserId() === this.hostProfile()?.id;

    // Build state
    const myState = {
      lp: this.playerLP(),
      hand: this.playerHand(),
      active: this.playerActive(),
      bench: this.playerBench(),
      deck: this.playerDeck(),
      discard: this.playerDiscard(),
      energyAttached: this.playerEnergyAttachedThisTurn()
    };

    const opponentState = {
      lp: this.opponentLP(),
      hand: this.opponentHand(),
      active: this.opponentActive(),
      bench: this.opponentBench(),
      deck: this.opponentDeck(),
      discard: this.opponentDiscard(),
      energyAttached: this.opponentEnergyAttachedThisTurn()
    };

    const stateJson = {
      player1_id: this.hostProfile()?.id,
      player2_id: this.guestProfile()?.id,
      player1_state: amIHost ? myState : opponentState,
      player2_state: amIHost ? opponentState : myState,
      logs: this.logs()
    };

    try {
      const { error } = await this.supabase.client
        .from('multiplayer_rooms')
        .update({
          game_state: stateJson,
          current_turn: this.turnOwnerId(),
          updated_at: new Date().toISOString()
        })
        .eq('id', roomId);

      if (error) throw error;
    } catch (err: any) {
      console.error('Error al guardar estado de combate:', err.message);
    }
  }

  // DESERIALIZE PLAY STATE FROM CLOUD
  private deserializeGameState(state: any): void {
    const amIHost = this.myUserId() === state.player1_id;
    
    const myState = amIHost ? state.player1_state : state.player2_state;
    const oppState = amIHost ? state.player2_state : state.player1_state;

    // Track old HP values to trigger animations
    const oldPlayerHp = this.playerActive()?.currentHp;
    const oldOpponentHp = this.opponentActive()?.currentHp;

    // Map to local signals
    this.playerLP.set(myState.lp);
    this.playerHand.set(myState.hand || []);
    this.playerActive.set(myState.active || null);
    this.playerBench.set(myState.bench || [null, null, null]);
    this.playerDeck.set(myState.deck || []);
    this.playerDiscard.set(myState.discard || []);
    this.playerEnergyAttachedThisTurn.set(myState.energyAttached ?? false);

    this.opponentLP.set(oppState.lp);
    this.opponentHand.set(oppState.hand || []);
    this.opponentActive.set(oppState.active || null);
    this.opponentBench.set(oppState.bench || [null, null, null]);
    this.opponentDeck.set(oppState.deck || []);
    this.opponentDiscard.set(oppState.discard || []);
    this.opponentEnergyAttachedThisTurn.set(oppState.energyAttached ?? false);

    this.logs.set(state.logs || []);

    // Check for damage and trigger shake/flash
    if (myState.active && oldPlayerHp !== undefined && myState.active.currentHp < oldPlayerHp) {
      this.playerActiveDamaged.set(true);
      setTimeout(() => this.playerActiveDamaged.set(false), 500);
    }
    if (oppState.active && oldOpponentHp !== undefined && oppState.active.currentHp < oldOpponentHp) {
      this.opponentActiveDamaged.set(true);
      setTimeout(() => this.opponentActiveDamaged.set(false), 500);
    }

    // Check online victory/defeat
    if (this.status() === 'active') {
      const myHasPkmn = myState.active !== null || (myState.bench && myState.bench.some((b: any) => b !== null));
      const myHasHandOrDeckPkmn = (myState.hand && myState.hand.some((c: any) => c.card?.type === 'pokemon')) || (myState.deck && myState.deck.some((c: any) => c.card?.type === 'pokemon'));
      
      const oppHasPkmn = oppState.active !== null || (oppState.bench && oppState.bench.some((b: any) => b !== null));
      const oppHasHandOrDeckPkmn = (oppState.hand && oppState.hand.some((c: any) => c.card?.type === 'pokemon')) || (oppState.deck && oppState.deck.some((c: any) => c.card?.type === 'pokemon'));

      if (myState.lp <= 0 || (!myHasPkmn && !myHasHandOrDeckPkmn)) {
        this.triggerDefeat('Puntos de red destruidos o te has quedado sin Pokémon.');
      } else if (oppState.lp <= 0 || (!oppHasPkmn && !oppHasHandOrDeckPkmn)) {
        this.triggerVictory('Has destruido el núcleo enemigo o el rival se ha quedado sin Pokémon.');
      }
    }
  }

  private async getFallbackDeck(): Promise<DeckCard[]> {
    await this.cardService.fetchCatalog();
    const catalog = this.cardService.catalog();
    const mockCards: DeckCard[] = [];
    const pkmns = catalog.filter(c => c.type === 'pokemon').slice(0, 12);
    const energies = catalog.filter(c => c.type === 'energy').slice(0, 12);
    const trainers = catalog.filter(c => c.type === 'trainer').slice(0, 6);

    [...pkmns, ...energies, ...trainers].forEach((c, index) => {
      mockCards.push({
        id: `fallback-${index}`,
        deck_id: 'mock',
        card_id: c.id,
        quantity: 1,
        card: c
      });
    });
    return mockCards;
  }

  private buildBattleDeck(deckCards: DeckCard[]): BattleCard[] {
    const deck: BattleCard[] = [];
    deckCards.forEach(dc => {
      if (dc.card) {
        for (let i = 0; i < dc.quantity; i++) {
          deck.push(this.createBattleCard(dc.card));
        }
      }
    });
    return deck;
  }

  // GAME ENGAGEMENT PHASES
  public executeDrawPhase(): void {
    if (this.status() !== 'active') return;

    // Check if either player has any Pokémon left anywhere (active, bench, hand, or deck)
    const playerHasActiveOrBenchPkmn = this.playerActive() !== null || this.playerBench().some(b => b !== null);
    const playerHasHandOrDeckPkmn = this.playerHand().some(c => c.card.type === 'pokemon') || this.playerDeck().some(c => c.card.type === 'pokemon');
    if (!playerHasActiveOrBenchPkmn && !playerHasHandOrDeckPkmn) {
      this.triggerDefeat('Tu terminal se ha quedado sin Pokémon para combatir en la red.');
      return;
    }

    const opponentHasActiveOrBenchPkmn = this.opponentActive() !== null || this.opponentBench().some(b => b !== null);
    const opponentHasHandOrDeckPkmn = this.opponentHand().some(c => c.card.type === 'pokemon') || this.opponentDeck().some(c => c.card.type === 'pokemon');
    if (!opponentHasActiveOrBenchPkmn && !opponentHasHandOrDeckPkmn) {
      this.triggerVictory('¡Victoria! El oponente se ha quedado sin Pokémon para combatir en la red.');
      return;
    }

    if (this.isMultiplayer()) {
      // Online Multiplayer Draw Phase
      if (!this.isMyTurn()) return;

      const card = this.drawFromDeck(this.playerDeck);
      if (card) {
        this.playerHand.update(prev => [...prev, card]);
        this.audio.playDrawCard();
        this.pushOnlineGameState([`[${this.playerDisplayName()}] Roba una carta.`]);
      } else {
        this.pushOnlineGameState([`[${this.playerDisplayName()}] Intenta robar pero su baraja está vacía.`]);
      }
      return;
    }

    // CPU mode Draw Phase
    this.phase.set('draw');
    const activeTurn = this.turn();

    if (activeTurn === 'player') {
      const card = this.drawFromDeck(this.playerDeck);
      if (card) {
        this.playerHand.update(prev => [...prev, card]);
        this.addLog(`Robas carta: "${card.card.name}"`, 'system');
        this.audio.playDrawCard();
      } else {
        this.addLog('Tu baraja digital está vacía. No robas carta este turno.', 'system');
      }
      this.phase.set('main');
    } else {
      const card = this.drawFromDeck(this.opponentDeck);
      if (card) {
        this.opponentHand.update(prev => [...prev, card]);
        this.addLog(`CPU roba una carta de la red.`, 'system');
      } else {
        this.addLog('La baraja del CPU está vacía. CPU no roba carta este turno.', 'system');
      }
      this.phase.set('main');
      this.cpuTimeoutId = setTimeout(() => this.runCpuAI(), 250);
    }
  }

  // CORE PLAYER INTERACTIONS (WORKS FOR BOTH CPU AND ONLINE MULTIPLAYER)
  public selectHandCard(index: number): void {
    if (!this.isMyTurn() || this.status() !== 'active') return;
    this.audio.playClick();
    if (this.selectedHandCardIndex() === index) {
      this.selectedHandCardIndex.set(null);
    } else {
      this.selectedHandCardIndex.set(index);
    }
  }

  public async playAsActive(): Promise<void> {
    const index = this.selectedHandCardIndex();
    if (index === null) return;
    const card = this.playerHand()[index];

    if (card.card.type !== 'pokemon') {
      this.toast.error('Solo puedes jugar cartas de Pokémon en el campo activo.');
      return;
    }

    if (this.playerActive() !== null) {
      this.toast.error('Ya tienes un Pokémon activo en la arena.');
      return;
    }

    this.audio.playDrawCard();
    this.playerActive.set(card);
    this.playerHand.update(prev => prev.filter((_, i) => i !== index));
    this.selectedHandCardIndex.set(null);

    const logMsg = `[${this.playerDisplayName()}] Despliega a ${card.card.name} como su Pokémon ACTIVO principal.`;
    if (this.isMultiplayer()) {
      await this.pushOnlineGameState([logMsg]);
    } else {
      this.addLog(logMsg, 'info');
    }
  }

  public async playToBench(benchSlot: number): Promise<void> {
    const index = this.selectedHandCardIndex();
    if (index === null) return;
    const card = this.playerHand()[index];

    if (card.card.type !== 'pokemon') {
      this.toast.error('Solo puedes colocar cartas de Pokémon en la banca.');
      return;
    }

    if (this.playerBench()[benchSlot] !== null) {
      this.toast.error('Esa ranura de la banca ya está ocupada.');
      return;
    }

    this.audio.playDrawCard();
    this.playerBench.update(prev => {
      const copy = [...prev];
      copy[benchSlot] = card;
      return copy;
    });
    this.playerHand.update(prev => prev.filter((_, i) => i !== index));
    this.selectedHandCardIndex.set(null);

    const logMsg = `[${this.playerDisplayName()}] Envía a ${card.card.name} a la Banca (Ranura ${benchSlot + 1}).`;
    if (this.isMultiplayer()) {
      await this.pushOnlineGameState([logMsg]);
    } else {
      this.addLog(logMsg, 'info');
    }
  }

  public async promoteBenchToActive(benchIndex: number): Promise<void> {
    if (!this.isMyTurn() || this.status() !== 'active') return;
    const benchedCard = this.playerBench()[benchIndex];
    if (!benchedCard) return;

    if (this.playerActive() !== null) {
      this.toast.error('Ya tienes un Pokémon activo en la arena. No puedes promover uno de la banca.');
      return;
    }

    this.audio.playDrawCard();
    this.playerActive.set(benchedCard);
    this.playerBench.update(prev => {
      const copy = [...prev];
      copy[benchIndex] = null;
      return copy;
    });

    const logMsg = `[${this.playerDisplayName()}] Promueve a ${benchedCard.card.name} desde la banca al campo ACTIVO.`;
    if (this.isMultiplayer()) {
      await this.pushOnlineGameState([logMsg]);
    } else {
      this.addLog(logMsg, 'info');
    }
  }

  public async attachEnergyToActive(): Promise<void> {
    const index = this.selectedHandCardIndex();
    if (index === null) return;
    const card = this.playerHand()[index];

    if (card.card.type !== 'energy') {
      this.toast.error('Solo puedes adjuntar cartas de Energía.');
      return;
    }

    if (this.playerEnergyAttachedThisTurn()) {
      this.toast.error('Límite del turno: Solo puedes adjuntar 1 Energía por turno.');
      return;
    }

    const active = this.playerActive();
    if (!active) {
      this.toast.error('No tienes ningún Pokémon activo para cargarle energía.');
      return;
    }

    this.audio.playEnergyAttach();
    
    // Reactively update the active Pokémon signal to ensure computed properties trigger updates
    this.playerActive.set({
      ...active,
      attachedEnergy: [...active.attachedEnergy, card.card]
    });

    this.playerHand.update(prev => prev.filter((_, i) => i !== index));
    this.playerEnergyAttachedThisTurn.set(true);
    this.selectedHandCardIndex.set(null);

    const logMsg = `[${this.playerDisplayName()}] Carga 1 ${card.card.name} en su Pokémon activo ${active.card.name}.`;
    if (this.isMultiplayer()) {
      await this.pushOnlineGameState([logMsg]);
    } else {
      this.addLog(logMsg, 'energy');
    }
  }

  public async attachEnergyToBench(benchSlot: number): Promise<void> {
    const index = this.selectedHandCardIndex();
    if (index === null) return;
    const card = this.playerHand()[index];

    if (card.card.type !== 'energy') {
      this.toast.error('Solo puedes adjuntar cartas de Energía.');
      return;
    }

    if (this.playerEnergyAttachedThisTurn()) {
      this.toast.error('Límite del turno: Solo puedes adjuntar 1 Energía por turno.');
      return;
    }

    const target = this.playerBench()[benchSlot];
    if (!target) {
      this.toast.error('No hay ningún Pokémon en esa ranura de la banca.');
      return;
    }

    this.audio.playEnergyAttach();
    
    // Reactively update the bench signal to ensure computed properties trigger updates
    this.playerBench.update(prev => {
      const copy = [...prev];
      const b = copy[benchSlot];
      if (b) {
        copy[benchSlot] = {
          ...b,
          attachedEnergy: [...b.attachedEnergy, card.card]
        };
      }
      return copy;
    });

    this.playerHand.update(prev => prev.filter((_, i) => i !== index));
    this.playerEnergyAttachedThisTurn.set(true);
    this.selectedHandCardIndex.set(null);

    const logMsg = `[${this.playerDisplayName()}] Carga 1 ${card.card.name} en su Pokémon de banca ${target.card.name}.`;
    if (this.isMultiplayer()) {
      await this.pushOnlineGameState([logMsg]);
    } else {
      this.addLog(logMsg, 'energy');
    }
  }

  public async useTrainerCard(): Promise<void> {
    const index = this.selectedHandCardIndex();
    if (index === null) return;
    const card = this.playerHand()[index];

    if (card.card.type !== 'trainer') {
      this.toast.error('Solo puedes activar cartas de Entrenador.');
      return;
    }

    const effect = card.card.effect;
    if (!effect) return;

    this.audio.playHeal();
    const logMsgs: string[] = [`[${this.playerDisplayName()}] Activa Entrenador "${card.card.name}": ${card.card.description}`];

    if (effect === 'HEAL_50') {
      const active = this.playerActive();
      if (active) {
        const nextHp = Math.min(active.card.hp ?? 100, active.currentHp + 50);
        this.playerActive.set({
          ...active,
          currentHp: nextHp
        });
        logMsgs.push(`Nanobots curan +50 HP a ${active.card.name}.`);
      }
    } else if (effect === 'HEAL_100') {
      const active = this.playerActive();
      if (active) {
        const nextHp = Math.min(active.card.hp ?? 100, active.currentHp + 100);
        this.playerActive.set({
          ...active,
          currentHp: nextHp
        });
        logMsgs.push(`Soporte vital crítico cura +100 HP a ${active.card.name}.`);
      }
    } else if (effect === 'DRAW_2') {
      for (let i = 0; i < 2; i++) {
        const c = this.drawFromDeck(this.playerDeck);
        if (c) {
          this.playerHand.update(prev => [...prev, c]);
          this.audio.playDrawCard();
        }
      }
      logMsgs.push(`Robas 2 cartas adicionales de tu base de datos.`);
    } else if (effect === 'DRAW_ENERGY') {
      const energyIdx = this.playerDeck().findIndex(c => c.card.type === 'energy');
      if (energyIdx !== -1) {
        const energyCard = this.playerDeck()[energyIdx];
        this.playerDeck.update(prev => prev.filter((_, i) => i !== energyIdx));
        this.playerHand.update(prev => [...prev, energyCard]);
        this.audio.playDrawCard();
        logMsgs.push(`Escaner localiza y roba 1 Energía de la baraja.`);
      }
    } else if (effect === 'BOOST_ATTACK_30') {
      this.playerAttackBoost.update(v => v + 30);
      logMsgs.push(`Inyección troyana otorga +30 ATK a tu activo este turno.`);
    }

    this.playerDiscard.update(prev => [...prev, card]);
    this.playerHand.update(prev => prev.filter((_, i) => i !== index));
    this.selectedHandCardIndex.set(null);

    if (this.isMultiplayer()) {
      await this.pushOnlineGameState(logMsgs);
    } else {
      logMsgs.forEach(msg => this.addLog(msg, 'trainer'));
    }
  }

  public async playAsActiveDirect(index: number): Promise<void> {
    this.selectedHandCardIndex.set(index);
    await this.playAsActive();
  }

  public async playToBenchDirect(index: number): Promise<void> {
    this.selectedHandCardIndex.set(index);
    const bench = this.playerBench();
    const emptySlot = bench.indexOf(null);
    if (emptySlot !== -1) {
      await this.playToBench(emptySlot);
    } else {
      this.toast.error('Tu banca está llena de Pokémon.');
      this.selectedHandCardIndex.set(null);
    }
  }

  public async attachEnergyToActiveDirect(index: number): Promise<void> {
    this.selectedHandCardIndex.set(index);
    await this.attachEnergyToActive();
  }

  public async useTrainerCardDirect(index: number): Promise<void> {
    this.selectedHandCardIndex.set(index);
    await this.useTrainerCard();
  }

  public async attackEnemy(): Promise<void> {
    if (!this.isMyTurn() || this.status() !== 'active') return;

    const active = this.playerActive();
    if (!active) {
      this.toast.error('Necesitas un Pokémon activo para atacar.');
      return;
    }

    if (active.hasAttackedThisTurn) {
      this.toast.error('Tu Pokémon ya ha realizado un ataque en este turno.');
      return;
    }

    const cost = active.card.cost ?? 0;
    if (active.attachedEnergy.length < cost) {
      this.toast.error(`Energía insuficiente. Requiere ${cost} energías cargadas para atacar.`);
      return;
    }

    const baseDamage = active.card.attack ?? 0;
    const boost = this.playerAttackBoost();
    const tempAtk = baseDamage + boost;

    const enemy = this.opponentActive();
    const logMsgs: string[] = [];

    if (enemy) {
      const originalDefense = enemy.card.defense ?? 0;
      const defense = Math.floor(originalDefense / 4); // Balanced: Defense blocks only 25% of its value
      const damage = Math.max(10, tempAtk - defense); // Guaranteed minimum of 10 damage!
      const nextHp = enemy.currentHp - damage;
      
      logMsgs.push(`¡[${this.playerDisplayName()}] ataca! Su ${active.card.name} inflige ${damage} de daño a ${enemy.card.name} (Defensa mitigada bloquea ${defense} de ${originalDefense} total).`);
      this.audio.playDamage();
      this.opponentActiveDamaged.set(true);
      setTimeout(() => this.opponentActiveDamaged.set(false), 500);

      if (nextHp <= 0) {
        this.opponentDiscard.update(prev => [...prev, { ...enemy, currentHp: 0 }]);
        this.opponentActive.set(null);
        logMsgs.push(`¡El Pokémon ${enemy.card.name} del oponente ha sido DESTRUIDO!`);
      } else {
        this.opponentActive.set({
          ...enemy,
          currentHp: nextHp
        });
      }
    } else {
      this.opponentLP.update(lp => Math.max(0, lp - tempAtk));
      logMsgs.push(`¡El oponente no tiene Pokémon activos! El ${active.card.name} de [${this.playerDisplayName()}] ataca DIRECTAMENTE a la red del rival infligiendo ${tempAtk} de daño.`);
      this.audio.playDamage();

      if (this.opponentLP() <= 0) {
        this.playerActive.set({
          ...active,
          hasAttackedThisTurn: true
        });
        if (this.isMultiplayer()) {
          await this.pushOnlineGameState(logMsgs);
          await this.triggerOnlineVictory();
        } else {
          logMsgs.forEach(msg => this.addLog(msg, 'attack'));
          this.triggerVictory('¡Puntos de red del CPU destruidos!');
        }
        return;
      }
    }

    this.playerActive.set({
      ...active,
      hasAttackedThisTurn: true
    });
    
    if (this.isMultiplayer()) {
      await this.pushOnlineGameState(logMsgs);
    } else {
      logMsgs.forEach(msg => this.addLog(msg, 'attack'));
    }
  }

  public async endTurn(): Promise<void> {
    if (!this.isMyTurn() || this.status() !== 'active') return;

    this.audio.playClick();

    // Reset player turn state flags reactively
    this.playerEnergyAttachedThisTurn.set(false);
    this.playerAttackBoost.set(0);
    
    const active = this.playerActive();
    if (active) {
      this.playerActive.set({
        ...active,
        hasAttackedThisTurn: false
      });
    }
    
    this.playerBench.update(prev => {
      return prev.map(b => b ? { ...b, hasAttackedThisTurn: false } : null);
    });

    const nextLogs = [`[${this.playerDisplayName()}] Finaliza su turno.`];

    if (this.isMultiplayer()) {
      const guestId = this.guestProfile()?.id;
      const hostId = this.hostProfile()?.id;
      const amIHost = this.myUserId() === hostId;
      const nextTurnUserId = amIHost ? guestId : hostId;
      
      this.turnOwnerId.set(nextTurnUserId);
      await this.pushOnlineGameState(nextLogs);
    } else {
      nextLogs.forEach(msg => this.addLog(msg, 'system'));
      this.turn.set('opponent');
      this.executeDrawPhase();
    }
  }

  // CPU AI TACTICS
  private runCpuAI(): void {
    if (this.status() !== 'active' || this.turn() !== 'opponent') return;

    this.addLog('[CPU] Analizando protocolos tácticos...', 'system');

    if (this.opponentActive() === null) {
      // 1. First, check if there are any Pokémon on the bench to promote!
      const benchedPkmns = this.opponentBench()
        .filter((b): b is BattleCard => b !== null)
        .sort((a, b) => (b.card.attack ?? 0) - (a.card.attack ?? 0));

      if (benchedPkmns.length > 0) {
        const bestBench = benchedPkmns[0];
        const benchIndex = this.opponentBench().findIndex(b => b?.battleId === bestBench.battleId);
        if (benchIndex !== -1) {
          this.opponentActive.set(bestBench);
          this.opponentBench.update(prev => {
            const copy = [...prev];
            copy[benchIndex] = null;
            return copy;
          });
          this.addLog(`[CPU] Promueve a ${bestBench.card.name} desde la banca al campo ACTIVO.`, 'info');
          this.audio.playDrawCard();
          this.cpuTimeoutId = setTimeout(() => this.cpuPhase2(), 250);
          return;
        }
      }

      // 2. If no bench Pokémon, check hand!
      const pkmnInHand = this.opponentHand()
        .filter(c => c.card.type === 'pokemon')
        .sort((a, b) => (b.card.attack ?? 0) - (a.card.attack ?? 0))[0];

      if (pkmnInHand) {
        this.opponentActive.set(pkmnInHand);
        this.opponentHand.update(prev => prev.filter(c => c.battleId !== pkmnInHand.battleId));
        this.addLog(`[CPU] Despliega a ${pkmnInHand.card.name} (ATK: ${pkmnInHand.card.attack}) como su Pokémon ACTIVO principal.`, 'info');
        this.audio.playDrawCard();
        this.cpuTimeoutId = setTimeout(() => this.cpuPhase2(), 250);
        return;
      }
    }

    const benchCopy = [...this.opponentBench()];
    for (let i = 0; i < 3; i++) {
      if (benchCopy[i] === null) {
        // Deploy best remaining stats cards to the bench
        const pkmnInHand = this.opponentHand()
          .filter(c => c.card.type === 'pokemon')
          .sort((a, b) => (b.card.attack ?? 0) - (a.card.attack ?? 0))[0];

        if (pkmnInHand) {
          benchCopy[i] = pkmnInHand;
          this.opponentHand.update(prev => prev.filter(c => c.battleId !== pkmnInHand.battleId));
          this.addLog(`[CPU] Envía a ${pkmnInHand.card.name} a su Banca.`, 'info');
          this.audio.playDrawCard();
          break;
        }
      }
    }
    this.opponentBench.set(benchCopy);
    this.cpuPhase2();
  }

  private cpuPhase2(): void {
    if (this.status() !== 'active' || this.turn() !== 'opponent') return;

    const active = this.opponentActive();
    const energyInHand = this.opponentHand().find(c => c.card.type === 'energy');

    if (active && energyInHand) {
      this.opponentActive.set({
        ...active,
        attachedEnergy: [...active.attachedEnergy, energyInHand.card]
      });
      this.opponentHand.update(prev => prev.filter(c => c.battleId !== energyInHand.battleId));
      this.opponentEnergyAttachedThisTurn.set(true);
      this.addLog(`[CPU] Carga 1 Energía a su Pokémon activo ${active.card.name}.`, 'energy');
      this.audio.playEnergyAttach();
    }
    this.cpuTimeoutId = setTimeout(() => this.cpuPhase3(), 250);
  }

  private cpuPhase3(): void {
    if (this.status() !== 'active' || this.turn() !== 'opponent') return;

    const trainerInHand = this.opponentHand().find(c => c.card.type === 'trainer');
    if (trainerInHand) {
      const effect = trainerInHand.card.effect;
      const active = this.opponentActive();
      let used = false;

      if (effect === 'HEAL_50' || effect === 'HEAL_100') {
        if (active && active.currentHp < (active.card.hp ?? 100)) {
          const healVal = effect === 'HEAL_50' ? 50 : 100;
          const nextHp = Math.min(active.card.hp ?? 100, active.currentHp + healVal);
          this.opponentActive.set({
            ...active,
            currentHp: nextHp
          });
          this.addLog(`[CPU] Activa "${trainerInHand.card.name}" y cura +${healVal} HP a ${active.card.name}.`, 'heal');
          this.audio.playHeal();
          used = true;
        }
      } else if (effect === 'DRAW_2') {
        for (let i = 0; i < 2; i++) {
          const c = this.drawFromDeck(this.opponentDeck);
          if (c) this.opponentHand.update(prev => [...prev, c]);
        }
        this.addLog(`[CPU] Activa "${trainerInHand.card.name}" y roba 2 cartas.`, 'trainer');
        used = true;
      }

      if (used) {
        this.opponentDiscard.update(prev => [...prev, trainerInHand]);
        this.opponentHand.update(prev => prev.filter(c => c.battleId !== trainerInHand.battleId));
      }
    }
    this.cpuTimeoutId = setTimeout(() => this.cpuPhase4(), 250);
  }

  private cpuPhase4(): void {
    if (this.status() !== 'active' || this.turn() !== 'opponent') return;

    const active = this.opponentActive();
    const cost = active?.card.cost ?? 0;

    if (active && active.attachedEnergy.length >= cost) {
      const dmg = active.card.attack ?? 0;
      const playerPkmn = this.playerActive();

      if (playerPkmn) {
        const originalDefense = playerPkmn.card.defense ?? 0;
        const defense = Math.floor(originalDefense / 4); // Balanced: Defense blocks only 25% of its value
        const damageDealt = Math.max(10, dmg - defense); // Guaranteed minimum of 10 damage!
        const nextHp = playerPkmn.currentHp - damageDealt;
        
        this.addLog(`[CPU] ¡${active.card.name} ataca a tu ${playerPkmn.card.name} infligiendo ${damageDealt} de daño! (Tu defensa bloquea ${defense} de ${originalDefense} total)`, 'attack');
        this.audio.playDamage();
        this.playerActiveDamaged.set(true);
        setTimeout(() => this.playerActiveDamaged.set(false), 500);

        if (nextHp <= 0) {
          this.playerDiscard.update(prev => [...prev, { ...playerPkmn, currentHp: 0 }]);
          this.playerActive.set(null);
          this.addLog(`[CPU] ¡Tu ${playerPkmn.card.name} ha sido DESTRUIDO!`, 'system');
        } else {
          this.playerActive.set({
            ...playerPkmn,
            currentHp: nextHp
          });
        }
      } else {
        this.playerLP.update(lp => Math.max(0, lp - dmg));
        this.addLog(`[CPU] ¡Ataca DIRECTAMENTE a tus puntos de red infligiendo ${dmg} de daño!`, 'attack');
        this.audio.playDamage();

        if (this.playerLP() <= 0) {
          this.triggerDefeat('El CPU ha destruido tu terminal.');
          return;
        }
      }
    }
    this.cpuTimeoutId = setTimeout(() => this.cpuEndTurn(), 250);
  }

  private cpuEndTurn(): void {
    if (this.status() !== 'active' || this.turn() !== 'opponent') return;

    this.opponentEnergyAttachedThisTurn.set(false);
    this.opponentAttackBoost.set(0);
    const active = this.opponentActive();
    if (active) {
      this.opponentActive.set({
        ...active,
        hasAttackedThisTurn: false
      });
    }

    this.turn.set('player');
    this.turnNumber.update(n => n + 1);
    this.addLog(`--- INICIA TURNO ${this.turnNumber()} ---`, 'system');
    this.executeDrawPhase();
  }

  // GAME OVER SENSORS
  private async triggerVictory(reason: string): Promise<void> {
    this.status.set('victory');
    this.audio.playVictory();
    this.addLog(`🏆 ¡VICTORIA! ${reason}`, 'victory');
    this.toast.show('🌟 ¡VICTORIA EN LA ARENA! Sincronizando recompensas... 🌟', 'success', 5000);

    // SQLite local match persistence hook: Save victory
    try {
      const matchId = Math.random().toString(36).substring(2, 9);
      await this.sqlite.query(
        `INSERT INTO local_matches (id, difficulty, opponent_name, result, lp_player, lp_opponent, date) VALUES (?, ?, ?, ?, ?, ?, ?);`,
        [matchId, this.difficulty, 'CPU AI', 'victory', this.playerLP(), this.opponentLP(), new Date().toISOString()]
      );
      await this.sqlite.query(
        `INSERT INTO local_history (id, log_type, description, timestamp) VALUES (?, ?, ?, ?);`,
        [Math.random().toString(36).substring(2, 9), 'battle_victory', `Duelo contra CPU ganado: ${reason}`, new Date().toISOString()]
      );
    } catch (sqle) {
      console.error('Error guardando partida ganada en SQLite:', sqle);
    }

    await this.profileService.recordMatch('Simulador CPU', 'victory');
  }

  private async triggerDefeat(reason: string): Promise<void> {
    this.status.set('defeat');
    this.audio.playDefeat();
    this.addLog(`💀 DERROTA: ${reason}`, 'defeat');
    this.toast.show('🔌 CONEXIÓN PERDIDA. Duelo finalizado con derrota.', 'error', 5000);

    // SQLite local match persistence hook: Save defeat
    try {
      const matchId = Math.random().toString(36).substring(2, 9);
      await this.sqlite.query(
        `INSERT INTO local_matches (id, difficulty, opponent_name, result, lp_player, lp_opponent, date) VALUES (?, ?, ?, ?, ?, ?, ?);`,
        [matchId, this.difficulty, 'CPU AI', 'defeat', this.playerLP(), this.opponentLP(), new Date().toISOString()]
      );
      await this.sqlite.query(
        `INSERT INTO local_history (id, log_type, description, timestamp) VALUES (?, ?, ?, ?);`,
        [Math.random().toString(36).substring(2, 9), 'battle_defeat', `Duelo contra CPU perdido: ${reason}`, new Date().toISOString()]
      );
    } catch (sqle) {
      console.error('Error guardando partida perdida en SQLite:', sqle);
    }

    await this.profileService.recordMatch('Simulador CPU', 'defeat');
  }

  private async triggerOnlineVictory(): Promise<void> {
    this.status.set('victory');
    this.audio.playVictory();
    clearInterval(this.multiplayerPollInterval);
    
    // Save winner status in rooms
    await this.supabase.client
      .from('multiplayer_rooms')
      .update({ status: 'finished', winner_id: this.myUserId() })
      .eq('id', this.roomId()!);

    this.toast.success('🏆 ¡VICTORIA ONLINE! Has ganado el duelo en la red.');
    await this.profileService.recordMatch(this.opponentDisplayName(), 'victory');
  }

  // CONSOLE EXIT/SURRENDER PROTOCOLS
  public openSurrenderModal(): void {
    this.audio.playClick();
    if (this.status() === 'active') {
      this.showSurrenderModal.set(true);
    } else {
      this.router.navigate(['/dashboard']);
    }
  }

  public closeSurrenderModal(): void {
    this.audio.playClick();
    this.showSurrenderModal.set(false);
  }

  public async confirmSurrender(): Promise<void> {
    this.showSurrenderModal.set(false);
    if (this.status() !== 'active') return;

    if (this.isMultiplayer()) {
      const roomId = this.roomId();
      clearInterval(this.multiplayerPollInterval);
      
      // Declare opponent winner
      const winnerId = this.myUserId() === this.hostProfile()?.id 
        ? this.guestProfile()?.id 
        : this.hostProfile()?.id;

      try {
        await this.supabase.client
          .from('multiplayer_rooms')
          .update({ status: 'finished', winner_id: winnerId })
          .eq('id', roomId!);
      } catch (e) {
        console.error(e);
      }

      this.status.set('defeat');
      this.audio.playDefeat();
      this.toast.error('Te has rendido. Conexión perdida.');
      await this.profileService.recordMatch(this.opponentDisplayName(), 'defeat');
    } else {
      this.triggerDefeat('Te has desconectado voluntariamente de la red.');
    }
  }
}
