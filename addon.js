const express = require('express');
const cors = require('cors');
const { addonBuilder, getRouter } = require('stremio-addon-sdk');
const fetch = require('node-fetch');

// --- CONFIGURATION ---
// These values are now fetched from Render's environment variables for security and flexibility.
const TMDB_API_KEY = process.env.TMDB_API_KEY || 'YOUR_TMDB_API_KEY_HERE';
const LOCAL_SERVER_PUBLIC_IP = process.env.LOCAL_SERVER_PUBLIC_IP || 'YOUR_PUBLIC_IP_HERE';

const PEERFLIX_SERVER_URL = `http://${LOCAL_SERVER_PUBLIC_IP}:8000/stream`;
const ADDON_PORT = process.env.PORT || 7000; // Render provides the PORT variable
const PEERFLIX_STREAM_URL = `http://${LOCAL_SERVER_PUBLIC_IP}:8888`;

// --- ADDON MANIFEST ---
const manifest = {
    id: 'com.boxy.render.addon',
    version: '1.0.0',
    name: 'Boxy Peerflix (Cloud)',
    description: 'A cloud-hosted addon that connects to a local Peerflix server.',
    resources: ['stream'],
    types: ['movie'],
    idPrefixes: ['tt'],
    catalogs: []
};

const builder = new addonBuilder(manifest);

// --- STREAM HANDLER ---
builder.defineStreamHandler(async (args) => {
    if (args.type === 'movie' && args.id) {
        console.log(`Stremio requested stream for movie: ${args.id}`);
        try {
            const tmdbUrl = `https://api.themoviedb.org/3/find/${args.id}?api_key=${TMDB_API_KEY}&external_source=imdb_id`;
            const tmdbResponse = await fetch(tmdbUrl);
            const tmdbData = await tmdbResponse.json();
            if (!tmdbData.movie_results || tmdbData.movie_results.length === 0) throw new Error('Movie not found on TMDB.');

            const movie = tmdbData.movie_results[0];
            const title = movie.title;
            const year = movie.release_date ? movie.release_date.substring(0, 4) : null;
            
            await fetch(PEERFLIX_SERVER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, year })
            });

            const stream = { url: PEERFLIX_STREAM_URL, title: 'Cloud Stream', name: 'Boxy (Cloud)' };
            return Promise.resolve({ streams: [stream] });
        } catch (error) {
            console.error('Addon Error:', error.message);
            return Promise.resolve({ streams: [] });
        }
    } else {
        return Promise.resolve({ streams: [] });
    }
});

// --- EXPRESS SERVER SETUP ---
const app = express();
app.use(cors());
const addonInterface = builder.getInterface();
app.use(getRouter(addonInterface));

app.listen(ADDON_PORT, () => {
    console.log(`Cloud addon is running on port ${ADDON_PORT}`);
});
