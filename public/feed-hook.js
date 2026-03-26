/**
 * XHS Radar — Feed API interceptor.
 * Runs in page's MAIN world via <script src>.
 * Hooks window.fetch to capture XHS feed API responses
 * and extract note descriptions (desc field).
 * Communicates back to content script via window.postMessage.
 */
(function () {
  var originalFetch = window.fetch;

  window.fetch = function () {
    var args = arguments;
    var url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
    var promise = originalFetch.apply(this, args);

    // Only intercept XHS feed API calls
    if (url.indexOf('/api/sns/web/') !== -1 && (url.indexOf('feed') !== -1 || url.indexOf('homefeed') !== -1)) {
      promise.then(function (response) {
        // Clone to avoid consuming the original body
        response.clone().text().then(function (text) {
          try {
            var json = JSON.parse(text);
            var items = json && json.data && json.data.items;
            if (!items || !items.length) return;

            var mapped = [];
            for (var i = 0; i < items.length; i++) {
              var card = items[i].note_card;
              if (card && card.note_id) {
                mapped.push({
                  noteId: card.note_id,
                  desc: card.desc || '',
                  title: card.title || '',
                  author: (card.user && card.user.nickname) || '',
                  likeCount: (card.interact_info && card.interact_info.liked_count) || '0',
                });
              }
            }

            if (mapped.length > 0) {
              window.postMessage({ type: 'XHS_RADAR_FEED_DATA', items: mapped }, '*');
            }
          } catch (e) {
            // Silently ignore parse errors
          }
        }).catch(function () {});
      }).catch(function () {});
    }

    return promise;
  };
})();
