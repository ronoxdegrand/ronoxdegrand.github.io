
const rssUrl = 'https://api.rss2json.com/v1/api.json?rss_url=https://letterboxd.com/ronoxdegrand/rss/';

fetch(rssUrl)
    .then(response => response.json())
    .then(data => displayFeed(data))
    .catch(error => console.error('Error fetching JSON feed:', error));

function displayFeed(data) {
    const feedItems = data.items.slice(0, 4).map(item => {
        // Use thumbnail directly from API
        const image = item.thumbnail || '';
        // Extract watched date from description/content
        const watchedDateMatch = (item.description || item.content || '').match(/Watched on ([^<.]+)[<.]/);
        const watchedDate = watchedDateMatch ? watchedDateMatch[1].trim() : 'Unknown date';
        return {
            title: item.title,
            link: item.link,
            image,
            watchedDate
        };
    });

    const htmlContent = feedItems.map(item => `
        <a class="feed-item" href="${item.link}" target="_blank">
            <img class="thumbnail" src="${item.image}" alt="Poster">
            <div class="remaining">
                <div class="greyBack"></div>
                <img class="bg" src="${item.image}" alt="Blurred background">
                <div class="content">
                    <span>${item.title}</span>
                    <p>Watched on ${item.watchedDate}</p>
                </div>
            </div>
        </a>
    `).join('');

    document.getElementById('letterboxd').innerHTML = htmlContent;
}