import {
  Component, Input, Output, EventEmitter,
  ElementRef, HostListener, ViewChild, signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Card } from '../../../core/models/card.model';

@Component({
  selector: 'app-card',
  standalone: true,
  imports: [CommonModule],
  styleUrl: './card.component.css',
  template: `
    <div class="card-wrapper" (click)="onClick()" #wrapperEl>
      <div 
        class="card-inner {{ card.element || 'colorless' }} {{ card.type }}"
        [class.selected]="selected"
        [class.grayed]="grayed"
        (mousemove)="onMouseMove($event)"
        (mouseleave)="onMouseLeave()">

        @if (card.type === 'energy') {
          <!-- Energy card design -->
          <div class="card-header">
            <span class="card-name">{{ card.name }}</span>
            <span class="hp-label text-neon-yellow">⚡</span>
          </div>
          <div class="energy-illustration-box">
            <div class="energy-icon-large">{{ elementEmoji(card.element) }}</div>
            <div class="pills-row">
              <span class="pill pill-element {{ card.element }}">{{ elementLabel(card.element) | uppercase }}</span>
              <span class="pill pill-rarity">ENERGÍA</span>
            </div>
          </div>
          <div class="card-body">
            <div class="lore-text-box">
              <p class="lore-text">{{ loreText(card) }}</p>
            </div>
          </div>
        } @else {
          <!-- Pokemon or Trainer card design -->
          <div class="card-header">
            <span class="card-name">{{ card.name }}</span>
            @if (card.type === 'pokemon') {
              <span class="hp-label">HP <span class="hp-value">{{ card.hp }}</span></span>
            } @else {
              <span class="hp-label text-neon-purple">SOPORTE</span>
            }
          </div>

          <!-- Card illustration box -->
          <div class="card-image-box">
            <img [src]="card.image_url || '/assets/cards/placeholder.png'"
                 [alt]="card.name"
                 class="card-illustration"
                 onerror="this.src='/assets/cards/placeholder.png'">
            
            <div class="pills-row">
              <span class="pill pill-element {{ card.element || 'colorless' }}">
                {{ elementEmoji(card.element) }} {{ elementLabel(card.element) | uppercase }}
              </span>
              <span class="pill pill-rarity {{ card.rarity }}">
                {{ rarityLabel(card.rarity) | uppercase }}
              </span>
            </div>
          </div>

          <!-- Stats / Progress Bars -->
          <div class="card-body">
            @if (card.type === 'pokemon') {
              <div class="stats-bars-section">
                <div class="stat-bar-row">
                  <span class="stat-label">ATAQUE</span>
                  <div class="progress-track">
                    <div class="progress-fill attack-fill" [style.width.%]="getStatPercent(card.attack, 120)"></div>
                  </div>
                  <span class="stat-value attack-value">{{ card.attack || 0 }}</span>
                </div>
                
                <div class="stat-bar-row">
                  <span class="stat-label">DEFENSA</span>
                  <div class="progress-track">
                    <div class="progress-fill defense-fill" [style.width.%]="getStatPercent(card.defense, 100)"></div>
                  </div>
                  <span class="stat-value defense-value">{{ card.defense || 0 }}</span>
                </div>
              </div>

              <!-- Ability box -->
              <div class="ability-box">
                <div class="ability-title">⚡ HABILIDAD</div>
                <div class="ability-name-row">{{ abilityName(card.element) }}</div>
                <div class="ability-desc">{{ abilityDescription(card.element) }}</div>
              </div>
            } @else if (card.type === 'trainer') {
              <!-- Trainer Special Code box -->
              <div class="ability-box trainer-box">
                <div class="ability-title text-neon-purple">💾 CÓDIGO EJECUTABLE</div>
                <div class="ability-name-row text-neon-purple">{{ card.name }}</div>
                <div class="ability-desc">{{ card.effect ? trainerEffectLabel(card.effect) : 'Aplica un parche al sistema de combate activo.' }}</div>
              </div>
            }

            <!-- Flavor text / Lore -->
            <div class="lore-text-box">
              <p class="lore-text">{{ loreText(card) }}</p>
            </div>
          </div>
        }

        <!-- Rarity bottom strip -->
        <div class="card-rarity-strip rarity-strip-{{ card.rarity }}"></div>

        <!-- Quantity badge -->
        @if (quantity !== null && quantity !== undefined) {
          <div class="qty-badge">x{{ quantity }}</div>
        }

      </div>
    </div>
  `
})
export class CardComponent {
  @Input({ required: true }) card!: Card;
  @Input() selected = false;
  @Input() grayed = false;
  @Input() quantity: number | null = null;

  @Output() cardClick = new EventEmitter<Card>();
  @ViewChild('wrapperEl') wrapperEl!: ElementRef<HTMLDivElement>;

  onClick(): void {
    this.cardClick.emit(this.card);
  }

  onMouseMove(event: MouseEvent): void {
    const el = (event.currentTarget as HTMLElement);
    const rect = el.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const rotX = ((y - cy) / cy) * -12;
    const rotY = ((x - cx) / cx) * 12;
    el.style.transform = `rotateX(${rotX}deg) rotateY(${rotY}deg) scale(1.05)`;
  }

  onMouseLeave(): void {
    const cards = this.wrapperEl?.nativeElement.querySelectorAll('.card-inner');
    cards?.forEach((el: Element) => {
      (el as HTMLElement).style.transform = '';
    });
  }

  elementEmoji(element?: string): string {
    const map: Record<string, string> = {
      fire: '🔥', water: '💧', electric: '⚡', grass: '🌿',
      dark: '🌑', light: '☀️', colorless: '⭐'
    };
    return element ? (map[element] ?? '⭐') : '⭐';
  }

  elementLabel(element?: string): string {
    const map: Record<string, string> = {
      fire: 'Fuego', water: 'Agua', electric: 'Eléctrico', grass: 'Planta',
      dark: 'Siniestro', light: 'Lumínico', colorless: 'Neutral'
    };
    return element ? (map[element] ?? 'Neutral') : 'Neutral';
  }

  rarityLabel(rarity: string): string {
    const map: Record<string, string> = {
      common: 'Común', uncommon: 'Poco Común', rare: 'Raro',
      'ultra-rare': 'Ultra Raro', epic: 'Épico', legendary: 'Legendario'
    };
    return map[rarity] ?? rarity;
  }

  abilityName(element?: string): string {
    const map: Record<string, string> = {
      fire: 'Llama Solar', water: 'Marea Alta', electric: 'Relámpago',
      grass: 'Espora Curativa', dark: 'Sombra Oscura', light: 'Resplandor',
      colorless: 'Viento Rápido'
    };
    return element ? (map[element] ?? 'Poder Oculto') : 'Poder Oculto';
  }

  abilityDescription(element?: string): string {
    const map: Record<string, string> = {
      fire: 'Llama Solar: Incrementa el daño infligido en +15 al atacar en este turno.',
      water: 'Marea Alta: Recupera +20 HP al final de cada turno activo.',
      electric: 'Relámpago: Ignora por completo la defensa del oponente al infligir daño.',
      grass: 'Espora Curativa: Limpia cualquier efecto nocivo y reduce el daño recibido en -10.',
      dark: 'Sombra Oscura: Reduce el ataque entrante del rival en -20 puntos de daño.',
      light: 'Resplandor: Aumenta tus Life Points en +50 al entrar a la arena.',
      colorless: 'Viento Rápido: Roba 1 carta adicional al robar al inicio de tu turno.'
    };
    return element ? (map[element] ?? 'Efecto latente no catalogado.') : 'Efecto latente no catalogado.';
  }

  getStatPercent(val: number | undefined, max: number): number {
    if (!val) return 10;
    return Math.min(100, Math.max(10, (val / max) * 100));
  }

  trainerEffectLabel(effect: string): string {
    const map: Record<string, string> = {
      'HEAL_50': 'Efecto: Curar +50 HP de tus Pokémon.',
      'HEAL_100': 'Efecto: Curar +100 HP de tus Pokémon.',
      'DRAW_2': 'Efecto: Roba 2 cartas adicionales del mazo.',
      'DRAW_ENERGY': 'Efecto: Busca y añade 1 Energía a tu mano.',
      'BOOST_ATTACK_30': 'Efecto: Añade +30 de daño de ataque este turno.'
    };
    return map[effect] ?? effect;
  }

  loreText(card: Card): string {
    if (card.type === 'trainer') {
      return card.description || 'Código de apoyo táctico autorizado para uso inmediato en combate.';
    }
    if (card.type === 'energy') {
      return 'Energía elemental canalizada desde los servidores centrales.';
    }
    
    if (card.description && !card.description.includes('Importado')) {
      return card.description;
    }
    
    const map: Record<string, string> = {
      Abra: 'Un Pokémon de tipo Psíquico sumamente poderoso, conocido por su valor y destreza en combates estratégicos dentro de la Arena Pokémon.',
      Pikachu: 'Acumula electricidad en sus mejillas. Cuando libera esta energía, desata relámpagos devastadores en la arena.',
      Charizard: 'Vuela por el cielo en busca de oponentes fuertes. Escupe un fuego tan cálido que puede derretir cualquier defensa.',
      Blastoise: 'Un Pokémon brutal con cañones de agua presurizada en su caparazón. Sus disparos de alta precisión destruyen blindajes.',
      Venusaur: 'La flor de su lomo absorbe la luz solar para convertirla en energía pura, liberando esporas curativas al entorno.'
    };
    
    return map[card.name] ?? `Un Pokémon legendario del ciberespacio, catalogado con el código nacional #${card.id.substring(0, 4).toUpperCase()}. Su poder e influencia en la arena son invaluables.`;
  }
}
