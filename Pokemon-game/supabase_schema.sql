-- ==========================================
-- POKÉMON & YU-GI-OH CYBER-TCG DATABASE SCHEMA
-- Paste this script into your Supabase SQL Editor
-- ==========================================

-- Enable pgcrypto for UUIDs (usually enabled by default)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- DROP TABLES IF THEY EXIST (for clean installations)
DROP TABLE IF EXISTS public.daily_missions CASCADE;
DROP TABLE IF EXISTS public.matches CASCADE;
DROP TABLE IF EXISTS public.deck_cards CASCADE;
DROP TABLE IF EXISTS public.decks CASCADE;
DROP TABLE IF EXISTS public.user_collection CASCADE;
DROP TABLE IF EXISTS public.cards CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- 1. PROFILES (Trainer Profile)
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT UNIQUE NOT NULL,
    avatar_url TEXT,
    xp INTEGER DEFAULT 0 NOT NULL,
    level INTEGER DEFAULT 1 NOT NULL,
    coins INTEGER DEFAULT 150 NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. CARDS (Global Card Catalog)
CREATE TABLE public.cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('pokemon', 'trainer', 'energy')),
    element TEXT CHECK (element IN ('fire', 'water', 'electric', 'grass', 'dark', 'light', 'colorless')),
    rarity TEXT NOT NULL CHECK (rarity IN ('common', 'uncommon', 'rare', 'epic', 'ultra-rare', 'legendary')),
    hp INTEGER, -- Only for pokemon
    attack INTEGER, -- Attack damage
    defense INTEGER DEFAULT 0, -- Damage reduction
    cost INTEGER DEFAULT 0, -- Attack or play energy cost
    effect TEXT, -- Special actions for spell/trainer cards: 'HEAL_50', 'DRAW_2', 'DRAW_ENERGY', 'BOOST_ATTACK_30', 'HEAL_100'
    image_url TEXT,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. USER COLLECTION (Trainer Owned Cards)
CREATE TABLE public.user_collection (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    card_id UUID REFERENCES public.cards(id) ON DELETE CASCADE NOT NULL,
    quantity INTEGER DEFAULT 1 NOT NULL CHECK (quantity >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id, card_id)
);

-- 4. DECKS
CREATE TABLE public.decks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL DEFAULT 'Nuevo Mazo',
    is_active BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. DECK CARDS (Relationship between Deck and Card)
CREATE TABLE public.deck_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deck_id UUID REFERENCES public.decks(id) ON DELETE CASCADE NOT NULL,
    card_id UUID REFERENCES public.cards(id) ON DELETE CASCADE NOT NULL,
    quantity INTEGER DEFAULT 1 NOT NULL CHECK (quantity > 0 AND quantity <= 3), -- Limit 3 copies of same card
    UNIQUE(deck_id, card_id)
);

-- 6. MATCH HISTORY
CREATE TABLE public.matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    opponent_name TEXT NOT NULL,
    result TEXT NOT NULL CHECK (result IN ('victory', 'defeat')),
    xp_gained INTEGER NOT NULL,
    coins_gained INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. DAILY MISSIONS
CREATE TABLE public.daily_missions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('win_battle', 'play_cards', 'deal_damage')),
    reward_xp INTEGER NOT NULL,
    reward_coins INTEGER NOT NULL,
    target_value INTEGER NOT NULL,
    current_value INTEGER DEFAULT 0 NOT NULL,
    is_completed BOOLEAN DEFAULT false NOT NULL,
    is_claimed BOOLEAN DEFAULT false NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 8. REWARDS HISTORY (Pack opening log)
CREATE TABLE public.rewards_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    card_id UUID REFERENCES public.cards(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- INDEXES FOR MAXIMUM QUERY PERFORMANCE
CREATE INDEX idx_user_collection_user ON public.user_collection(user_id);
CREATE INDEX idx_deck_cards_deck ON public.deck_cards(deck_id);
CREATE INDEX idx_decks_user ON public.decks(user_id);
CREATE INDEX idx_matches_user ON public.matches(user_id);
CREATE INDEX idx_daily_missions_user ON public.daily_missions(user_id);

-- ==========================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_collection ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deck_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_missions ENABLE ROW LEVEL SECURITY;

-- 1. Profiles RLS
CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles
    FOR SELECT USING (true);

CREATE POLICY "Users can update their own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- 2. Cards RLS
CREATE POLICY "Cards are viewable by everyone" ON public.cards
    FOR SELECT USING (true);

-- 3. User Collection RLS
CREATE POLICY "Users can view their own collection" ON public.user_collection
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert/update their own collection" ON public.user_collection
    FOR ALL USING (auth.uid() = user_id);

-- 4. Decks RLS
CREATE POLICY "Users can view their own decks" ON public.decks
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own decks" ON public.decks
    FOR ALL USING (auth.uid() = user_id);

-- 5. Deck Cards RLS
CREATE POLICY "Users can view cards of their own decks" ON public.deck_cards
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM public.decks WHERE id = deck_cards.deck_id AND user_id = auth.uid()
    ));

CREATE POLICY "Users can manage cards of their own decks" ON public.deck_cards
    FOR ALL USING (EXISTS (
        SELECT 1 FROM public.decks WHERE id = deck_cards.deck_id AND user_id = auth.uid()
    ));

-- 6. Matches RLS
CREATE POLICY "Users can view their own match history" ON public.matches
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own matches" ON public.matches
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 7. Daily Missions RLS
CREATE POLICY "Users can view their own missions" ON public.daily_missions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own missions" ON public.daily_missions
    FOR ALL USING (auth.uid() = user_id);


-- ==========================================
-- INSERTING THE GLOBAL CARD CATALOG
-- ==========================================

INSERT INTO public.cards (id, name, type, element, rarity, hp, attack, defense, cost, effect, image_url, description) VALUES
-- Pokémon (10 Cards)
('f1000000-0000-0000-0000-000000000001', 'Pikachu', 'pokemon', 'electric', 'common', 60, 30, 10, 1, NULL, '/assets/cards/pikachu.png', 'Impactrueno cibernético. Pequeño pero con alto voltaje neón.'),
('f1000000-0000-0000-0000-000000000002', 'Charizard', 'pokemon', 'fire', 'legendary', 160, 90, 20, 3, NULL, '/assets/cards/charizard.png', 'Llamarada devastadora. Domina la arena con llamas incandescentes.'),
('f1000000-0000-0000-0000-000000000003', 'Blastoise', 'pokemon', 'water', 'rare', 130, 60, 30, 2, NULL, '/assets/cards/blastoise.png', 'Cañón de plasma hidroeléctrico. Su coraza detiene cualquier impacto.'),
('f1000000-0000-0000-0000-000000000004', 'Venusaur', 'pokemon', 'grass', 'rare', 140, 50, 20, 2, NULL, '/assets/cards/venusaur.png', 'Giga drenado biótico. Regenera energía vital de la naturaleza cibernética.'),
('f1000000-0000-0000-0000-000000000005', 'Mewtwo', 'pokemon', 'dark', 'legendary', 120, 100, 10, 3, NULL, '/assets/cards/mewtwo.png', 'Ruptura mental. Creado en laboratorios oscuros para doblegar voluntades.'),
('f1000000-0000-0000-0000-000000000006', 'Eevee', 'pokemon', 'colorless', 'common', 50, 20, 10, 1, NULL, '/assets/cards/eevee.png', 'Mutación inestable. Capaz de adaptarse a cualquier red elemental.'),
('f1000000-0000-0000-0000-000000000007', 'Gengar', 'pokemon', 'dark', 'rare', 90, 50, 10, 2, NULL, '/assets/cards/gengar.png', 'Pesadilla holográfica. Se oculta en las sombras digitales para asustar al CPU.'),
('f1000000-0000-0000-0000-000000000008', 'Dragonite', 'pokemon', 'colorless', 'ultra-rare', 150, 80, 20, 3, NULL, '/assets/cards/dragonite.png', 'Hiperrayo orbital. Un dragón de datos capaz de surcar los cielos de la red.'),
('f1000000-0000-0000-0000-000000000009', 'Lucario', 'pokemon', 'colorless', 'uncommon', 95, 45, 15, 2, NULL, '/assets/cards/lucario.png', 'Esfera áurica. Siente la corriente de datos del oponente para golpear con precisión.'),
('f1000000-0000-0000-0000-000000000010', 'Snorlax', 'pokemon', 'colorless', 'uncommon', 180, 30, 20, 2, NULL, '/assets/cards/snorlax.png', 'Bloqueo masivo. Su colosal base de datos resiste una cantidad masiva de daño.'),

-- Energies (5 Cards)
('f2000000-0000-0000-0000-000000000001', 'Energía Fuego', 'energy', 'fire', 'common', NULL, NULL, NULL, NULL, NULL, '/assets/cards/energy_fire.png', 'Poder de ignición térmica para activar ataques de elemento Fuego.'),
('f2000000-0000-0000-0000-000000000002', 'Energía Agua', 'energy', 'water', 'common', NULL, NULL, NULL, NULL, NULL, '/assets/cards/energy_water.png', 'Poder de refrigeración líquida para activar ataques de elemento Agua.'),
('f2000000-0000-0000-0000-000000000003', 'Energía Eléctrica', 'energy', 'electric', 'common', NULL, NULL, NULL, NULL, NULL, '/assets/cards/energy_electric.png', 'Corriente de alta tensión para activar ataques de elemento Eléctrico.'),
('f2000000-0000-0000-0000-000000000004', 'Energía Planta', 'energy', 'grass', 'common', NULL, NULL, NULL, NULL, NULL, '/assets/cards/energy_grass.png', 'Biomasa sintética para activar ataques de elemento Planta.'),
('f2000000-0000-0000-0000-000000000005', 'Energía Púrpura/Oscura', 'energy', 'dark', 'common', NULL, NULL, NULL, NULL, NULL, '/assets/cards/energy_dark.png', 'Frecuencias de interferencia para activar ataques de elemento Oscuro.'),

-- Trainer/Spell Cards (5 Cards)
('f3000000-0000-0000-0000-000000000001', 'Investigación de Profesor', 'trainer', NULL, 'common', NULL, NULL, NULL, NULL, 'DRAW_2', '/assets/cards/prof_research.png', 'Sobrecarga de datos. Roba 2 cartas de tu mazo inmediatamente.'),
('f3000000-0000-0000-0000-000000000002', 'Poción de Vida', 'trainer', NULL, 'common', NULL, NULL, NULL, NULL, 'HEAL_50', '/assets/cards/potion.png', 'Nanobots de reparación. Restaura 50 HP a tu Pokémon activo.'),
('f3000000-0000-0000-0000-000000000003', 'Búsqueda de Energía', 'trainer', NULL, 'common', NULL, NULL, NULL, NULL, 'DRAW_ENERGY', '/assets/cards/energy_search.png', 'Escanear red. Roba 1 carta de energía aleatoria de tu mazo a tu mano.'),
('f3000000-0000-0000-0000-000000000004', 'Hiperpoción', 'trainer', NULL, 'rare', NULL, NULL, NULL, NULL, 'HEAL_100', '/assets/cards/hyper_potion.png', 'Restauración crítica. Restaura 100 HP a tu Pokémon activo.'),
('f3000000-0000-0000-0000-000000000005', 'Espada del Caos', 'trainer', NULL, 'ultra-rare', NULL, NULL, NULL, NULL, 'BOOST_ATTACK_30', '/assets/cards/chaos_sword.png', 'Inyección de troyano agresivo. Aumenta el ataque de tu Pokémon activo en +30 en este turno.');


-- ==========================================
-- ONBOARDING TRIGGER (AUTOMATIC PLAYER PROFILE SETUP)
-- ==========================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    starter_deck_id UUID;
    card_rec RECORD;
BEGIN
    -- 1. Create trainer profile
    INSERT INTO public.profiles (id, username, avatar_url, xp, level, coins)
    VALUES (
        new.id,
        COALESCE(new.raw_user_meta_data->>'username', 'Entrenador_' || substring(new.id::text from 1 for 6)),
        COALESCE(new.raw_user_meta_data->>'avatar_url', '/assets/avatars/avatar_default.png'),
        0, 1, 150
    );

    -- 2. Populate user starting collection
    -- Give them 4 copies of commons/uncommons/rares, 1 copy of legendary/ultra-rares, and 10 copies of all energies.
    FOR card_rec IN SELECT id, rarity, type FROM public.cards LOOP
        IF card_rec.type = 'energy' THEN
            INSERT INTO public.user_collection (user_id, card_id, quantity)
            VALUES (new.id, card_rec.id, 10);
        ELSIF card_rec.rarity IN ('legendary', 'ultra-rare') THEN
            INSERT INTO public.user_collection (user_id, card_id, quantity)
            VALUES (new.id, card_rec.id, 1);
        ELSE
            INSERT INTO public.user_collection (user_id, card_id, quantity)
            VALUES (new.id, card_rec.id, 4);
        END IF;
    END LOOP;

    -- 3. Generate starting daily missions (3 missions)
    INSERT INTO public.daily_missions (user_id, title, description, type, reward_xp, reward_coins, target_value, current_value)
    VALUES
    (new.id, 'Primera Victoria', 'Gana un duelo contra el CPU en cualquier dificultad.', 'win_battle', 100, 50, 1, 0),
    (new.id, 'Sobrecarga de Energía', 'Juega 5 cartas de energía en tus Pokémon.', 'play_cards', 50, 25, 5, 0),
    (new.id, 'Daño Crítico', 'Inflige un total de 150 puntos de daño al CPU.', 'deal_damage', 75, 35, 150, 0);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Bind the trigger to Supabase auth.users
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
