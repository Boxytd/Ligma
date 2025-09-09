const express = require('express');
const cors = require('cors');
const { addonBuilder, getRouter } = require('stremio-addon-sdk');
const fetch = require('node-fetch');

// --- CONFIGURATION ---
// The API key is securely read from an environment variable on the cloud host (Vercel/Render).
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const ADDON_PORT = process.env.PORT || 10000; // The cloud host provides the PORT

// --- ADDON MANIFEST ---
const manifest = {
    id: 'com.boxy.vercel.addon',
    version: '1.0.0',
    name: 'Boxy Peerflix (Vercel)',
    description: 'A cloud-hosted addon that connects to a custom backend server.',
    resources: ['stream'],
    types: ['movie', 'series'],
    idPrefixes: ['tt'],
    catalogs: [],
    // This tells Stremio that the addon requires user configuration upon installation.
    behaviorHints: {
        configurable: true,
        configurationRequired: true
    }
};

const builder = new addonBuilder(manifest);

// --- STREAM HANDLER ---
builder.defineStreamHandler(async (args) => {
    // It checks for the custom backend URLs from the user's configuration.
    if (!args.config || !args.config.backend_url || !args.config.stream_url) {
        console.error('Addon has not been configured with backend URLs.');
        return Promise.resolve({ streams: [] });
    }

    if ((args.type === 'movie' || args.type === 'series') && args.id) {
        try {
            const tmdbUrl = `https://api.themoviedb.org/3/find/${args.id}?api_key=${TMDB_API_KEY}&external_source=imdb_id`;
            const tmdbResponse = await fetch(tmdbUrl);
            const tmdbData = await tmdbResponse.json();
            
            let media, title, year;
            if (tmdbData.movie_results && tmdbData.movie_results.length > 0) {
                media = tmdbData.movie_results[0]; title = media.title; year = media.release_date ? media.release_date.substring(0, 4) : null;
            } else if (tmdbData.tv_results && tmdbData.tv_results.length > 0) {
                media = tmdbData.tv_results[0]; title = media.name; year = media.first_air_date ? media.first_air_date.substring(0, 4) : null;
            } else { throw new Error('Media not found on TMDB.'); }

            // It uses the configured URL to talk to your backend (wherever it is).
            const peerflixServerUrl = `${args.config.backend_url}/stream`;
            await fetch(peerflixServerUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, year })
            });

            // It tells Stremio to play the video from the other configured URL.
            const stream = { url: args.config.stream_url, title: 'Custom Backend Stream', name: 'Boxy (Vercel)' };
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

const configureHtml = `
<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Boxy Addon Configuration</title><link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet"><style>body{background-color:#212529;color:white;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:1rem}.container{max-width:600px;text-align:center}#install_link{font-size:.8rem}</style></head><body><div class="container"><h1 class="mb-4">Configure Your Custom Backend</h1><p class="lead">Provide the public URLs for your local backend server and video stream.</p><div class="mb-3"><label for="backend_url" class="form-label">Backend URL (from Port 8000 tunnel)</label><input type="url" class="form-control" id="backend_url" placeholder="https://<name>.lhr.life" required></div><div class="mb-3"><label for="stream_url" class="form-label">Video Stream URL (from Port 8888 tunnel)</label><input type="url" class="form-control" id="stream_url" placeholder="https://<name>.lhr.life" required></div><button class="btn btn-primary mb-3" onclick="generateLink()">Generate Install Link</button><div id="install-link-container" class="d-none"><hr><p class="lead mt-4">Copy the link below and paste it into the Stremio app's search bar.</p><div class="input-group"><input type="text" class="form-control" id="install_link" readonly><button class="btn btn-secondary" onclick="copyLink()">Copy</button></div></div></div><script>function generateLink(){const backendUrl=document.getElementById("backend_url").value,streamUrl=document.getElementById("stream_url").value;if(!backendUrl||!streamUrl){alert("Please fill in both URLs.");return}const config={backend_url:backendUrl,stream_url:streamUrl},encodedConfig=btoa(JSON.stringify(config)),installLink=window.location.protocol+"//"+window.location.host+"/"+encodedConfig+"/manifest.json";document.getElementById("install_link").value=installLink,document.getElementById("install-link-container").classList.remove("d-none")}function copyLink(){const t=document.getElementById("install_link");t.select(),t.setSelectionRange(0,99999);try{navigator.clipboard.writeText(t.value).then(()=>{alert("Install link copied!")})}catch(e){document.execCommand("copy"),alert("Install link copied!")}}</script></body></html>
`;

app.get('/configure', (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.send(configureHtml);
});

app.listen(ADDON_PORT, () => {
    console.log(`Vercel addon is running on port ${ADDON_PORT}`);
});
