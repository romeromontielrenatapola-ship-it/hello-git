-- ==========================================
-- GACHA SYSTEM UPDATE SCRIPT
-- Run this script in your Supabase SQL Editor
-- ==========================================

-- 1. Create rewards history for tracking latest pulled cards
CREATE TABLE IF NOT EXISTS public.rewards_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    card_id UUID REFERENCES public.cards(id) ON DELETE CASCADE NOT NULL,
    source TEXT NOT NULL, -- e.g., 'pack_opening'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rewards_history_user ON public.rewards_history(user_id);
ALTER TABLE public.rewards_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own rewards" ON public.rewards_history
    FOR SELECT USING (auth.uid() = user_id);

-- 2. Add Anti-Frustration (Pity) Counter to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS packs_without_epic INTEGER DEFAULT 0 NOT NULL;

-- 3. Modify rarity constraint to include 'epic' (if we rename ultra-rare or add epic)
ALTER TABLE public.cards DROP CONSTRAINT IF EXISTS cards_rarity_check;
ALTER TABLE public.cards ADD CONSTRAINT cards_rarity_check 
CHECK (rarity IN ('common', 'uncommon', 'rare', 'ultra-rare', 'epic', 'legendary'));

-- (Optional) Update ultra-rare to epic to match new standard
UPDATE public.cards SET rarity = 'epic' WHERE rarity = 'ultra-rare';

-- 4. Create the Pack Opening RPC
CREATE OR REPLACE FUNCTION public.open_pack(p_user_id UUID, p_pack_cost INTEGER DEFAULT 300)
RETURNS TABLE(
    id UUID,
    name TEXT,
    type TEXT,
    element TEXT,
    rarity TEXT,
    hp INTEGER,
    attack INTEGER,
    defense INTEGER,
    cost INTEGER,
    effect TEXT,
    image_url TEXT,
    description TEXT
) AS $$
DECLARE
    v_coins INTEGER;
    v_packs_without_epic INTEGER;
    v_card_record RECORD;
    v_random NUMERIC;
    v_selected_rarity TEXT;
    v_is_pity_roll BOOLEAN;
    v_cards_to_return UUID[] := '{}';
BEGIN
    -- Check coins and pity counter
    SELECT coins, packs_without_epic INTO v_coins, v_packs_without_epic 
    FROM public.profiles WHERE id = p_user_id;

    IF v_coins < p_pack_cost THEN
        RAISE EXCEPTION 'Not enough coins';
    END IF;

    -- Increment pity counter for this pack
    v_packs_without_epic := v_packs_without_epic + 1;
    v_is_pity_roll := (v_packs_without_epic >= 10);

    -- Deduct coins and update packs counter (reset if pity roll)
    UPDATE public.profiles 
    SET coins = coins - p_pack_cost, 
        xp = xp + 10,
        packs_without_epic = CASE WHEN v_is_pity_roll THEN 0 ELSE v_packs_without_epic END
    WHERE id = p_user_id;

    -- Draw 5 cards
    FOR i IN 1..5 LOOP
        v_random := random();
        v_selected_rarity := 'common';

        IF i = 5 AND v_is_pity_roll THEN
            -- Forced Epic or Legendary on the last card of the 10th pack
            IF v_random < 0.20 THEN
                v_selected_rarity := 'legendary';
            ELSE
                v_selected_rarity := 'epic';
            END IF;
        ELSE
            -- Normal probabilities: Common: 70%, Rare: 20%, Epic: 8%, Legendary: 2%
            IF v_random < 0.02 THEN
                v_selected_rarity := 'legendary';
            ELSIF v_random < 0.10 THEN
                v_selected_rarity := 'epic';
            ELSIF v_random < 0.30 THEN
                v_selected_rarity := 'rare';
            ELSE
                v_selected_rarity := 'common';
            END IF;
        END IF;

        -- Select a random card of that rarity
        SELECT * INTO v_card_record FROM public.cards 
        WHERE rarity = v_selected_rarity
        ORDER BY random() LIMIT 1;
        
        -- Fallback if no card found (e.g., if there are no 'epic' cards yet)
        IF NOT FOUND THEN
             SELECT * INTO v_card_record FROM public.cards ORDER BY random() LIMIT 1;
        END IF;

        -- Record the drawn card
        v_cards_to_return := array_append(v_cards_to_return, v_card_record.id);

        -- Reset pity counter if we hit an Epic or Legendary organically
        IF v_card_record.rarity IN ('epic', 'legendary') THEN
            UPDATE public.profiles SET packs_without_epic = 0 WHERE id = p_user_id;
        END IF;

        -- Update user collection (upsert)
        INSERT INTO public.user_collection (user_id, card_id, quantity)
        VALUES (p_user_id, v_card_record.id, 1)
        ON CONFLICT (user_id, card_id) 
        DO UPDATE SET quantity = public.user_collection.quantity + 1;

        -- Update rewards history
        INSERT INTO public.rewards_history (user_id, card_id, source)
        VALUES (p_user_id, v_card_record.id, 'pack_opening');
        
    END LOOP;

    -- Return the actual cards drawn
    RETURN QUERY
    SELECT c.id, c.name, c.type, c.element, c.rarity, c.hp, c.attack, c.defense, c.cost, c.effect, c.image_url, c.description
    FROM public.cards c
    JOIN unnest(v_cards_to_return) WITH ORDINALITY t(card_id, ord) ON c.id = t.card_id
    ORDER BY t.ord;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
