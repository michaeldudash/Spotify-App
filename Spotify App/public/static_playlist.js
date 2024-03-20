const debounce = (func, delay) => {
    let debounceTimer
    return function () {
        const context = this
        const args = arguments
        clearTimeout(debounceTimer)
        debounceTimer = setTimeout(() => func.apply(context, args), delay)
    }
}

function showStartTypeSearch() {
    event.preventDefault();
    console.log('type: ' + $("#start-type").val());
    switch ($("#start-type").val()) {
        case 'artist':
            hideAllSearches();
            $("#start-artist-container").show();
            break;
        case 'track':
            hideAllSearches();
            $("#start-track-container").show();
            break;
        case 'genre':
            hideAllSearches();
            $("#start-genre-container").show();
            break;
    }
}

var showArtistSearchResults = debounce(function() {
    let artists = $.get('/artists/search', 
        { limit: 5, offset: 0, name: $("#start-artist").val() }, 
        function(data) {console.log('slkjdf')},
        'jsonp').done(function(data) {
                console.log("data***");
                console.log(data)
            }).always(function(data) {
                console.log("error");
                console.log(data);
        });

    for(let i=0;i<artists.length;i++) {
        let res = document.createElement('p');
        res.textContent = artists[i];
        $("#start-artist-search-results").append(res);
    }
}, 1000);

var loadFirstFifty = debounce(function() {
    console.log('upload data called');
    var firstFifty = $.get('/library');
    firstFifty.done(function(data) {
        console.log(data);
    });
}, 1000);

function hideAllSearches() {
    $("#start-artist-container").hide();
    $("#start-track-container").hide();
    $("#start-genre-container").hide();
}

$(document).ready(function () {
    hideAllSearches();
    showStartTypeSearch();
    $("#start-type").change(showStartTypeSearch);
    $("#start-artist").keyup(showArtistSearchResults);
});