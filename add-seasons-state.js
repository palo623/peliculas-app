const fs = require('fs');
let c = fs.readFileSync('public/js/bundle.js', 'utf8');

// Add seasons/episodes state and functions before openDetail in SeriesPage
const oldStr = '    };\r\n\r\n    const openDetail = async (serie) => {';

const newStr = '    };\r\n\r\n    // --- Seasons / Episodes modal ---\r\n    const seasonsState = React.useState([]);\r\n    const seasons = seasonsState[0];\r\n    const setSeasons = seasonsState[1];\r\n\r\n    const episodesState = React.useState([]);\r\n    const episodes = episodesState[0];\r\n    const setEpisodes = episodesState[1];\r\n\r\n    const selectedSeasonState = React.useState(null);\r\n    const selectedSeason = selectedSeasonState[0];\r\n    const setSelectedSeason = selectedSeasonState[1];\r\n\r\n    const seasonsLoadingState = React.useState(false);\r\n    const seasonsLoading = seasonsLoadingState[0];\r\n    const setSeasonsLoading = seasonsLoadingState[1];\r\n\r\n    const episodesLoadingState = React.useState(false);\r\n    const episodesLoading = episodesLoadingState[0];\r\n    const setEpisodesLoading = episodesLoadingState[1];\r\n\r\n    const loadSeasons = async (imdbID) => {\r\n        try {\r\n            setSeasonsLoading(true);\r\n            const res = await fetch("/api/series/seasons?imdbID=" + encodeURIComponent(imdbID), { headers: authHeaders() });\r\n            const data = await res.json();\r\n            if (!res.ok) throw new Error(data.error || "Error cargando temporadas");\r\n            setSeasons(data.seasons || []);\r\n            setSelectedSeason(null);\r\n            setEpisodes([]);\r\n        } catch (e) {\r\n            console.error(e);\r\n        } finally {\r\n            setSeasonsLoading(false);\r\n        }\r\n    };\r\n\r\n    const loadEpisodes = async (imdbID, seasonNumber) => {\r\n        try {\r\n            setEpisodesLoading(true);\r\n            const res = await fetch("/api/series/episodes?imdbID=" + encodeURIComponent(imdbID) + "&season=" + encodeURIComponent(seasonNumber), { headers: authHeaders() });\r\n            const data = await res.json();\r\n            if (!res.ok) throw new Error(data.error || "Error cargando episodios");\r\n            setEpisodes(data.episodes || []);\r\n        } catch (e) {\r\n            console.error(e);\r\n        } finally {\r\n            setEpisodesLoading(false);\r\n        }\r\n    };\r\n\r\n    const closeSeasonsModal = () => {\r\n        setSeasons([]);\r\n        setSelectedSeason(null);\r\n        setEpisodes([]);\r\n    };\r\n\r\nconst openDetail = async (serie) => {';

if (c.includes(oldStr)) {
    c = c.replace(oldStr, newStr);
    fs.writeFileSync('public/js/bundle.js', c, 'utf8');
    console.log('Added seasons/episodes state and functions');
} else {
    console.log('Old string not found');
}