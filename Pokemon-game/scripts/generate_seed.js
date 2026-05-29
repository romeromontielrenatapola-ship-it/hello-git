const fs = require('fs');

const supabaseUrl = 'https://wdwozqxgtyojipfnmumt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indkd296cXhndHlvamlwZm5tdW10Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5MTE5MzMsImV4cCI6MjA5NTQ4NzkzM30.wUmVdKKnWW3ZyuxtLkQ-uZASVh-b1smRfsWLiG8e7hQ';

async function fetchAllPokemon() {
    console.log('Fetching list of all Pokémon from PokeAPI...');
    const res = await fetch('https://pokeapi.co/api/v2/pokemon?limit=1025');
    const data = await res.json();
    return data.results;
}

async function fetchPokemonDetails(url) {
    const res = await fetch(url);
    return res.json();
}

function determineElement(types) {
    const mainType = types[0].type.name;
    const typeMap = {
        fire: 'fire', water: 'water', electric: 'electric',
        grass: 'grass', bug: 'grass', dark: 'dark',
        ghost: 'dark', poison: 'dark', psychic: 'light',
        fairy: 'light', normal: 'colorless', fighting: 'colorless',
        flying: 'colorless', ground: 'colorless', rock: 'colorless',
        steel: 'colorless', ice: 'water', dragon: 'colorless'
    };
    return typeMap[mainType] || 'colorless';
}

function determineRarity(totalStats) {
    if (totalStats >= 600) return 'legendary';
    if (totalStats >= 500) return 'epic';
    if (totalStats >= 400) return 'rare';
    if (totalStats >= 300) return 'uncommon';
    return 'common';
}

async function importToSupabase() {
    const pokemonList = await fetchAllPokemon();
    console.log(`Starting import of ${pokemonList.length} Pokemon directly into Supabase...`);
    
    // Process in batches of 10 to speed up
    for (let i = 0; i < pokemonList.length; i += 10) {
        const batch = pokemonList.slice(i, i + 10);
        await Promise.all(batch.map(async (poke) => {
            try {
                const p = await fetchPokemonDetails(poke.url);
                const hpStat = p.stats.find(s => s.stat.name === 'hp').base_stat;
                const atkStat = p.stats.find(s => s.stat.name === 'attack').base_stat;
                const defStat = p.stats.find(s => s.stat.name === 'defense').base_stat;
                const totalStats = p.stats.reduce((acc, curr) => acc + curr.base_stat, 0);
                
                const hp = hpStat * 2;
                const element = determineElement(p.types);
                const rarity = determineRarity(totalStats);
                const cost = Math.ceil(totalStats / 150);
                const imageUrl = p.sprites.other['official-artwork'].front_default || p.sprites.front_default;
                const name = p.name.charAt(0).toUpperCase() + p.name.slice(1).replace('-', ' ');
                
                const rpcBody = {
                    c_name: name,
                    c_type: 'pokemon',
                    c_element: element,
                    c_rarity: rarity,
                    c_hp: hp,
                    c_attack: atkStat,
                    c_defense: defStat,
                    c_cost: cost,
                    c_image_url: imageUrl,
                    c_description: 'Datos recuperados de PokeAPI. Oficial Artwork HD.'
                };

                const res = await fetch(`${supabaseUrl}/rest/v1/rpc/admin_insert_card`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': supabaseKey,
                        'Authorization': `Bearer ${supabaseKey}`
                    },
                    body: JSON.stringify(rpcBody)
                });
                
                if (!res.ok) {
                    console.error(`Error inserting ${name}: ${res.statusText}`);
                } else {
                    console.log(`Inserted: ${name}`);
                }
            } catch (e) {
                console.error(`Failed to process ${poke.name}`, e);
            }
        }));
    }
    
    console.log('IMPORT COMPLETE!');
}

importToSupabase();
